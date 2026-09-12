export const MAX_FILE_BYTES = 20 * 1024 * 1024
export const MIN_REMAINING_PT = 20 // never let a crop squeeze a page down to nothing

export function validateCropPdfFile(file) {
  if (!file) return { ok: false, msg: 'No PDF selected.' }
  const isPdf = (file.name || '').toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'
  if (!isPdf) return { ok: false, msg: 'Only PDF files are accepted.' }
  if ((file.size || 0) > MAX_FILE_BYTES) return { ok: false, msg: 'File exceeds 20 MB.' }
  return { ok: true }
}

// Single source of truth for clamping a crop value, in points — used by
// both the drag handlers and the numeric input handlers so they can
// never disagree on what's a valid crop.
export function computeClampedCrop(crop, side, rawValuePt, pageWidthPts, pageHeightPts) {
  const isVertical = side === 'top' || side === 'bottom'
  const dimension = isVertical ? pageHeightPts : pageWidthPts
  const oppositeSide = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[side]
  const oppositeVal = crop[oppositeSide] || 0
  const maxAllowed = Math.max(0, dimension - oppositeVal - MIN_REMAINING_PT)
  return { ...crop, [side]: Math.min(Math.max(0, rawValuePt), maxAllowed) }
}

// Re-clamps a stored crop against a (possibly different-sized) page —
// relevant if pages within the same PDF differ in dimensions.
export function clampCropToPage(crop, pageWidthPts, pageHeightPts) {
  return {
    ...crop,
    top: Math.min(crop.top, Math.max(0, pageHeightPts - crop.bottom - MIN_REMAINING_PT)),
    left: Math.min(crop.left, Math.max(0, pageWidthPts - crop.right - MIN_REMAINING_PT)),
  }
}

export function anyCropSet(perPageCrops) {
  return Object.values(perPageCrops).some(c => c.top > 0 || c.bottom > 0 || c.left > 0 || c.right > 0)
}