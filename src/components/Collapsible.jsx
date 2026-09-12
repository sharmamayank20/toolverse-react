import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

function Collapsible({ title, chip = 'expand', children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="collapsible">
      <button className="collapsible-summary" onClick={() => setOpen(o => !o)}>
        <span>{title}</span>
        <span className="chip-subtle">{open ? 'collapse' : chip}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="collapsible-body">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default Collapsible