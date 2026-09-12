import { useRef, useState } from 'react'
import { motion, useMotionValue, useSpring } from 'motion/react'

// Tilt/spring mechanics are lifted directly from reactbits.dev's TiltedCard
// (same springValues, same handleMouse math) -- that physics feel is the
// whole point of using it. What changed: TiltedCard wraps a photo
// (imageSrc); this wraps a lucide icon + label instead, since DESIGN.md
// requires lucide-react icons exclusively, no external brand-logo images.

const springValues = { damping: 30, stiffness: 100, mass: 2 }

export default function TechTiltCard({ icon: Icon, name, rotateAmplitude = 14, scaleOnHover = 1.08 }) {
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
      className="tech-tilt-card"
      onMouseMove={handleMouse}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div className="tech-tilt-card-inner" style={{ rotateX, rotateY, scale }}>
        <Icon size={30} className="tech-tilt-icon" />
        <span className="tech-tilt-name">{name}</span>
      </motion.div>
    </div>
  )
}
