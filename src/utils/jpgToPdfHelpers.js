export const MAX_TOTAL_BYTES = 20 * 1024 * 1024

// Mirrors the server's Python exactly: same fixed sizes, same margins,
// same 96dpi fallback assumption (only wrong if an image carries explicit
// non-96 DPI metadata, which the browser doesn't expose anyway).
export const FIXED_SIZES_PT = { a4: [595.28, 841.89], letter: [612, 792], square: [700, 700] }
export const MARGIN_PT = { none: 0, small: 20, large: 50 }
const ASSUMED_DPI = 96

export function validateNewImageFiles(incoming, existingTotalBytes) {
  if (!incoming || !incoming.length) return { ok: false, msg: 'No images selected.' }
  let total = existingTotalBytes
  for (const f of incoming) {
    const name = (f.name || '').toLowerCase()
    const type = f.type || ''
    const isImg = name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') ||
      type === 'image/jpeg' || type === 'image/png'
    if (!isImg) return { ok: false, msg: 'Only JPG or PNG images are accepted.' }
    total += f.size || 0
    if (total > MAX_TOTAL_BYTES) return { ok: false, msg: `Total size exceeds ${(MAX_TOTAL_BYTES / 1024 / 1024).toFixed(0)}MB.` }
  }
  return { ok: true }
}

function computePageSizePt(pageSize, orientation, imgWpt, imgHpt) {
  if (pageSize === 'fit') return [imgWpt, imgHpt]
  if (pageSize === 'square') return FIXED_SIZES_PT.square
  const [baseW, baseH] = FIXED_SIZES_PT[pageSize]
  const short = Math.min(baseW, baseH), long = Math.max(baseW, baseH)
  if (orientation === 'portrait') return [short, long]
  if (orientation === 'landscape') return [long, short]
  return imgWpt > imgHpt ? [long, short] : [short, long] // auto: match the image
}

// Same centering math as the Python script. Returns null until the
// image's natural dimensions have loaded.
export function computeLayout(entry, pageSize, orientation, margin) {
  if (!entry.naturalWidth) return null
  const rotated = entry.rotation === 90 || entry.rotation === 270
  const rawWpt = entry.naturalWidth / ASSUMED_DPI * 72
  const rawHpt = entry.naturalHeight / ASSUMED_DPI * 72
  const imgWpt = rotated ? rawHpt : rawWpt
  const imgHpt = rotated ? rawWpt : rawHpt

  const [pageW, pageH] = computePageSizePt(pageSize, orientation, imgWpt, imgHpt)
  const marginPt = MARGIN_PT[margin]
  const availW = Math.max(1, pageW - 2 * marginPt)
  const availH = Math.max(1, pageH - 2 * marginPt)
  const scale = Math.min(availW / imgWpt, availH / imgHpt)
  const drawW = imgWpt * scale, drawH = imgHpt * scale
  const x = (pageW - drawW) / 2, y = (pageH - drawH) / 2

  return {
    pageW, pageH,
    leftPct: (x / pageW) * 100,
    topPct: (y / pageH) * 100,
    widthPct: (drawW / pageW) * 100,
    heightPct: (drawH / pageH) * 100,
  }
}