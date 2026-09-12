import { useRef, useState, useCallback, useEffect } from 'react'
import { io } from 'socket.io-client'
import { API_BASE } from '../config/api' // adjust this import path if API_BASE lives elsewhere in your actual tree

const CHUNK_SIZE = 64 * 1024
const BUFFER_HIGH_WATER = 4 * 1024 * 1024
const BUFFER_LOW_WATER = 1 * 1024 * 1024
export const FALLBACK_MAX_SIZE = 1 * 1024 * 1024 * 1024

export const supportsFileSystemAccess = typeof window !== 'undefined' && 'showSaveFilePicker' in window

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function useFileShare() {
  const [status, setStatusState] = useState({ msg: 'Add files, then generate a code to share.', type: 'idle' })
  const [progress, setProgress] = useState(0)
  const [roomCode, setRoomCode] = useState(null)
  const [currentFileLabel, setCurrentFileLabel] = useState('—')
  const [fileCountLabel, setFileCountLabel] = useState('0 / 0')
  const [connectionState, setConnectionState] = useState('idle') // idle | waiting | connecting | connected | done | error

  const socketRef = useRef(null)
  const pcRef = useRef(null)
  const dataChannelRef = useRef(null)
  const peerIdRef = useRef(null)
  const roleRef = useRef(null)
  const queuedFilesRef = useRef([])
  const downloadDirHandleRef = useRef(null)
  const readyResolversRef = useRef(new Map())
  const currentManifestRef = useRef(null)
  const receivedBytesRef = useRef(0)
  const writableStreamRef = useRef(null)
  const memoryChunksRef = useRef([])

  const setStatus = useCallback((msg, type = 'idle') => setStatusState({ msg, type }), [])

  async function fetchIceServers() {
    const stunOnly = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
    try {
      const res = await fetch(`${API_BASE}/api/turn-credentials`)
      if (!res.ok) throw new Error(`TURN fetch failed: ${res.status}`)
      const data = await res.json()
      return [...stunOnly, ...data.iceServers]
    } catch (err) {
      console.warn('Could not fetch TURN credentials, continuing with STUN only:', err)
      return stunOnly
    }
  }

  function wireDataChannel(channel) {
    channel.binaryType = 'arraybuffer'
    if (roleRef.current === 'sender') {
      channel.onopen = () => sendAllFiles()
      channel.onmessage = (e) => handleSenderControlMessage(e.data)
    } else {
      channel.onmessage = (e) => handleIncomingMessage(e.data)
    }
    channel.onclose = () => setStatus('Transfer channel closed.', 'idle')
  }

  const createPeerConnection = useCallback(async () => {
    const pc = new RTCPeerConnection({ iceServers: await fetchIceServers() })
    pcRef.current = pc

    pc.onicecandidate = (e) => {
      if (e.candidate && socketRef.current && peerIdRef.current) {
        socketRef.current.emit('rtc:ice-candidate', { to: peerIdRef.current, candidate: e.candidate })
      }
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setConnectionState('connected')
        setStatus('Connected directly, peer-to-peer.', 'success')
      } else if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        setConnectionState('error')
        setStatus('Connection lost.', 'error')
      }
    }
    // Only fires for the receiver (sender creates its own channel via createDataChannel) — harmless to set unconditionally.
    pc.ondatachannel = (e) => {
      dataChannelRef.current = e.channel
      wireDataChannel(e.channel)
    }
    return pc
  }, [])

  const ensurePeerConnection = useCallback(async () => {
    if (!pcRef.current) await createPeerConnection()
    return pcRef.current
  }, [createPeerConnection])

  const connectSocket = useCallback(() => {
    if (socketRef.current) return socketRef.current
    const socket = io(API_BASE, { transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('connect_error', () => setStatus('Could not reach the server. Try again in a moment.', 'error'))

    socket.on('fileshare:room-created', ({ code }) => {
      setRoomCode(code)
      setConnectionState('waiting')
      setStatus('Waiting for someone to enter this code…', 'idle')
    })

    socket.on('fileshare:room-error', ({ reason }) => {
      setStatus(reason === 'not-found' ? 'That code was not found or has expired.' : 'That code has already been used.', 'error')
    })

    socket.on('fileshare:room-joined', async ({ peerId }) => {
      peerIdRef.current = peerId
      setConnectionState('connecting')
      setStatus('Connected to sender. Waiting for the connection to open…', 'idle')
      await ensurePeerConnection()
    })

    socket.on('fileshare:peer-joined', async ({ peerId }) => {
      peerIdRef.current = peerId
      setConnectionState('connecting')
      setStatus('Someone joined! Setting up a secure connection…', 'idle')
      await startSenderConnection()
    })

    socket.on('rtc:offer', async ({ from, sdp }) => {
      peerIdRef.current = from
      const pc = await ensurePeerConnection()
      await pc.setRemoteDescription(new RTCSessionDescription(sdp))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      socket.emit('rtc:answer', { to: from, sdp: pc.localDescription })
    })

    socket.on('rtc:answer', async ({ sdp }) => {
      await pcRef.current?.setRemoteDescription(new RTCSessionDescription(sdp))
    })

    socket.on('rtc:ice-candidate', async ({ candidate }) => {
      if (!candidate) return
      try { await pcRef.current?.addIceCandidate(candidate) } catch (err) { console.warn('ICE add failed', err) }
    })

    socket.on('fileshare:peer-left', () => {
      setStatus('The other side disconnected.', 'error')
      teardown()
    })

    socket.on('fileshare:rate-limited', ({ action }) => {
      setStatus(action === 'create-room'
        ? 'Too many codes generated too quickly. Wait a minute and try again.'
        : 'Too many attempts too quickly. Wait a minute and try again.', 'error')
    })

    return socket
  }, [ensurePeerConnection, setStatus])

  // ---- SENDER ----
  const createRoom = useCallback((files) => {
    roleRef.current = 'sender'
    queuedFilesRef.current = files
    const socket = connectSocket()
    socket.emit('fileshare:create-room')
  }, [connectSocket])

  async function startSenderConnection() {
    const pc = await ensurePeerConnection()
    const channel = pc.createDataChannel('file-transfer', { ordered: true })
    channel.bufferedAmountLowThreshold = BUFFER_LOW_WATER
    dataChannelRef.current = channel
    wireDataChannel(channel)

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    socketRef.current.emit('rtc:offer', { to: peerIdRef.current, sdp: pc.localDescription })
  }

  async function sendAllFiles() {
    const files = queuedFilesRef.current
    setFileCountLabel(`0 / ${files.length}`)
    for (let i = 0; i < files.length; i++) {
      setCurrentFileLabel(files[i].name)
      setFileCountLabel(`${i + 1} / ${files.length}`)
      await sendOneFile(files[i], i, files.length)
    }
    dataChannelRef.current.send(JSON.stringify({ type: 'all-done' }))
    setStatus('All files sent. You can close this tab.', 'success')
    setProgress(100)
    setConnectionState('done')
  }

  function waitForReceiverReady(fileIndex) {
    return new Promise((resolve) => readyResolversRef.current.set(fileIndex, resolve))
  }

  function handleSenderControlMessage(data) {
    if (typeof data !== 'string') return
    const msg = JSON.parse(data)
    if (msg.type === 'receiver-ready') {
      const resolve = readyResolversRef.current.get(msg.fileIndex)
      if (resolve) { resolve(); readyResolversRef.current.delete(msg.fileIndex) }
    }
  }

  async function sendOneFile(file, index, total) {
    const channel = dataChannelRef.current
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE)

    channel.send(JSON.stringify({ type: 'manifest', name: file.name, size: file.size, mime: file.type || 'application/octet-stream', totalChunks, fileIndex: index, totalFiles: total }))
    await waitForReceiverReady(index)

    const reader = file.stream().getReader()
    let seq = 0, sentBytes = 0, buffer = new Uint8Array(0)

    const readChunk = async () => {
      while (buffer.length < CHUNK_SIZE) {
        const { done, value } = await reader.read()
        if (done) break
        const merged = new Uint8Array(buffer.length + value.length)
        merged.set(buffer, 0); merged.set(value, buffer.length)
        buffer = merged
      }
      if (buffer.length === 0) return null
      const take = Math.min(CHUNK_SIZE, buffer.length)
      const chunk = buffer.slice(0, take)
      buffer = buffer.slice(take)
      return chunk
    }

    const waitForDrain = () => new Promise((resolve) => { channel.onbufferedamountlow = () => resolve() })

    let chunk
    while ((chunk = await readChunk()) !== null) {
      if (channel.bufferedAmount > BUFFER_HIGH_WATER) await waitForDrain()
      const framed = new Uint8Array(4 + chunk.length)
      new DataView(framed.buffer).setUint32(0, seq, false)
      framed.set(chunk, 4)
      channel.send(framed.buffer)
      seq++; sentBytes += chunk.length
      setProgress((sentBytes / file.size) * 100)
    }
    channel.send(JSON.stringify({ type: 'file-complete', fileIndex: index }))
  }

  // ---- RECEIVER ----
  const joinRoom = useCallback(async (code) => {
    roleRef.current = 'receiver'

    if (supportsFileSystemAccess) {
      try {
        downloadDirHandleRef.current = await window.showDirectoryPicker()
      } catch (err) {
        downloadDirHandleRef.current = null
        if (err.name === 'AbortError') {
          setStatus('That folder is protected — pick (or create) a subfolder inside it instead. Using browser downloads for now.', 'idle')
        }
      }
    }

    const socket = connectSocket()
    socket.emit('fileshare:join-room', { code })
    await ensurePeerConnection()
  }, [connectSocket, ensurePeerConnection, setStatus])

  async function handleIncomingMessage(data) {
    if (typeof data === 'string') {
      const msg = JSON.parse(data)

      if (msg.type === 'manifest') {
        currentManifestRef.current = msg
        receivedBytesRef.current = 0
        memoryChunksRef.current = []
        setCurrentFileLabel(msg.name)
        setFileCountLabel(`${msg.fileIndex + 1} / ${msg.totalFiles}`)
        setStatus(`Receiving "${msg.name}" (${formatBytes(msg.size)})…`, 'idle')

        writableStreamRef.current = null
        if (downloadDirHandleRef.current) {
          try {
            const fileHandle = await downloadDirHandleRef.current.getFileHandle(msg.name, { create: true })
            writableStreamRef.current = await fileHandle.createWritable()
          } catch { writableStreamRef.current = null }
        }
        dataChannelRef.current.send(JSON.stringify({ type: 'receiver-ready', fileIndex: msg.fileIndex }))

      } else if (msg.type === 'file-complete') {
        const manifest = currentManifestRef.current
        if (writableStreamRef.current) {
          await writableStreamRef.current.close()
          writableStreamRef.current = null
        } else if (memoryChunksRef.current.length) {
          const blob = new Blob(memoryChunksRef.current, { type: manifest.mime })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url; a.download = manifest.name; a.click()
          URL.revokeObjectURL(url)
        }
        const complete = receivedBytesRef.current === manifest.size
        setStatus(complete ? `"${manifest.name}" received and saved.` : `Warning: "${manifest.name}" may be incomplete (size mismatch).`, complete ? 'success' : 'error')

      } else if (msg.type === 'all-done') {
        setStatus('All files received. Transfer complete.', 'success')
        setProgress(100)
        setConnectionState('done')
      }
      return
    }

    const view = new DataView(data)
    const chunk = data.slice(4)
    receivedBytesRef.current += chunk.byteLength

    if (writableStreamRef.current) {
      await writableStreamRef.current.write(chunk)
    } else {
      memoryChunksRef.current.push(chunk)
    }
    if (currentManifestRef.current) {
      setProgress((receivedBytesRef.current / currentManifestRef.current.size) * 100)
    }
  }

  const teardown = useCallback(() => {
    if (dataChannelRef.current) { try { dataChannelRef.current.close() } catch {} dataChannelRef.current = null }
    if (pcRef.current) { try { pcRef.current.close() } catch {} pcRef.current = null }
    if (socketRef.current) { socketRef.current.emit('fileshare:leave-room'); socketRef.current.disconnect(); socketRef.current = null }
    currentManifestRef.current = null
    writableStreamRef.current = null
    memoryChunksRef.current = []
    peerIdRef.current = null
    roleRef.current = null
    setRoomCode(null)
    setProgress(0)
    setConnectionState('idle')
  }, [])

  useEffect(() => {
    const handler = () => teardown()
    window.addEventListener('beforeunload', handler)
    return () => { window.removeEventListener('beforeunload', handler); teardown() }
  }, [teardown])

  return {
    status, progress, roomCode, currentFileLabel, fileCountLabel, connectionState,
    createRoom, joinRoom, teardown, setStatus, setProgress
  }
}