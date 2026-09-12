import { useState, useEffect, useRef } from 'react'

function StatCounter({ target, suffix = '', label }) {
  const [value, setValue] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const duration = 900
    const start = performance.now() + 400

    function tick(now) {
      const elapsed = now - start
      if (elapsed < 0) { requestAnimationFrame(tick); return }
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(target * eased))
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [target])

  return (
    <div className="stat">
      <span className="stat-n">{value}{suffix}</span>
      <span className="stat-l">{label}</span>
    </div>
  )
}

export default StatCounter