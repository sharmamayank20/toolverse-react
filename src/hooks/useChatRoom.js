import { useRef, useState, useCallback, useEffect } from 'react'
import { io } from 'socket.io-client'
import { API_BASE } from '../config/api'

export const MAX_CHAT_FILE_SIZE = 20 * 1024 * 1024 // mesh fan-out uploads this once PER other person in the room
const CHUNK_SIZE = 64 * 1024
const BUFFER_HIGH_WATER = 2 * 1024 * 1024

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

export function useChatRoom() {
  const [status, setStatusState] = useState({ msg: 'Create a room, or join one with a code.', type: 'idle' })
  const [roomCode, setRoomCode] = useState(null)
  const [connectionState, setConnectionState] = useState('idle') // idle | in-room | error
  const [members, setMembers] = useState([]) // [{peerId, name}] -- excludes self
  const [messages, setMessages] = useState([])

  const socketRef = useRef(null)
  const selfIdRef = useRef(null)
  const selfNameRef = useRef(null)
  const peersRef = useRef(new Map())      // peerId -> { pc, channel }
  const nameByPeerRef = useRef(new Map()) // peerId -> name
  const incomingFilesRef = useRef(new Map()) // `${peerId}:${fileId}` -> { meta, chunks, receivedBytes }

  const setStatus = useCallback((msg, type = 'idle') => setStatusState({ msg, type }), [])
  const addMessage = useCallback((msg) => setMessages((prev) => [...prev, msg]), [])
  const patchMessage = useCallback((id, patch) => setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m))), [])
  const addSystem = useCallback((text) => addMessage({ id: genId(), type: 'system', text, ts: Date.now() }), [addMessage])

  async function fetchIceServers() {
    const stunOnly = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]
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

  function wireChannel(peerId, channel) {
    channel.binaryType = 'arraybuffer'
    const entry = peersRef.current.get(peerId)
    if (entry) entry.channel = channel
    channel.onmessage = (e) => handleChannelMessage(peerId, e.data)
  }

  async function createPeerConnectionForPeer(peerId, isInitiator) {
    const pc = new RTCPeerConnection({ iceServers: await fetchIceServers() })
    peersRef.current.set(peerId, { pc, channel: null })

    pc.onicecandidate = (e) => {
      if (e.candidate) socketRef.current?.emit('rtc:ice-candidate', { to: peerId, candidate: e.candidate })
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && isInitiator) {
        try { pc.restartIce() } catch {}
      }
    }
    pc.ondatachannel = (e) => wireChannel(peerId, e.channel)

    if (isInitiator) {
      const channel = pc.createDataChannel('chat')
      wireChannel(peerId, channel)
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          socketRef.current.emit('rtc:offer', { to: peerId, sdp: pc.localDescription })
        } catch (err) { console.warn('negotiation failed', err) }
      }
    }
    return pc
  }

  function removePeer(peerId) {
    const entry = peersRef.current.get(peerId)
    if (entry) { try { entry.pc.close() } catch {} peersRef.current.delete(peerId) }
    nameByPeerRef.current.delete(peerId)
  }

  // NOTE: this assumes one active incoming file per peer at a time, which
  // keeps the protocol simple -- fine for a chat tool's attachment use case.
  function handleChannelMessage(peerId, data) {
    const name = nameByPeerRef.current.get(peerId) || 'Someone'

    if (typeof data === 'string') {
      const msg = JSON.parse(data)
      if (msg.type === 'text') {
        addMessage({ id: msg.id, type: 'text', from: peerId, name, text: msg.text, ts: msg.ts })
      } else if (msg.type === 'file-meta') {
        incomingFilesRef.current.set(`${peerId}:${msg.fileId}`, { meta: msg, chunks: [], receivedBytes: 0 })
        addMessage({ id: msg.fileId, type: 'file', from: peerId, name, fileName: msg.name, fileSize: msg.size, mime: msg.mime, progress: 0, done: false, ts: Date.now() })
      } else if (msg.type === 'file-complete') {
        const key = `${peerId}:${msg.fileId}`
        const entry = incomingFilesRef.current.get(key)
        if (!entry) return
        const blob = new Blob(entry.chunks, { type: entry.meta.mime })
        patchMessage(msg.fileId, { progress: 100, done: true, blobUrl: URL.createObjectURL(blob) })
        incomingFilesRef.current.delete(key)
      }
      return
    }

    for (const [key, entry] of incomingFilesRef.current.entries()) {
      if (!key.startsWith(`${peerId}:`)) continue
      entry.chunks.push(data)
      entry.receivedBytes += data.byteLength
      patchMessage(entry.meta.fileId, { progress: Math.min(100, Math.round((entry.receivedBytes / entry.meta.size) * 100)) })
      break
    }
  }

  const connectSocket = useCallback(() => {
    if (socketRef.current) return socketRef.current
    const socket = io(API_BASE, { transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('connect_error', () => setStatus('Could not reach the server. Try again in a moment.', 'error'))

    socket.on('chat:room-created', ({ code, self }) => {
      selfIdRef.current = self.peerId
      selfNameRef.current = self.name
      setRoomCode(code)
      setConnectionState('in-room')
      addSystem('Room created. Waiting for others to join…')
      socket.emit('rtc:ready', { roomCode: code })
    })

    socket.on('chat:room-joined', ({ code, members: existingMembers, self }) => {
      selfIdRef.current = self.peerId
      selfNameRef.current = self.name
      existingMembers.forEach((m) => nameByPeerRef.current.set(m.peerId, m.name))
      setMembers(existingMembers)
      setRoomCode(code)
      setConnectionState('in-room')
      addSystem('You joined the chat.')
      socket.emit('rtc:ready', { roomCode: code })
    })

    socket.on('chat:room-error', ({ reason }) => {
      setStatus(reason === 'room-full' ? 'That room already has the maximum of 4 people.' : 'That code was not found or has expired.', 'error')
    })

    socket.on('chat:member-joined', ({ peerId, name }) => {
      nameByPeerRef.current.set(peerId, name)
      setMembers((prev) => [...prev, { peerId, name }])
      addSystem(`${name} joined the chat.`)
    })

    socket.on('chat:member-left', ({ peerId, name }) => {
      removePeer(peerId)
      setMembers((prev) => prev.filter((m) => m.peerId !== peerId))
      addSystem(`${name || 'Someone'} left the chat.`)
    })

    socket.on('chat:rate-limited', ({ action }) => {
      setStatus(action === 'create-room' ? 'Too many rooms created too quickly. Wait a minute and try again.' : 'Too many attempts too quickly. Wait a minute and try again.', 'error')
    })

    socket.on('rtc:new-peer', async ({ peerId }) => { await createPeerConnectionForPeer(peerId, true) })

    socket.on('rtc:offer', async ({ from, sdp }) => {
      if (!nameByPeerRef.current.has(from)) nameByPeerRef.current.set(from, 'Someone')
      const entry = peersRef.current.get(from)
      const pc = entry ? entry.pc : await createPeerConnectionForPeer(from, false)
      await pc.setRemoteDescription(new RTCSessionDescription(sdp))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      socket.emit('rtc:answer', { to: from, sdp: pc.localDescription })
    })

    socket.on('rtc:answer', async ({ from, sdp }) => {
      await peersRef.current.get(from)?.pc.setRemoteDescription(new RTCSessionDescription(sdp))
    })

    socket.on('rtc:ice-candidate', async ({ from, candidate }) => {
      if (!candidate) return
      try { await peersRef.current.get(from)?.pc.addIceCandidate(candidate) } catch (err) { console.warn('ICE add failed', err) }
    })

    return socket
  }, [addSystem, setStatus])

  const createRoom = useCallback((name) => { connectSocket().emit('chat:create-room', { name }) }, [connectSocket])
  const joinRoom = useCallback((code, name) => { connectSocket().emit('chat:join-room', { code, name }) }, [connectSocket])

  const sendText = useCallback((text) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const id = genId()
    const ts = Date.now()
    const payload = JSON.stringify({ type: 'text', id, text: trimmed, ts })
    peersRef.current.forEach(({ channel }) => { if (channel?.readyState === 'open') channel.send(payload) })
    addMessage({ id, type: 'text', from: 'me', name: selfNameRef.current, text: trimmed, ts })
  }, [addMessage])

  async function sendFileOverChannel(channel, fileId, file, buffer) {
    channel.send(JSON.stringify({ type: 'file-meta', fileId, name: file.name, size: file.size, mime: file.type || 'application/octet-stream' }))
    const waitForDrain = () => new Promise((resolve) => { channel.onbufferedamountlow = () => resolve() })
    let offset = 0
    while (offset < buffer.length) {
      if (channel.bufferedAmount > BUFFER_HIGH_WATER) await waitForDrain()
      const chunk = buffer.slice(offset, offset + CHUNK_SIZE)
      channel.send(chunk.buffer)
      offset += CHUNK_SIZE
    }
    channel.send(JSON.stringify({ type: 'file-complete', fileId }))
  }

  const sendFile = useCallback(async (file) => {
    if (file.size > MAX_CHAT_FILE_SIZE) {
      setStatus(`"${file.name}" is over the ${formatBytes(MAX_CHAT_FILE_SIZE)} limit for chat attachments.`, 'error')
      return
    }
    const fileId = genId()
    const buffer = new Uint8Array(await file.arrayBuffer())
    addMessage({ id: fileId, type: 'file', from: 'me', name: selfNameRef.current, fileName: file.name, fileSize: file.size, mime: file.type, progress: 100, done: true, blobUrl: URL.createObjectURL(file), ts: Date.now() })

    const sends = []
    peersRef.current.forEach(({ channel }) => { if (channel?.readyState === 'open') sends.push(sendFileOverChannel(channel, fileId, file, buffer)) })
    await Promise.all(sends)
  }, [addMessage, setStatus])

  const leaveRoom = useCallback(() => {
    peersRef.current.forEach(({ pc }) => { try { pc.close() } catch {} })
    peersRef.current.clear()
    nameByPeerRef.current.clear()
    incomingFilesRef.current.clear()
    if (socketRef.current) { socketRef.current.emit('chat:leave-room'); socketRef.current.disconnect(); socketRef.current = null }
    setRoomCode(null)
    setMembers([])
    setMessages([])
    setConnectionState('idle')
    setStatus('Create a room, or join one with a code.', 'idle')
  }, [setStatus])

  useEffect(() => {
    const handler = () => leaveRoom()
    window.addEventListener('beforeunload', handler)
    return () => { window.removeEventListener('beforeunload', handler); leaveRoom() }
  }, [leaveRoom])

  return { status, roomCode, connectionState, members, messages, createRoom, joinRoom, sendText, sendFile, leaveRoom, selfId: selfIdRef.current }
}