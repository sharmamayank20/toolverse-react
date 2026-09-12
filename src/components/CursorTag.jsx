import { useEffect, useRef } from 'react'

function CursorTag() {
  const tagRef = useRef(null)

  useEffect(() => {
    function handleMouseMove(e) {
      const tag = tagRef.current
      if (!tag) return
      tag.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px) rotate(-4deg)`

      const el = e.target
      if (el.closest('.tool-card')) tag.textContent = 'LAUNCH.EXE'
      else if (el.closest('.flow-row')) tag.textContent = 'EXPAND.EXE'
      else if (el.closest('.swap-card')) tag.textContent = 'READ.EXE'
      else if (el.tagName === 'INPUT') tag.textContent = 'TYPE.EXE'
      else if (el.closest('a') || el.closest('button')) tag.textContent = 'OPEN.EXE'
      else tag.textContent = 'CLICK.EXE'
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  return <div className="cursor-tag" ref={tagRef}>CLICK.EXE</div>
}

export default CursorTag