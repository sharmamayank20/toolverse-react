// Split-PDF-specific helpers. Generic PDF helpers (concurrency-limited
// mapping, byte formatting, off-DOM page thumbnail rendering) already
// live in mergePdfHelpers.js and are reused from there rather than
// duplicated a third time.

export const MAX_FILE_BYTES = 20 * 1024 * 1024

export function validateSplitFile(file) {
  if (!file) return { ok: false, msg: 'No PDF selected.' }
  const isPdf = (file.name || '').toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'
  if (!isPdf) return { ok: false, msg: 'Only PDF files are accepted.' }
  if ((file.size || 0) > MAX_FILE_BYTES) return { ok: false, msg: 'File exceeds 20 MB.' }
  return { ok: true }
}

// Parses "1-3, 5, 7-10" into a Set of valid, in-range page numbers.
// Backwards ranges (e.g. "5-2") are read as written either direction.
export function parseRangesToSet(str, total) {
  const set = new Set()
  ;(str || '').split(',').forEach(part => {
    part = part.trim()
    if (!part) return
    if (part.includes('-')) {
      const bounds = part.split('-').map(n => parseInt(n.trim(), 10))
      if (bounds.length === 2 && !isNaN(bounds[0]) && !isNaN(bounds[1])) {
        const lo = Math.max(1, Math.min(bounds[0], bounds[1]))
        const hi = Math.min(total, Math.max(bounds[0], bounds[1]))
        for (let p = lo; p <= hi; p++) set.add(p)
      }
    } else {
      const p = parseInt(part, 10)
      if (!isNaN(p) && p >= 1 && p <= total) set.add(p)
    }
  })
  return set
}

// Collapses a Set of page numbers into the compact "1-3, 5, 7-10" form —
// always ascending, matching how the server extracts pages regardless
// of click or entry order.
export function setToRangesString(set) {
  const sorted = [...set].sort((a, b) => a - b)
  if (!sorted.length) return ''
  const parts = []
  let start = sorted[0], prev = sorted[0]
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i]
    if (cur === prev + 1) { prev = cur; continue }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`)
    if (cur !== undefined) { start = prev = cur }
  }
  return parts.join(', ')
}