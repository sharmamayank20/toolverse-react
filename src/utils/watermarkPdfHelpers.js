export const MAX_PDF_BYTES = 20 * 1024 * 1024
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

// Exact margins used by the server for single-position placement — 50pt
// for text, 20pt for images. Matching these makes the preview a precise
// stand-in for the real output, not just an approximation.
export const MARGIN_TEXT_PT = 50
export const MARGIN_IMAGE_PT = 20

export const POSITION_KEYS = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
]

export const DEFAULTS = {
  watermarkType: 'text',
  watermarkText: '',
  fontFamily: 'Helvetica',
  fontBold: false,
  fontItalic: false,
  fontSize: 40,
  textColor: '#000000',
  position: 'center',
  layout: 'single',
  tileSpacing: 'normal',
  opacity: 30,
  rotation: 45,
  layer: 'front',
  pagesMode: 'all',
}

export const TEXT_PRESETS = ['CONFIDENTIAL', 'DRAFT', 'SAMPLE', 'DO NOT COPY', 'COPY']

export function validateWatermarkPdfFile(file) {
  if (!file) return { ok: false, msg: 'No PDF selected.' }
  const isPdf = (file.name || '').toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'
  if (!isPdf) return { ok: false, msg: 'Only PDF files are accepted.' }
  if ((file.size || 0) > MAX_PDF_BYTES) return { ok: false, msg: 'File exceeds 20 MB.' }
  return { ok: true }
}

export function validateWatermarkImageFile(file) {
  if (!file) return { ok: false, msg: 'No image selected.' }
  const okTypes = ['image/png', 'image/jpeg']
  if (!okTypes.includes(file.type)) return { ok: false, msg: 'Only PNG or JPG images are accepted.' }
  if ((file.size || 0) > MAX_IMAGE_BYTES) return { ok: false, msg: 'Image exceeds 8 MB.' }
  return { ok: true }
}

export function presetAnchor(position, cssW, cssH, marginPx) {
  switch (position) {
    case 'top-left': return { x: marginPx, y: marginPx }
    case 'top-center': return { x: cssW / 2, y: marginPx }
    case 'top-right': return { x: cssW - marginPx, y: marginPx }
    case 'middle-left': return { x: marginPx, y: cssH / 2 }
    case 'middle-right': return { x: cssW - marginPx, y: cssH / 2 }
    case 'bottom-left': return { x: marginPx, y: cssH - marginPx }
    case 'bottom-center': return { x: cssW / 2, y: cssH - marginPx }
    case 'bottom-right': return { x: cssW - marginPx, y: cssH - marginPx }
    default: return { x: cssW / 2, y: cssH / 2 } // center
  }
}

export function nearestPresetFor(anchorPx, cssW, cssH, marginPx) {
  let best = 'center', bestDist = Infinity
  POSITION_KEYS.forEach(key => {
    const p = presetAnchor(key, cssW, cssH, marginPx)
    const d = Math.hypot(p.x - anchorPx.x, p.y - anchorPx.y)
    if (d < bestDist) { bestDist = d; best = key }
  })
  return best
}

export function pxToPt(xPx, yPx, pageHeightPts, renderScale) {
  return { xPt: xPx / renderScale, yPt: pageHeightPts - (yPx / renderScale) }
}
export function ptToPx({ xPt, yPt }, pageHeightPts, renderScale) {
  return { x: xPt * renderScale, y: (pageHeightPts - yPt) * renderScale }
}

// Tiles `draw(cx, cy)` in a grid across the full canvas — centered grid,
// with 2 extra rows/cols of padding so tiles bleed off every edge
// rather than leaving a gap. Capped so a small watermark on a large
// page can't explode into thousands of draw calls.
const MAX_MOSAIC_TILES = 300
export function tileAcrossPage(cssW, cssH, tileW, tileH, draw) {
  let cols = Math.max(1, Math.floor(cssW / tileW) + 2)
  let rows = Math.max(1, Math.floor(cssH / tileH) + 2)
  if (cols * rows > MAX_MOSAIC_TILES) {
    const factor = Math.sqrt((cols * rows) / MAX_MOSAIC_TILES)
    tileW *= factor; tileH *= factor
    cols = Math.max(1, Math.floor(cssW / tileW) + 2)
    rows = Math.max(1, Math.floor(cssH / tileH) + 2)
  }
  const startX = -tileW / 2, startY = -tileH / 2
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      draw(startX + c * tileW, startY + r * tileH)
    }
  }
}

export function hasCustomSettings(settings, watermarkImageFile, customAnchorPt) {
  if (watermarkImageFile) return true
  if (customAnchorPt) return true
  for (const key of Object.keys(DEFAULTS)) {
    if (settings[key] !== DEFAULTS[key]) return true
  }
  return false
}