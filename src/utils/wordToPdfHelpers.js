export const MAX_FILE_BYTES = 20 * 1024 * 1024

export function validateWordFile(file) {
  if (!file) return { ok: false, msg: 'No file selected.' }
  const name = (file.name || '').toLowerCase()
  const type = file.type || ''
  const isDoc = name.endsWith('.docx') || name.endsWith('.doc') ||
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    type === 'application/msword'
  if (!isDoc) return { ok: false, msg: 'Only .docx or .doc files are accepted.' }
  if ((file.size || 0) > MAX_FILE_BYTES) return { ok: false, msg: 'File exceeds 20 MB limit.' }
  return { ok: true }
}

export function isDocxFile(file) {
  const name = (file.name || '').toLowerCase()
  return name.endsWith('.docx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

// Rough estimate only — genuine page count depends on LibreOffice's
// actual layout (fonts, margins, page breaks), which isn't knowable
// client-side. Word count is a meaningfully better proxy than raw file
// size, since file size is dominated by embedded images/fonts that
// have nothing to do with how many pages of text there are.
export function estimatePagesFromWordCount(wordCount) {
  if (!wordCount) return null
  const WORDS_PER_PAGE = 500
  return Math.max(1, Math.round(wordCount / WORDS_PER_PAGE))
}

export function estimatePagesFromSize(bytes) {
  if (!bytes) return null
  const avg = 160 * 1024
  return Math.max(1, Math.round(bytes / avg))
}