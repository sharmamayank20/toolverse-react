import { motion, AnimatePresence } from 'framer-motion'

function Toast({ message }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 20, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: 20, x: '-50%' }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'fixed', bottom: '30px', left: '50%',
            background: 'var(--badge-ink)', color: 'var(--acid)',
            border: '2px solid var(--badge-ink)', padding: '12px 20px',
            fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', fontWeight: 700,
            zIndex: 1000, boxShadow: '5px 5px 0 var(--fg)',
          }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default Toast