// Pure formatting/validation helpers for PPT to PDF -- no React, no DOM
// except where noted (countSlides reads the File's own bytes, no document
// access).

export const MAX_FILE_BYTES = 50 * 1024 * 1024 // presentations can carry embedded media -- same generous cap as Compress PDF

export function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0, v = bytes
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function validatePptFile(file) {
  if (!file) return { ok: false, msg: 'No presentation selected.' }
  const name = (file.name || '').toLowerCase()
  const isPpt = name.endsWith('.ppt') || name.endsWith('.pptx') ||
    file.type === 'application/vnd.ms-powerpoint' ||
    file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  if (!isPpt) return { ok: false, msg: 'Only .ppt or .pptx files are accepted.' }
  if ((file.size || 0) > MAX_FILE_BYTES) return { ok: false, msg: `File exceeds ${formatBytes(MAX_FILE_BYTES)}.` }
  return { ok: true }
}

// Slide count straight from the .pptx's own zip structure
// (ppt/slides/slide1.xml, slide2.xml, ...) -- no rendering needed, just
// counting entries. Legacy .ppt is a binary OLE file, not a zip, so this
// will reject for those; callers should treat that as "unknown slide
// count" and hide the stat, not as a validation failure -- the file
// itself is still perfectly convertible server-side.
export async function countSlides(file) {
  const JSZip = (await import('jszip')).default
  const buf = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(buf)
  const slideFiles = zip.file(/^ppt\/slides\/slide\d+\.xml$/)
  return slideFiles.length
}
