import { useRef, useState, useCallback, useEffect } from 'react'
import { io } from 'socket.io-client'
import { API_BASE } from '../config/api'

export function useVideoCall() {
  const [status, setStatusState] = useState({ msg: 'Start a call, or join one with a code.', type: 'idle' })
  const [roomCode, setRoomCode] = useState(null)
  const [connectionState, setConnectionState] = useState('idle')
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(false)
  const [remoteCamOn, setRemoteCamOn] = useState(false)
  const [callSeconds, setCallSeconds] = useState(0)
  const [remoteName, setRemoteName] = useState(null)

  const socketRef = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const peerIdRef = useRef(null)
  const roleRef = useRef(null)
  const timerRef = useRef(null)

  const setStatus = useCallback((msg, type = 'idle') => setStatusState({ msg, type }), [])

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

  function startTimer() { stopTimer(); timerRef.current = setInterval(() => setCallSeconds((s) => s + 1), 1000) }
  function stopTimer() { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }

  async function attachLocalMedia(pc) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: true
    })
    stream.getVideoTracks().forEach((t) => { t.enabled = false }) // camera starts off, same pattern as the games' voice/video hook
    localStreamRef.current = stream
    if (localVideoRef.current) localVideoRef.current.srcObject = stream
    stream.getTracks().forEach((track) => pc.addTrack(track, stream))
  }

  const teardown = useCallback((resetState = true) => {
    stopTimer()
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
    if (pcRef.current) { try { pcRef.current.close() } catch {} pcRef.current = null }
    if (socketRef.current) { socketRef.current.emit('video:leave-room'); socketRef.current.disconnect(); socketRef.current = null }
    peerIdRef.current = null
    roleRef.current = null
    if (resetState) {
      setRoomCode(null)
      setCallSeconds(0)
      setMicOn(true)
      setCamOn(false)
      setRemoteCamOn(false)
      setRemoteName(null)
      setConnectionState('idle')
      setStatus('Start a call, or join one with a code.', 'idle')
    }
  }, [setStatus])

  const createPeerConnection = useCallback(async () => {
    const pc = new RTCPeerConnection({ iceServers: await fetchIceServers() })
    pcRef.current = pc

    pc.onicecandidate = (e) => {
      if (e.candidate && socketRef.current && peerIdRef.current) {
        socketRef.current.emit('rtc:ice-candidate', { to: peerIdRef.current, candidate: e.candidate })
      }
    }

    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0]
      const track = e.track
      if (track.kind === 'video') {
        const updateEnabled = () => setRemoteCamOn(!track.muted)
        updateEnabled()
        track.onmute = updateEnabled
        track.onunmute = updateEnabled
      }
    }

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState
      if (state === 'connected' || state === 'completed') {
        setConnectionState('connected')
        setStatus('Connected.', 'success')
        startTimer()
      } else if (state === 'disconnected' || state === 'failed') {
        setStatus('Connection unstable — attempting to reconnect…', 'idle')
        stopTimer()
        if (roleRef.current === 'host' && state === 'failed') {
          try { pc.restartIce() } catch (err) { console.warn('ICE restart failed', err) }
        }
      } else if (state === 'closed') {
        setConnectionState('ended')
        stopTimer()
      }
    }

    if (roleRef.current === 'host') {
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          socketRef.current.emit('rtc:offer', { to: peerIdRef.current, sdp: pc.localDescription })
        } catch (err) { console.warn('negotiation failed', err) }
      }
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

    socket.on('video:room-created', ({ code }) => {
      setRoomCode(code)
      setConnectionState('waiting')
      setStatus('Waiting for the other person to join…', 'idle')
    })

    socket.on('video:room-error', ({ reason }) => {
      setStatus(reason === 'not-found' ? 'That code was not found or has expired.' : 'That code has already been used.', 'error')
      setConnectionState('error')
    })

    socket.on('video:room-joined', async ({ peerId, peerName }) => {
      peerIdRef.current = peerId
      setRemoteName(peerName)
      setConnectionState('connecting')
      setStatus('Joined! Setting up the call…', 'idle')
      const pc = await ensurePeerConnection()
      await attachLocalMedia(pc)
    })

    socket.on('video:peer-joined', async ({ peerId, peerName }) => {
      peerIdRef.current = peerId
      setRemoteName(peerName)
      setConnectionState('connecting')
      setStatus('The other person joined! Setting up the call…', 'idle')
      const pc = await ensurePeerConnection()
      await attachLocalMedia(pc)
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

    socket.on('video:peer-left', () => {
      setStatus('The other person left the call.', 'idle')
      setConnectionState('ended')
      teardown(false)
    })

    socket.on('video:rate-limited', ({ action }) => {
      setStatus(action === 'create-room'
        ? 'Too many calls started too quickly. Wait a minute and try again.'
        : 'Too many attempts too quickly. Wait a minute and try again.', 'error')
    })

    return socket
  }, [ensurePeerConnection, setStatus, teardown])

  const startCall = useCallback((name) => {
    roleRef.current = 'host'
    const socket = connectSocket()
    socket.emit('video:create-room', { name })
  }, [connectSocket])

  const answerCall = useCallback((code, name) => {
    roleRef.current = 'guest'
    const socket = connectSocket()
    socket.emit('video:join-room', { code, name })
  }, [connectSocket])

  const toggleMic = useCallback(() => {
    setMicOn((prev) => {
      const next = !prev
      localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = next })
      return next
    })
  }, [])

  const toggleCam = useCallback(() => {
    setCamOn((prev) => {
      const next = !prev
      localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = next })
      return next
    })
  }, [])

  useEffect(() => {
    const handler = () => teardown()
    window.addEventListener('beforeunload', handler)
    return () => { window.removeEventListener('beforeunload', handler); teardown() }
  }, [teardown])

  return {
    status, roomCode, connectionState, micOn, camOn, remoteCamOn, callSeconds, remoteName,
    localVideoRef, remoteVideoRef, startCall, answerCall, toggleMic, toggleCam, teardown
  }
}