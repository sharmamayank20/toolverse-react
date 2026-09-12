export const MAX_FILE_BYTES = 20 * 1024 * 1024

export function validateOrganizePdfFile(file) {
  if (!file) return { ok: false, msg: 'No PDF selected.' }
  const isPdf = (file.name || '').toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'
  if (!isPdf) return { ok: false, msg: 'Only PDF files are accepted.' }
  if ((file.size || 0) > MAX_FILE_BYTES) return { ok: false, msg: 'File exceeds 20 MB.' }
  return { ok: true }
}

export function hasAnyChanges(pages) {
  return pages.some(p => p.rotation !== 0 || p.deleted) ||
    pages.some((p, i) => p.pageNum !== i + 1)
}

export function activePageCount(pages) {
  return pages.filter(p => !p.deleted).length
}