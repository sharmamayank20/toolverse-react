import { useRef, useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useSearchShortcut from './SearchShortcut'
import { TOOLS } from '../config/toolsRegistry'

function SearchBand() {
  const inputRef = useRef(null)
  const wrapRef = useRef(null)
  const navigate = useNavigate()
  useSearchShortcut(inputRef)

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return TOOLS.filter(
      (tool) =>
        tool.name.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q) ||
        tool.category.toLowerCase().includes(q)
    ).slice(0, 8)
  }, [query])

  // Reset the keyboard-highlighted result whenever the query changes,
  // otherwise a stale index could point at a result that no longer exists
  // in the new filtered list.
  useEffect(() => {
    setActiveIndex(-1)
  }, [query])

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function goToTool(tool) {
    navigate(tool.path)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  function handleKeyDown(e) {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = activeIndex >= 0 ? results[activeIndex] : results[0]
      if (pick) goToTool(pick)
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  const showDropdown = open && query.trim().length > 0

  return (
    <div className="search-band" ref={wrapRef}>
      <span className="search-label">LOOKUP &gt;</span>
      <input
        ref={inputRef}
        type="text"
        placeholder="search the catalog... try 'json' or 'compress'"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
        aria-controls="search-results-list"
      />

      {showDropdown && (
        <div className="search-results" id="search-results-list" role="listbox">
          {results.length === 0 ? (
            <div className="search-results-empty">No tools found for "{query}"</div>
          ) : (
            results.map((tool, i) => (
              <button
                key={tool.id}
                type="button"
                className={`search-result-item ${i === activeIndex ? 'active' : ''}`}
                role="option"
                aria-selected={i === activeIndex}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => goToTool(tool)}
              >
                <span className="search-result-name">{tool.name}</span>
                <span className="search-result-cat">{tool.category}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default SearchBand
