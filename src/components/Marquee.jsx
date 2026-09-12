import { TOOLS } from '../config/toolsRegistry'

function Marquee() {
  const names = TOOLS.map(t => t.name.toUpperCase())
  const looped = [...names, ...names]

  // scale duration with how much content there actually is,
  // so it always reads as the same perceived speed regardless of tool count
  const duration = Math.max(10, TOOLS.length * 3)

  return (
    <div className="marquee-band">
      <div className="marquee-track" style={{ animationDuration: `${duration}s` }}>
        {looped.map((name, i) => (
          <span key={i}>{name} ·</span>
        ))}
      </div>
    </div>
  )
}

export default Marquee