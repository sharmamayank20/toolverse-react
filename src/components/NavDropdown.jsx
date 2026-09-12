import { Link } from 'react-router-dom'
import { TOOLS } from '../config/toolsRegistry'

const ACCENT_CLASS = {
  "Text Tools": "cobalt",
  "Media Tools": "acid",
  "Dev Tools": "cobalt",
  "Arcade": "coral",
  "Calculators": "acid",
  "PDF Tools": "cobalt",
}

function NavDropdown({ category, label }) {
  const tools = TOOLS.filter(t => t.category === category)

  return (
    <div className="nav-item">
      <button className="nav-trigger">{label} <span className="caret">▾</span></button>
      <div className="dropdown-panel">
        <div className={`dropdown-tag ${ACCENT_CLASS[category]}`}>{category.toUpperCase()} //</div>
        {category === 'Arcade' ? (
          <Link to="/games" onClick={(e) => e.currentTarget.blur()}>
            View All Games →
          </Link>
        ) : (
          <>
            {tools.length === 0 && <span className="dropdown-empty">Coming soon</span>}
            {tools.map(tool => (
              <Link key={tool.id} to={tool.path} onClick={(e) => e.currentTarget.blur()}>
                {tool.name}
              </Link>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

export default NavDropdown
