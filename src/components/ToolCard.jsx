import { useRef } from 'react'
import { Link } from 'react-router-dom'

function ToolCard({ tool }) {
  const cardRef = useRef(null)

  function handleMouseMove(e) {
    const card = cardRef.current
    const rect = card.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    const rx = (0.5 - py) * 14
    const ry = (px - 0.5) * 14
    card.style.setProperty('--rx', rx.toFixed(2) + 'deg')
    card.style.setProperty('--ry', ry.toFixed(2) + 'deg')
    card.style.setProperty('--tx', ((px - 0.5) * -6).toFixed(1) + 'px')
    card.style.setProperty('--ty', ((py - 0.5) * -6).toFixed(1) + 'px')
  }

  function handleMouseLeave() {
    const card = cardRef.current
    card.style.setProperty('--rx', '0deg')
    card.style.setProperty('--ry', '0deg')
    card.style.setProperty('--tx', '0px')
    card.style.setProperty('--ty', '0px')
  }

  return (
    <Link
      to={tool.path}
      className="tool-card"
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="tool-card-name">{tool.name}</div>
      <div className="tool-card-desc">{tool.description}</div>
    </Link>
  )
}

export default ToolCard