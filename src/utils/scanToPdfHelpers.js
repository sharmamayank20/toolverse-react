// Pure canvas/image-processing helpers for Scan to PDF. No React, no
// DOM refs held here — every function takes a canvas/image in and
// returns a new canvas out, so the camera-capture path, the upload
// path, and re-crop/retake all share identical processing.

export const QUALITY_PRESETS = {
  high: { jpegQuality: 0.95, maxDim: 2200, label: 'High Quality — best detail, largest file.' },
  balanced: { jpegQuality: 0.85, maxDim: 1600, label: 'Balanced — good quality, reasonable size.' },
  small: { jpegQuality: 0.60, maxDim: 1000, label: 'Small File — best for emailing or quick sharing.' },
}

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

export function defaultCorners(w, h) {
  const mx = w * 0.06, my = h * 0.06
  return {
    topLeftCorner: { x: mx, y: my },
    topRightCorner: { x: w - mx, y: my },
    bottomLeftCorner: { x: mx, y: h - my },
    bottomRightCorner: { x: w - mx, y: h - my },
  }
}

// Downscales only for export — thumbnails/editor preview always use the
// full-resolution rendered canvas so switching quality later never loses detail.
export function resizeCanvasToMaxDim(canvas, maxDim) {
  const longest = Math.max(canvas.width, canvas.height)
  if (longest <= maxDim) return canvas
  const scale = maxDim / longest
  const out = document.createElement('canvas')
  out.width = Math.max(1, Math.round(canvas.width * scale))
  out.height = Math.max(1, Math.round(canvas.height * scale))
  out.getContext('2d').drawImage(canvas, 0, 0, out.width, out.height)
  return out
}

export function applyRotation(srcCanvas, rotation) {
  if (!rotation || rotation % 360 === 0) return srcCanvas
  const out = document.createElement('canvas')
  const rad = rotation * Math.PI / 180
  if (rotation === 90 || rotation === 270) {
    out.width = srcCanvas.height; out.height = srcCanvas.width
  } else {
    out.width = srcCanvas.width; out.height = srcCanvas.height
  }
  const ctx = out.getContext('2d')
  ctx.translate(out.width / 2, out.height / 2)
  ctx.rotate(rad)
  ctx.drawImage(srcCanvas, -srcCanvas.width / 2, -srcCanvas.height / 2)
  return out
}

function grayscaleInPlace(ctx, w, h) {
  const id = ctx.getImageData(0, 0, w, h)
  const d = id.data
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    d[i] = d[i + 1] = d[i + 2] = l
  }
  ctx.putImageData(id, 0, 0)
}

function autoLevelsInPlace(ctx, w, h, opts = {}) {
  const id = ctx.getImageData(0, 0, w, h)
  const d = id.data
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]
  for (let i = 0; i < d.length; i += 4) {
    hist[0][d[i]]++; hist[1][d[i + 1]]++; hist[2][d[i + 2]]++
  }
  const total = w * h
  const clip = Math.max(1, Math.floor(total * 0.005))
  const findBounds = (h_) => {
    let lo = 0, hi = 255, acc = 0
    for (lo = 0; lo < 255; lo++) { acc += h_[lo]; if (acc > clip) break }
    acc = 0
    for (hi = 255; hi > 0; hi--) { acc += h_[hi]; if (acc > clip) break }
    if (hi <= lo) { lo = 0; hi = 255 }
    return [lo, hi]
  }
  const bounds = hist.map(findBounds)
  const contrastBoost = opts.boost ? 1.1 : 1.0
  const luts = bounds.map(([lo, hi]) => {
    const arr = new Uint8ClampedArray(256)
    const range = Math.max(1, hi - lo)
    for (let v = 0; v < 256; v++) {
      let nv = ((v - lo) / range) * 255
      nv = (nv - 127.5) * contrastBoost + 127.5
      arr[v] = nv
    }
    return arr
  })
  for (let i = 0; i < d.length; i += 4) {
    d[i] = luts[0][d[i]]
    d[i + 1] = luts[1][d[i + 1]]
    d[i + 2] = luts[2][d[i + 2]]
  }
  ctx.putImageData(id, 0, 0)
}

