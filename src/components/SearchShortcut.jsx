import { useEffect, useRef } from 'react'

function useSearchShortcut(inputRef) {
  useEffect(() => {
    function handleKeydown(e) {
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [inputRef])
}

export default useSearchShortcut