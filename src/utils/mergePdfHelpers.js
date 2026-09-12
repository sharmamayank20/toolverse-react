// Helpers for Merge PDF. Thumbnail renderers return data URLs from an
// off-DOM canvas (never a DOM canvas ref) — same fix as Compress PDF's
// thumbnail bug: a ref-based approach races against React's render/mount
// cycle and silently no-ops.

export const MAX_TOTAL_BYTES = 50 * 1024 * 1024
const FILE_THUMB_TARGET_CSS_WIDTH = 90
const PAGE_THUMB_TARGET_CSS_WIDTH = 380

export function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0, v = bytes
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function validateNewFiles(incoming, existingTotalBytes) {
  if (!incoming || !incoming.length) return { ok: false, msg: 'No PDFs selected.' }
  let total = existingTotalBytes
  for (const f of incoming) {
    const isPdf = (f.name || '').toLowerCase().endsWith('.pdf') || f.type === 'application/pdf'
    if (!isPdf) return { ok: false, msg: 'Only PDF files are accepted.' }
    total += f.size || 0
    if (total > MAX_TOTAL_BYTES) return { ok: false, msg: `Total size exceeds ${formatBytes(MAX_TOTAL_BYTES)}.` }
  }
  return { ok: true }
}

// Runs `fn` over `items` with at most `limit` in flight at once —
// prevents e.g. 40 pages all rendering thumbnails simultaneously and
// choking the main thread. Order of results matches input order.
export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker)
  await Promise.all(workers)
  return results
}

export async function renderFileThumbnail(pdfDoc) {
  const page = await pdfDoc.getPage(1)
  const unscaled = page.getViewport({ scale: 1 })
  const dpr = window.devicePixelRatio || 1
  const scale = (FILE_THUMB_TARGET_CSS_WIDTH * dpr) / unscaled.width
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas.toDataURL('image/png')
}

export async function renderPageThumbnail(pdfDoc, pageNum, rotation) {
  const page = await pdfDoc.getPage(pageNum)
  const unscaled = page.getViewport({ scale: 1, rotation })
  const dpr = window.devicePixelRatio || 1
  const scale = (PAGE_THUMB_TARGET_CSS_WIDTH * dpr) / unscaled.width
  const viewport = page.getViewport({ scale, rotation })

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas.toDataURL('image/png')
}