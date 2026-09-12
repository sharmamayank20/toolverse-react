import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const MESSAGES = [
  'SYSTEM NOMINAL', 'ALL TOOLS ONLINE', 'TOOLVERSE.EXE', 'ZERO LATENCY', 'RUNNING LOCALLY',
]

function StatusBadge() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setIndex(i => (i + 1) % MESSAGES.length), 3200)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div className="status-badge">
        <div className="ring"></div>
        <div className="dot"></div>
      </div>
      <AnimatePresence mode="wait">
        <motion.span
          key={index}
          className="status-badge-label"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          style={{ textAlign: 'center' }}
        >
          {MESSAGES[index]}
        </motion.span>
      </AnimatePresence>
    </div>
  )
}

export default StatusBadge