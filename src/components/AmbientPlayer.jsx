import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Volume2, VolumeX } from 'lucide-react'

// Mount this ONCE in App.jsx, outside the routed page area -- it watches
// the route itself via useLocation rather than being conditionally
// rendered by a parent, which matters here: a true fade-out on leaving
// /about needs the component to stay mounted long enough to finish
// ramping volume to 0 before actually pausing. If a parent just did
// {isAbout && <AmbientPlayer/>}, React would unmount it instantly on
// route change and there'd be no time for the fade to play out.
//
// Drop your track at public/ambient-track.mp3 (or change TRACK_SRC).
const TRACK_SRC = '/ambient-track.mp3'
const FADE_MS = 1200
const TARGET_VOLUME = 0.5

export default function AmbientPlayer() {
  const location = useLocation()
  const isAbout = location.pathname === '/about'
  const audioRef = useRef(null)
  const fadeRafRef = useRef(null)
  // Incremented on every fadeTo() call. Each step() closure captures the
  // generation it was created under and bails if a newer fade has since
  // started -- this is what actually fixes the bug. Fast back/forward
  // navigation can fire two fadeTo() calls close enough together that a
  // stale rAF callback from the FIRST one is still in flight when the
  // SECOND one starts; without this guard, both loops write to the same
  // audio.volume using their own independent start/startTime, and the
  // resulting math can briefly go negative -- which audio.volume throws
  // a hard exception on instead of clamping, killing that rAF callback
  // and leaving the fade stuck forever (silence, no fade-in or fade-out).
  const fadeGenRef = useRef(0)
  const [isMuted, setIsMuted] = useState(false)
  const [visible, setVisible] = useState(false)

  function fadeTo(target, duration) {
    const audio = audioRef.current
    if (!audio) return
    if (fadeRafRef.current) cancelAnimationFrame(fadeRafRef.current)

    const myGen = ++fadeGenRef.current
    const start = audio.volume
    const startTime = performance.now()

    function step(now) {
      if (fadeGenRef.current !== myGen) return // superseded by a newer fade -- stop

      const t = Math.min(1, (now - startTime) / duration)
      const value = start + (target - start) * t
      // Defensive clamp: audio.volume THROWS on out-of-range values rather
      // than clamping itself, and float rounding during the interpolation
      // above can briefly produce something like -0.0019. Never let that
      // reach the assignment.
      audio.volume = Math.min(1, Math.max(0, value))

      if (t < 1) {
        fadeRafRef.current = requestAnimationFrame(step)
      } else if (target === 0) {
        audio.pause()
      }
    }
    fadeRafRef.current = requestAnimationFrame(step)
  }

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (isAbout) {
      setVisible(true)
      audio.volume = 0
      audio.muted = false
      // Entering /about is itself the result of a click (the nav badge or
      // drawer link) -- that click is the user gesture browsers require,
      // so play() here is allowed without the mute-first workaround a
      // true cold-page-load autoplay would need.
      audio.play()
        .then(() => fadeTo(TARGET_VOLUME, FADE_MS))
        .catch(() => {
          // Blocked anyway (rare) -- widget stays visible, click it to start manually.
        })
    } else {
      fadeTo(0, FADE_MS)
      setVisible(false)
    }

    return () => {
      if (fadeRafRef.current) cancelAnimationFrame(fadeRafRef.current)
    }
  }, [isAbout])

  function toggleMute() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      audio.volume = 0
      audio.muted = false
      audio.play().then(() => fadeTo(TARGET_VOLUME, FADE_MS)).catch(() => {})
      setIsMuted(false)
      return
    }
    audio.muted = !audio.muted
    setIsMuted(audio.muted)
  }

  return (
    <div className={`ambient-player ${visible ? 'is-visible' : 'is-hidden'}`}>
      <audio ref={audioRef} src={TRACK_SRC} loop preload="auto" />
      <button
        type="button"
        className="ambient-player-btn"
        onClick={toggleMute}
        aria-label={isMuted ? 'Unmute background music' : 'Mute background music'}
        aria-pressed={!isMuted}
        tabIndex={visible ? 0 : -1}
      >
        {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        <span className="ambient-player-bars" aria-hidden="true">
          <span /><span /><span />
        </span>
      </button>
    </div>
  )
}
