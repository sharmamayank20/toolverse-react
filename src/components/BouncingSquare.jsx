import { useEffect, useRef } from 'react'

const COLORS = ['var(--cobalt)', 'var(--acid)', 'var(--coral)']
const BOX_W = 72, BOX_H = 56, SQ = 12

function BouncingSquare() {
  const squareRef = useRef(null)

  useEffect(() => {
    let x = 10, y = 10
    let vx = 1.1, vy = 0.85
    let frameId

    function tick() {
      x += vx
      y += vy
      let bounced = false

      if (x <= 0 || x >= BOX_W - SQ) { vx *= -1; x = Math.max(0, Math.min(x, BOX_W - SQ)); bounced = true }
      if (y <= 0 || y >= BOX_H - SQ) { vy *= -1; y = Math.max(0, Math.min(y, BOX_H - SQ)); bounced = true }

      const el = squareRef.current
      if (el) {
        el.style.transform = `translate(${x}px, ${y}px)`
        if (bounced) el.style.background = COLORS[Math.floor(Math.random() * COLORS.length)]
      }
      frameId = requestAnimationFrame(tick)
    }

    frameId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameId)
  }, [])

  return (
    <div className="bounce-box">
      <div className="bounce-square" ref={squareRef}></div>
    </div>
  )
}

export default BouncingSquare