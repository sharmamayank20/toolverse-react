import { useRef } from 'react'
import { motion, useMotionValue, useSpring } from 'motion/react'

// Same tilt/spring approach as TechTiltCard.jsx (itself lifted from
// reactbits' TiltedCard physics) -- reused rather than adding a third
// slightly-different tilt implementation. Wraps an initials avatar instead
// of a photo, since no real photo was supplied; swap the <span> content
// for an <img> once one exists, the tilt wrapper doesn't need to change.

const springValues = { damping: 30, stiffness: 100, mass: 2 }

export default function CreatorAvatarCard({ initials = 'MS', imageSrc = null, rotateAmplitude = 10, scaleOnHover = 1.05 }) {
  const ref = useRef(null)
  const rotateX = useSpring(useMotionValue(0), springValues)
  const rotateY = useSpring(useMotionValue(0), springValues)
  const scale = useSpring(1, springValues)

  function handleMouse(e) {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const offsetX = e.clientX - rect.left - rect.width / 2
    const offsetY = e.clientY - rect.top - rect.height / 2
    rotateX.set((offsetY / (rect.height / 2)) * -rotateAmplitude)
    rotateY.set((offsetX / (rect.width / 2)) * rotateAmplitude)
  }

  function handleMouseEnter() {
    scale.set(scaleOnHover)
  }

  function handleMouseLeave() {
    scale.set(1)
    rotateX.set(0)
    rotateY.set(0)
  }

  return (
    <div
      ref={ref}
      className="creator-avatar-card"
      onMouseMove={handleMouse}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div className="creator-avatar-inner" style={{ rotateX, rotateY, scale }}>
        {imageSrc ? (
          <img src={imageSrc} alt="" className="creator-avatar-img" />
        ) : (
          <span className="creator-avatar-initials">{initials}</span>
        )}
      </motion.div>
    </div>
  )
}
