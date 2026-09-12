import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { Joystick } from 'lucide-react'

// Same tilt pattern as ToolCard.jsx (ref + direct DOM style writes, never
// React state, per DESIGN.md's high-frequency-update rule). The "dim
// siblings on hover" effect lives entirely in CSS via :has() on the
// parent grid -- see .games-tile-grid in index.css -- so no JS is needed
// for that half of the effect.
function GameTile({ tool, index }) {
  const tileRef = useRef(null)

  function handleMouseMove(e) {
    const el = tileRef.current
    const rect = el.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    const rx = (0.5 - py) * 18
    const ry = (px - 0.5) * 18
    el.style.setProperty('--grx', rx.toFixed(2) + 'deg')
    el.style.setProperty('--gry', ry.toFixed(2) + 'deg')
  }

  function handleMouseLeave() {
    const el = tileRef.current
    el.style.setProperty('--grx', '0deg')
    el.style.setProperty('--gry', '0deg')
  }

  return (
    <Link
      to={tool.path}
      ref={tileRef}
      className="game-tile cursor-target"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="game-tile-num">NO. {String(index + 1).padStart(2, '0')}</div>
      <div className="game-tile-icon"><Joystick size={26} /></div>
      <div className="game-tile-name">{tool.name}</div>
      <div className="game-tile-desc">{tool.description}</div>
      <div className="game-tile-play">PLAY →</div>
    </Link>
  )
}

export default GameTile
