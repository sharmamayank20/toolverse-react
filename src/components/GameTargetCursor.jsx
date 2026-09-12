import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { gsap } from 'gsap'

// Adapted from reactbits' TargetCursor for the /games page only. Renamed
// classes to games-cursor-* to avoid any clash, square dot instead of
// circular (border-radius:0 is a hard site-wide rule), and cursorColor
// defaults to whatever --arcade-magenta actually resolves to at mount
// time rather than a hardcoded hex, so it always tracks the real token.
//
// IMPORTANT: this hides the OS cursor while mounted, so it must only be
// mounted on /games -- App.jsx suppresses the global <CursorTag /> there
// so the two custom cursors never run at once.

const getContainingBlock = (element) => {
  let node = element?.parentElement
  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node)
    if (
      style.transform !== 'none' ||
      style.perspective !== 'none' ||
      style.filter !== 'none' ||
      style.willChange.includes('transform') ||
      style.willChange.includes('perspective') ||
      style.willChange.includes('filter') ||
      /paint|layout|strict|content/.test(style.contain)
    ) {
      return node
    }
    node = node.parentElement
  }
  return null
}

const getContainingBlockOffset = (block) => {
  if (!block) return { x: 0, y: 0 }
  const rect = block.getBoundingClientRect()
  return { x: rect.left + block.clientLeft, y: rect.top + block.clientTop }
}

