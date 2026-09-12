// Pure formatting/math helpers for Compress PDF — no React, no DOM.

export function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0, v = bytes
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

// Real, post-compression ratio only — never a pre-compression guess.
// Returns { reductionPct, fillPct } where reductionPct can be negative
// (file got larger) and fillPct is clamped 2–100 for the compare bar.
export function computeSizeComparison(originalSize, newSize) {
  if (!originalSize || originalSize <= 0) {
    return { reductionPct: 0, fillPct: 100 }
  }
  const reductionPct = Math.round((1 - newSize / originalSize) * 100)
  const fillPct = Math.max(2, Math.min(100, Math.round((newSize / originalSize) * 100)))
  return { reductionPct, fillPct }
}

export function validatePdfFile(file, maxBytes = 50 * 1024 * 1024) {
  if (!file) return { ok: false, msg: 'No PDF selected.' }
  const isPdf = (file.name || '').toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'
  if (!isPdf) return { ok: false, msg: 'Only PDF files are accepted.' }
  if ((file.size || 0) > maxBytes) return { ok: false, msg: 'File exceeds 50 MB.' }
  return { ok: true }
}

export const COMPRESSION_LEVELS = [
  { value: 'low', name: 'Low quality', detail: '72 DPI · smallest file' },
  { value: 'medium', name: 'Medium quality', detail: '150 DPI · balanced' },
  { value: 'high', name: 'High quality', detail: '300 DPI · best quality' },
]