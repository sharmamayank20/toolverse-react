import { motion } from 'framer-motion'

function KeyCap({ def, held, tested, stuck }) {
  const state = stuck ? 'stuck' : held ? 'pressed' : tested ? 'tested' : 'idle'

  const colors = {
    idle: { bg: 'var(--panel)', border: 'var(--fg)', color: 'var(--fg)' },
    pressed: { bg: 'var(--cobalt)', border: 'var(--cobalt)', color: 'var(--badge-paper)' },
    tested: { bg: 'var(--panel)', border: 'var(--cobalt)', color: 'var(--cobalt)' },
    stuck: { bg: 'var(--coral)', border: 'var(--coral)', color: 'var(--badge-paper)' },
  }[state]

  return (
    <motion.div
      className={`key-cap ${def.wide ? 'wide-label' : ''} ${def.cls || ''} ${def.span2 ? 'np-span2' : ''} ${def.laptopHide ? 'laptop-hide' : ''}`}
      style={{ '--n': def.u || 1 }}
      animate={{
        scale: held ? 0.94 : 1,
        y: held ? 2 : 0,
        backgroundColor: colors.bg,
        borderColor: colors.border,
        color: colors.color,
      }}
      transition={{ type: 'spring', stiffness: 500, damping: 28 }}
    >
      <span className="key-label">{def.label ?? def.l}</span>
    </motion.div>
  )
}

export default KeyCap