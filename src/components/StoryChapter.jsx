import { motion } from 'framer-motion'

const EASE = [0.22, 1, 0.36, 1]

// Alternates entry direction based on `align` so chapters don't all repeat
// the identical animation as you scroll -- that sameness is exactly what
// makes scroll-reveal read as generic/templated. whileInView + viewport
// once:true means each chapter animates in the first time it's scrolled
// to, and stays put after -- doesn't re-trigger on scroll-back-up.
function StoryChapter({ number, title, children, align = 'left', icon: Icon }) {
  const fromX = align === 'left' ? -40 : 40
  return (
    <motion.div
      className={`story-chapter story-chapter-${align}`}
      initial={{ opacity: 0, x: fromX, y: 24 }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ duration: 0.65, ease: EASE }}
    >
      <div className="story-chapter-marker">
        {Icon ? <Icon size={30} /> : <span className="story-chapter-num">{number}</span>}
      </div>
      <div className="story-chapter-body">
        <h3 className="story-chapter-title">{title}</h3>
        <p className="story-chapter-text">{children}</p>
      </div>
    </motion.div>
  )
}

export default StoryChapter
