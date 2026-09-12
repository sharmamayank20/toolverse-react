import { useState, useEffect } from 'react'
import { Keyboard, Laptop } from 'lucide-react'

// Screen width alone is unreliable here — plenty of tablets and phones in
// landscape report widths well over typical "mobile" breakpoints. The much
// more robust signal is pointer type: `(pointer: fine)` reflects whether the
// device's PRIMARY input is precise (mouse/trackpad) or coarse (touch),
// which is what actually distinguishes "has a real keyboard" hardware from
// "is a phone/tablet" — regardless of window size. Combining it with a width
// check as a secondary guard avoids edge cases like a narrow desktop browser
// window still being treated as capable (which is correct — someone CAN
// resize a desktop window narrow and still have a keyboard).
function isDesktopCapable() {
  if (typeof window === 'undefined') return true
  const hasFinePointer = window.matchMedia('(pointer: fine)').matches
  const wideEnough = window.innerWidth >= 900
  return hasFinePointer && wideEnough
}

export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => isDesktopCapable())

  useEffect(() => {
    function recheck() { setIsDesktop(isDesktopCapable()) }
    window.addEventListener('resize', recheck)
    // Some browsers can change pointer capability without a resize (e.g. a
    // 2-in-1 laptop switching between keyboard and tablet mode) — matchMedia
    // has its own change event for exactly this.
    const mq = window.matchMedia('(pointer: fine)')
    mq.addEventListener?.('change', recheck)
    return () => {
      window.removeEventListener('resize', recheck)
      mq.removeEventListener?.('change', recheck)
    }
  }, [])

  return isDesktop
}

function DesktopOnlyGate({ toolName, children }) {
  const isDesktop = useIsDesktop()

  if (isDesktop) return children

  return (
    <main style={{ maxWidth: '560px', margin: '0 auto', padding: '60px 20px 100px' }}>
      <div className="panel-card" style={{ textAlign: 'center', padding: '48px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '24px' }}>
          <div className="upload-icon-wrap"><Keyboard size={26} /></div>
          <div className="upload-icon-wrap"><Laptop size={26} /></div>
        </div>
        <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '22px', marginBottom: '12px' }}>
          {toolName} needs a real keyboard
        </h2>
        <p style={{ fontFamily: 'Inter, sans-serif', color: 'var(--muted)', fontSize: '14px', lineHeight: 1.7, marginBottom: '20px' }}>
          This tool measures actual key presses, so it only works with a physical keyboard. Open this page on a desktop or laptop to use it.
        </p>
        <div className="tool-chips" style={{ justifyContent: 'center' }}>
          <span className="tool-chip accent">DESKTOP ONLY</span>
        </div>
      </div>
    </main>
  )
}

export default DesktopOnlyGate
