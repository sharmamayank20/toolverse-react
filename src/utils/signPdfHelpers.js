// Sign-PDF-specific helpers: image loading, canvas-based signature
// generation (typed text, stamp graphic), exact-pixel-size PNG export
// (the backend expects the signature image sized to precisely match
// its placement in PDF points), and file validation.

export const MAX_PDF_BYTES = 20 * 1024 * 1024
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

// How many source pixels we render per PDF point before uploading a
// signature. The backend places the image using its raw pixel count as
// the point size (see routes/signPdf.js), so exportng at 1px/pt (the old
// behavior) is only ~72 DPI-equivalent — soft even at 100% zoom, visibly
// blocky under a "hard zoom" in a PDF viewer. 4x brings it to ~288
// DPI-equivalent (comparable to the "very high" preset elsewhere in this
// app) without needing any backend change: index.jsx compensates by
// sending `scale: 100 / SIGNATURE_OVERSAMPLE` instead of '100', so the
// backend still places the signature at the exact same physical size —
// only the pixel density embedded in the PDF goes up.
export const SIGNATURE_OVERSAMPLE = 4

export function validateSignPdfFile(file) {
  if (!file) return { ok: false, msg: 'No PDF selected.' }
  const isPdf = (file.name || '').toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'
  if (!isPdf) return { ok: false, msg: 'Only PDF files are accepted.' }
  if ((file.size || 0) > MAX_PDF_BYTES) return { ok: false, msg: 'PDF exceeds 20 MB.' }
  return { ok: true }
}

export function validateSignatureImage(file) {
  if (!file) return { ok: false, msg: 'No image selected.' }
  const isOk = /\.(png|jpe?g)$/i.test(file.name || '') || /^image\/(png|jpeg)$/.test(file.type || '')
  if (!isOk) return { ok: false, msg: 'Signature must be PNG or JPG.' }
  if ((file.size || 0) > MAX_IMAGE_BYTES) return { ok: false, msg: 'Image exceeds 5 MB.' }
  return { ok: true }
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// The backend places the signature using this PNG's pixel dimensions as
// its point size on the page (see routes/signPdf.js). We render at
// SIGNATURE_OVERSAMPLE pixels per point — not 1:1 — so the embedded
// image has real detail to show when someone zooms into the PDF; the
// upload's `scale` field (set in index.jsx) tells the backend to shrink
// that pixel count back down by the same factor, so the signature's
// physical size and position on the page are unaffected — only its
// resolution goes up.
export async function exactSizeBlob(dataUrl, widthPts, heightPts) {
  const img = await loadImage(dataUrl)
  const w = Math.max(1, Math.round(widthPts * SIGNATURE_OVERSAMPLE))
  const h = Math.max(1, Math.round(heightPts * SIGNATURE_OVERSAMPLE))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
}

export async function textToDataUrl(text, fontFamily, color) {
  // Rendered well above typical display size on purpose — exactSizeBlob
  // scales this up further to match the placement box in PDF points, and
  // starting from a higher-resolution source keeps that scale-up from
  // compounding into visible blur.
  const fontSizePx = 128
  try { await document.fonts.load(`${fontSizePx}px ${fontFamily}`) } catch { /* font may not be loaded yet; canvas falls back gracefully */ }

  const measureCanvas = document.createElement('canvas')
  const mctx = measureCanvas.getContext('2d')
  mctx.font = `${fontSizePx}px ${fontFamily}`
  const textWidth = Math.max(40, mctx.measureText(text).width)

  const padding = 20
  const canvas = document.createElement('canvas')
  canvas.width = textWidth + padding * 2
  canvas.height = fontSizePx * 1.6
  const ctx = canvas.getContext('2d')
  ctx.font = `${fontSizePx}px ${fontFamily}`
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.fillText(text, padding, canvas.height / 2)

  return canvas.toDataURL('image/png')
}

export function generateStampDataUrl(text, color) {
  // 2x the original 420x160 design, same reasoning as textToDataUrl's
  // fontSizePx bump — every coordinate/line-width below is scaled by the
  // same factor so the stamp looks identical, just rendered sharper.
  const RES = 2
  const canvas = document.createElement('canvas')
  canvas.width = 420 * RES
  canvas.height = 160 * RES
  const ctx = canvas.getContext('2d')

  ctx.save()
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(-10 * Math.PI / 180)

  ctx.strokeStyle = color
  ctx.lineWidth = 7 * RES
  ctx.strokeRect(-190 * RES, -55 * RES, 380 * RES, 110 * RES)
  ctx.lineWidth = 2 * RES
  ctx.strokeRect(-178 * RES, -43 * RES, 356 * RES, 86 * RES)

  ctx.fillStyle = color
  ctx.font = `bold ${46 * RES}px 'JetBrains Mono', monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 0, 4 * RES)
  ctx.restore()

  return canvas.toDataURL('image/png')
}