function GameTargetCursor({
  targetSelector = '.cursor-target',
  spinDuration = 2,
  hoverDuration = 0.2,
  parallaxOn = true,
}) {
  const cursorRef = useRef(null)
  const cornersRef = useRef(null)
  const spinTl = useRef(null)
  const dotRef = useRef(null)
  const containingBlockRef = useRef(null)
  const targetCornerPositionsRef = useRef(null)
  const tickerFnRef = useRef(null)
  const activeStrengthRef = useRef(0)

  // Read the live arcade token once on mount instead of hardcoding a hex.
  const [cursorColor] = useState(() => {
    if (typeof window === 'undefined') return '#ffffff'
    return getComputedStyle(document.documentElement).getPropertyValue('--arcade-magenta').trim() || '#ffffff'
  })

  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false
    const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    const isSmallScreen = window.innerWidth <= 768
    return hasTouchScreen && isSmallScreen
  }, [])

  const constants = useMemo(() => ({ borderWidth: 3, cornerSize: 12 }), [])

  const moveCursor = useCallback((x, y) => {
    if (!cursorRef.current) return
    const { x: offsetX, y: offsetY } = getContainingBlockOffset(containingBlockRef.current)
    gsap.to(cursorRef.current, { x: x - offsetX, y: y - offsetY, duration: 0.1, ease: 'power3.out' })
  }, [])

  useEffect(() => {
    if (isMobile || !cursorRef.current) return
    const originalCursor = document.body.style.cursor
    document.body.style.cursor = 'none'

    const cursor = cursorRef.current
    cornersRef.current = cursor.querySelectorAll('.games-cursor-corner')
    containingBlockRef.current = getContainingBlock(cursor)
    const getOffset = () => getContainingBlockOffset(containingBlockRef.current)

    let activeTarget = null
    let currentLeaveHandler = null
    let resumeTimeout = null

    const cleanupTarget = (target) => {
      if (currentLeaveHandler) target.removeEventListener('mouseleave', currentLeaveHandler)
      currentLeaveHandler = null
    }

    const initialOffset = getOffset()
    gsap.set(cursor, {
      xPercent: -50, yPercent: -50,
      x: window.innerWidth / 2 - initialOffset.x,
      y: window.innerHeight / 2 - initialOffset.y,
    })

    const createSpinTimeline = () => {
      if (spinTl.current) spinTl.current.kill()
      spinTl.current = gsap.timeline({ repeat: -1 }).to(cursor, { rotation: '+=360', duration: spinDuration, ease: 'none' })
    }
    createSpinTimeline()

    const tickerFn = () => {
      if (!targetCornerPositionsRef.current || !cursorRef.current || !cornersRef.current) return
      const strength = activeStrengthRef.current
      if (strength === 0) return
      const cursorX = gsap.getProperty(cursorRef.current, 'x')
      const cursorY = gsap.getProperty(cursorRef.current, 'y')
      Array.from(cornersRef.current).forEach((corner, i) => {
        const currentX = gsap.getProperty(corner, 'x')
        const currentY = gsap.getProperty(corner, 'y')
        const targetX = targetCornerPositionsRef.current[i].x - cursorX
        const targetY = targetCornerPositionsRef.current[i].y - cursorY
        const finalX = currentX + (targetX - currentX) * strength
        const finalY = currentY + (targetY - currentY) * strength
        const duration = strength >= 0.99 ? (parallaxOn ? 0.2 : 0) : 0.05
        gsap.to(corner, { x: finalX, y: finalY, duration, ease: duration === 0 ? 'none' : 'power1.out', overwrite: 'auto' })
      })
    }
    tickerFnRef.current = tickerFn

    const moveHandler = (e) => moveCursor(e.clientX, e.clientY)
    window.addEventListener('mousemove', moveHandler)

    const mouseDownHandler = () => {
      if (!dotRef.current) return
      gsap.to(dotRef.current, { scale: 0.7, duration: 0.3 })
      gsap.to(cursorRef.current, { scale: 0.9, duration: 0.2 })
    }
    const mouseUpHandler = () => {
      if (!dotRef.current) return
      gsap.to(dotRef.current, { scale: 1, duration: 0.3 })
      gsap.to(cursorRef.current, { scale: 1, duration: 0.2 })
    }
    window.addEventListener('mousedown', mouseDownHandler)
    window.addEventListener('mouseup', mouseUpHandler)

    const enterHandler = (e) => {
      let current = e.target
      let target = null
      while (current && current !== document.body) {
        if (current.matches?.(targetSelector)) { target = current; break }
        current = current.parentElement
      }
      if (!target || !cursorRef.current || !cornersRef.current) return
      if (activeTarget === target) return
      if (activeTarget) cleanupTarget(activeTarget)
      if (resumeTimeout) { clearTimeout(resumeTimeout); resumeTimeout = null }

      activeTarget = target
      const corners = Array.from(cornersRef.current)
      corners.forEach((corner) => gsap.killTweensOf(corner, 'x,y'))
      gsap.killTweensOf(cursorRef.current, 'rotation')
      spinTl.current?.pause()
      gsap.set(cursorRef.current, { rotation: 0 })

      const rect = target.getBoundingClientRect()
      const { borderWidth, cornerSize } = constants
      const { x: offsetX, y: offsetY } = getOffset()
      const cursorX = gsap.getProperty(cursorRef.current, 'x')
      const cursorY = gsap.getProperty(cursorRef.current, 'y')

      targetCornerPositionsRef.current = [
        { x: rect.left - borderWidth - offsetX, y: rect.top - borderWidth - offsetY },
        { x: rect.right + borderWidth - cornerSize - offsetX, y: rect.top - borderWidth - offsetY },
        { x: rect.right + borderWidth - cornerSize - offsetX, y: rect.bottom + borderWidth - cornerSize - offsetY },
        { x: rect.left - borderWidth - offsetX, y: rect.bottom + borderWidth - cornerSize - offsetY },
      ]

      gsap.ticker.add(tickerFnRef.current)
      gsap.to(activeStrengthRef, { current: 1, duration: hoverDuration, ease: 'power2.out' })
      corners.forEach((corner, i) => {
        gsap.to(corner, {
          x: targetCornerPositionsRef.current[i].x - cursorX,
          y: targetCornerPositionsRef.current[i].y - cursorY,
          duration: 0.2, ease: 'power2.out',
        })
      })

      const leaveHandler = () => {
        gsap.ticker.remove(tickerFnRef.current)
        targetCornerPositionsRef.current = null
        gsap.set(activeStrengthRef, { current: 0, overwrite: true })
        activeTarget = null

        if (cornersRef.current) {
          const c = Array.from(cornersRef.current)
          gsap.killTweensOf(c, 'x,y')
          const { cornerSize } = constants
          const positions = [
            { x: -cornerSize * 1.5, y: -cornerSize * 1.5 },
            { x: cornerSize * 0.5, y: -cornerSize * 1.5 },
            { x: cornerSize * 0.5, y: cornerSize * 0.5 },
            { x: -cornerSize * 1.5, y: cornerSize * 0.5 },
          ]
          c.forEach((corner, index) => gsap.to(corner, { x: positions[index].x, y: positions[index].y, duration: 0.3, ease: 'power3.out' }))
        }

        resumeTimeout = setTimeout(() => {
          if (!activeTarget && cursorRef.current && spinTl.current) {
            const currentRotation = gsap.getProperty(cursorRef.current, 'rotation')
            const normalized = currentRotation % 360
            spinTl.current.kill()
            spinTl.current = gsap.timeline({ repeat: -1 }).to(cursorRef.current, { rotation: '+=360', duration: spinDuration, ease: 'none' })
            gsap.to(cursorRef.current, {
              rotation: normalized + 360,
              duration: spinDuration * (1 - normalized / 360),
              ease: 'none',
              onComplete: () => spinTl.current?.restart(),
            })
          }
          resumeTimeout = null
        }, 50)

        cleanupTarget(target)
      }

      currentLeaveHandler = leaveHandler
      target.addEventListener('mouseleave', leaveHandler)
    }
    window.addEventListener('mouseover', enterHandler, { passive: true })

    const resizeHandler = () => { containingBlockRef.current = getContainingBlock(cursor) }
    window.addEventListener('resize', resizeHandler)

    return () => {
      if (tickerFnRef.current) gsap.ticker.remove(tickerFnRef.current)
      window.removeEventListener('mousemove', moveHandler)
      window.removeEventListener('mouseover', enterHandler)
      window.removeEventListener('resize', resizeHandler)
      window.removeEventListener('mousedown', mouseDownHandler)
      window.removeEventListener('mouseup', mouseUpHandler)
      if (activeTarget) cleanupTarget(activeTarget)
      spinTl.current?.kill()
      document.body.style.cursor = originalCursor
      targetCornerPositionsRef.current = null
      activeStrengthRef.current = 0
    }
  }, [targetSelector, spinDuration, moveCursor, constants, isMobile, hoverDuration, parallaxOn, cursorColor])

  if (isMobile || typeof document === 'undefined') return null

  return createPortal(
    <div ref={cursorRef} className="games-cursor-wrapper">
      <div ref={dotRef} className="games-cursor-dot" style={{ backgroundColor: cursorColor }} />
      <div className="games-cursor-corner corner-tl" style={{ borderColor: cursorColor }} />
      <div className="games-cursor-corner corner-tr" style={{ borderColor: cursorColor }} />
      <div className="games-cursor-corner corner-br" style={{ borderColor: cursorColor }} />
      <div className="games-cursor-corner corner-bl" style={{ borderColor: cursorColor }} />
    </div>,
    document.body
  )
}

export default GameTargetCursor
