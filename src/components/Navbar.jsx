import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import NavDropdown from './NavDropdown'
import ThemeToggle from './ThemeToggle'
import MobileDrawer from './MobileDrawer'
import AboutBadge from './AboutBadge'
import { CATEGORIES } from '../config/toolsRegistry'

const EASE = [0.22, 1, 0.36, 1]

function Navbar({ isArcade }) {
  return (
    <nav style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '20px 40px', borderBottom: '3px solid var(--fg)',
      background: 'var(--bg)', color: 'var(--fg)',
      transition: 'background-color 0.4s var(--ease-smooth), color 0.4s var(--ease-smooth), border-color 0.4s var(--ease-smooth)'
    }}>
      <Link to="/" className="logo"><span className="logo-mark"></span>TOOLVERSE</Link>

      <motion.div layout className="nav-links" transition={{ layout: { duration: 0.4, ease: EASE } }}>
        {CATEGORIES.map(cat => (
          <NavDropdown key={cat} category={cat} label={cat.split(' ')[0]} />
        ))}
      </motion.div>

      <motion.div
        layout
        style={{ display: 'flex', alignItems: 'center', gap: '16px' }}
        transition={{ layout: { duration: 0.4, ease: EASE } }}
      >
        <AnimatePresence mode="popLayout">
          {!isArcade && (
            <motion.div
              key="theme-toggle"
              layout
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.25, ease: EASE }}
            >
              <ThemeToggle />
            </motion.div>
          )}
        </AnimatePresence>
        <AboutBadge />
        <MobileDrawer />
      </motion.div>
    </nav>
  )
}

export default Navbar