// B&W uses OpenCV's adaptive threshold when available (much better on
// uneven scan lighting than a single global threshold), with a plain
// global-mean fallback if OpenCV isn't ready.
function applyBlackWhite(srcCanvas, cv) {
  if (cv) {
    let src = null, gray = null, blurred = null, thresh = null
    try {
      src = cv.imread(srcCanvas)
      gray = new cv.Mat()
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
      blurred = new cv.Mat()
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)
      thresh = new cv.Mat()
      cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 35, 15)
      const out = document.createElement('canvas')
      out.width = srcCanvas.width; out.height = srcCanvas.height
      cv.imshow(out, thresh)
      return out
    } catch (e) {
      console.warn('OpenCV B&W failed, using fallback:', e)
    } finally {
      [src, gray, blurred, thresh].forEach(m => { if (m && m.delete) m.delete() })
    }
  }
  const out = document.createElement('canvas')
  out.width = srcCanvas.width; out.height = srcCanvas.height
  const ctx = out.getContext('2d')
  ctx.drawImage(srcCanvas, 0, 0)
  const id = ctx.getImageData(0, 0, out.width, out.height)
  const d = id.data
  let sum = 0, n = 0
  const gray = new Uint8ClampedArray(out.width * out.height)
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    gray[p] = l; sum += l; n++
  }
  const mean = sum / Math.max(1, n)
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const v = gray[p] > mean ? 255 : 0
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(id, 0, 0)
  return out
}

export function applyFilterToCanvas(srcCanvas, filter, cv) {
  if (filter === 'bw') return applyBlackWhite(srcCanvas, cv)

  const out = document.createElement('canvas')
  out.width = srcCanvas.width; out.height = srcCanvas.height
  const ctx = out.getContext('2d')
  ctx.drawImage(srcCanvas, 0, 0)

  if (filter === 'original') {
    return out
  } else if (filter === 'gray') {
    grayscaleInPlace(ctx, out.width, out.height)
    autoLevelsInPlace(ctx, out.width, out.height, {})
  } else if (filter === 'enhance') {
    autoLevelsInPlace(ctx, out.width, out.height, { boost: true })
  } else {
    autoLevelsInPlace(ctx, out.width, out.height, {})
  }
  return out
}

export function filterLabel(f) {
  return { original: 'Original', color: 'Color', gray: 'Grayscale', bw: 'Black & White', enhance: 'Auto-Enhance' }[f] || f
}

export function renderPageFinalCanvas(page, cv) {
  const rotated = applyRotation(page.rawCanvas, page.rotation)
  return applyFilterToCanvas(rotated, page.filter, cv)
}

// No true projective transform without OpenCV — crops the corners'
// bounding box instead of leaving the user with a broken tool.
export function manualPerspectiveWarpFallback(shot, cp, outW, outH) {
  const xs = [cp.topLeftCorner.x, cp.topRightCorner.x, cp.bottomLeftCorner.x, cp.bottomRightCorner.x]
  const ys = [cp.topLeftCorner.y, cp.topRightCorner.y, cp.bottomLeftCorner.y, cp.bottomRightCorner.y]
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const out = document.createElement('canvas')
  out.width = outW; out.height = outH
  out.getContext('2d').drawImage(shot, minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY), 0, 0, outW, outH)
  return out
}

export function extractCroppedCanvas(shot, cp, scanner) {
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
  const topW = dist(cp.topLeftCorner, cp.topRightCorner)
  const botW = dist(cp.bottomLeftCorner, cp.bottomRightCorner)
  const leftH = dist(cp.topLeftCorner, cp.bottomLeftCorner)
  const rightH = dist(cp.topRightCorner, cp.bottomRightCorner)

  let outW = Math.round(Math.max(topW, botW))
  let outH = Math.round(Math.max(leftH, rightH))
  const MAXDIM = 2200
  const shrink = Math.min(1, MAXDIM / Math.max(outW, outH, 1))
  outW = Math.max(50, Math.round(outW * shrink))
  outH = Math.max(50, Math.round(outH * shrink))

  if (scanner) {
    try {
      const extracted = scanner.extractPaper(shot, outW, outH, cp)
      if (extracted) return extracted
    } catch (e) {
      console.warn('extractPaper failed, using fallback crop:', e)
    }
  }
  return manualPerspectiveWarpFallback(shot, cp, outW, outH)
}

export function detectCornersOnCanvas(canvas, scanner, cv) {
  if (!scanner || !cv) return null
  let mat = null, contour = null
  try {
    mat = cv.imread(canvas)
    contour = scanner.findPaperContour(mat)
    if (!contour) return null
    const cp = scanner.getCornerPoints(contour, mat)
    if (!cp || !cp.topLeftCorner) return null
    return cp
  } catch (e) {
    console.warn('Edge detection failed, falling back to manual crop:', e)
    return null
  } finally {
    if (contour && contour.delete) contour.delete()
    if (mat && mat.delete) mat.delete()
  }
}