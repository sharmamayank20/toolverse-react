import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { TOOLS, CATEGORIES } from '../config/toolsRegistry'

function MobileDrawer() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button className="hamburger-btn" onClick={() => setOpen(true)} aria-label="Open menu">
        <Menu size={18} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="mobile-drawer-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="mobile-drawer"
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <button className="mobile-drawer-close" onClick={() => setOpen(false)} aria-label="Close menu">
                <X size={16} />
              </button>
              {CATEGORIES.map(cat => {
                const tools = TOOLS.filter(t => t.category === cat)
                if (tools.length === 0) return null
                return (
                  <div className="mobile-drawer-section" key={cat}>
                    <h4>{cat}</h4>
                    {tools.map(tool => (
                      <Link key={tool.id} to={tool.path} onClick={() => setOpen(false)}>{tool.name}</Link>
                    ))}
                  </div>
                )
              })}
              <div className="mobile-drawer-section">
                <h4>Info</h4>
                <Link to="/about" onClick={() => setOpen(false)}>About TOOLVERSE</Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

export default MobileDrawer
