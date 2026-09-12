import { useEffect, useRef, useState, useCallback } from 'react';

// TURN credentials are environment-specific and shouldn't live in source --
// set these in your .env if you have a coturn/paid TURN server. STUN-only
// works fine on the same network or lucky NAT types, but cross-network
// calls generally need a real TURN server to connect reliably.
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  ...(import.meta.env.VITE_TURN_URL
    ? [{
        urls: import.meta.env.VITE_TURN_URL,
        username: import.meta.env.VITE_TURN_USERNAME,
        credential: import.meta.env.VITE_TURN_CREDENTIAL,
      }]
    : []),
];

// Mesh voice/video for a Ludo room. Signaling rides the same socket as the
// game (rtc:* events, handled server-side by the game-agnostic rtcSocket.js
// -- nothing there needs to change for this). `enabled` should be true for
// as long as the player is inside an online room (lobby or in-game).
export function useWebRTC({ socket, roomCode, enabled }) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map()); // peerId -> MediaStream
  const [remoteVideoEnabled, setRemoteVideoEnabled] = useState(new Map()); // peerId -> bool
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [mediaError, setMediaError] = useState('');

  const localStreamRef = useRef(null); // mirrors localStream for use inside socket callbacks (avoids stale closures)
  const peersRef = useRef(new Map()); // peerId -> RTCPeerConnection

  const createPeerConnection = useCallback((peerId, isInitiator) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peersRef.current.set(peerId, pc);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) socket.emit('rtc:ice-candidate', { to: peerId, candidate: event.candidate });
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      setRemoteStreams((prev) => new Map(prev).set(peerId, stream));
      const track = event.track;
      if (track.kind === 'video') {
        const updateEnabled = () => setRemoteVideoEnabled((prev) => new Map(prev).set(peerId, !track.muted));
        updateEnabled();
        track.onmute = updateEnabled;
        track.onunmute = updateEnabled;
      }
    };

    // Only the initiator drives renegotiation -- both sides get their tracks
    // added up front (see the eager-acquire effect below), so in practice
    // this fires once, right after creation, to make the initial offer.
    if (isInitiator) {
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('rtc:offer', { to: peerId, sdp: pc.localDescription });
        } catch {
          setMediaError('Could not start the call with a peer.');
        }
      };
    }

    return pc;
  }, [socket]);

  const removePeer = useCallback((peerId) => {
    const pc = peersRef.current.get(peerId);
    if (pc) { pc.close(); peersRef.current.delete(peerId); }
    setRemoteStreams((prev) => { if (!prev.has(peerId)) return prev; const next = new Map(prev); next.delete(peerId); return next; });
    setRemoteVideoEnabled((prev) => { if (!prev.has(peerId)) return prev; const next = new Map(prev); next.delete(peerId); return next; });
  }, []);

  // Eagerly acquire both tracks once WebRTC turns on for this room. Both
  // start disabled except mic -- see the note at the top of this file for
  // why eager-acquire-then-toggle beats lazy-acquire-on-first-click here.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      .catch(() =>
        navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          .then((s) => { setMediaError('Camera unavailable — audio only.'); return s; })
      )
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        stream.getVideoTracks().forEach((t) => { t.enabled = false; }); // camera starts off
        localStreamRef.current = stream;
        setLocalStream(stream);
        setMicOn(true);
      })
      .catch(() => setMediaError('Microphone and camera access was blocked or unavailable.'));
    return () => { cancelled = true; };
  }, [enabled]);

  // Signaling -- bind while enabled, tear down (including all peer
  // connections) the moment the player leaves the room.
  useEffect(() => {
    if (!enabled || !socket || !roomCode) return;

    function handleNewPeer({ peerId }) { createPeerConnection(peerId, true); }

    function handleOffer({ from, sdp }) {
      const pc = peersRef.current.get(from) || createPeerConnection(from, false);
      pc.setRemoteDescription(sdp)
        .then(() => pc.createAnswer())
        .then((answer) => pc.setLocalDescription(answer))
        .then(() => socket.emit('rtc:answer', { to: from, sdp: pc.localDescription }))
        .catch(() => setMediaError('Could not answer a peer.'));
    }

    function handleAnswer({ from, sdp }) {
      peersRef.current.get(from)?.setRemoteDescription(sdp).catch(() => {});
    }

    function handleIceCandidate({ from, candidate }) {
      if (candidate) peersRef.current.get(from)?.addIceCandidate(candidate).catch(() => {});
    }

    function handlePeerLeft({ peerId }) { removePeer(peerId); }

    socket.on('rtc:new-peer', handleNewPeer);
    socket.on('rtc:offer', handleOffer);
    socket.on('rtc:answer', handleAnswer);
    socket.on('rtc:ice-candidate', handleIceCandidate);
    socket.on('rtc:peer-left', handlePeerLeft);
    socket.emit('rtc:ready', { roomCode });

    return () => {
      socket.off('rtc:new-peer', handleNewPeer);
      socket.off('rtc:offer', handleOffer);
      socket.off('rtc:answer', handleAnswer);
      socket.off('rtc:ice-candidate', handleIceCandidate);
      socket.off('rtc:peer-left', handlePeerLeft);
      socket.emit('rtc:leave');
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      setRemoteStreams(new Map());
      setRemoteVideoEnabled(new Map());
    };
  }, [enabled, socket, roomCode, createPeerConnection, removePeer]);

  // Fully release the camera/mic once WebRTC turns off (left the room).
  useEffect(() => {
    if (enabled) return;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
  }, [enabled]);

  const toggleMic = useCallback(() => {
    setMicOn((prev) => {
      const next = !prev;
      localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = next; });
      return next;
    });
  }, []);

  const toggleCam = useCallback(() => {
    setCamOn((prev) => {
      const next = !prev;
      localStreamRef.current?.getVideoTracks().forEach((t) => { t.enabled = next; });
      return next;
    });
  }, []);

  return { localStream, remoteStreams, remoteVideoEnabled, micOn, camOn, toggleMic, toggleCam, mediaError };
}
