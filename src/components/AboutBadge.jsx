import { Link } from 'react-router-dom'

// Square badge using the actual icon-mark.svg you designed -- this is the
// asset's first real home in the UI. Sits next to ThemeToggle in the navbar.
function AboutBadge() {
  return (
    <Link to="/about" className="about-badge" aria-label="About TOOLVERSE">
      <img src="/icon-mark.svg" alt="" width="20" height="20" />
    </Link>
  )
}

export default AboutBadge
