// Pure formatting/validation helpers for Excel to PDF -- no React, no DOM
// except where noted (countSheets reads the File's own bytes).

export const MAX_FILE_BYTES = 20 * 1024 * 1024 // matches the legacy tool's own stated cap -- spreadsheets are rarely huge

export function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0, v = bytes
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function validateExcelFile(file) {
  if (!file) return { ok: false, msg: 'No file selected.' }
  const name = (file.name || '').toLowerCase()
  const isXls = name.endsWith('.xlsx') || name.endsWith('.xls') ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel'
  if (!isXls) return { ok: false, msg: 'Only .xlsx or .xls files are accepted.' }
  if ((file.size || 0) > MAX_FILE_BYTES) return { ok: false, msg: `File exceeds ${formatBytes(MAX_FILE_BYTES)}.` }
  return { ok: true }
}

// Real sheet count straight from the .xlsx's own zip structure
// (xl/worksheets/sheet1.xml, sheet2.xml, ...) -- same technique as
// countSlides in pptToPdfHelpers.js. Legacy .xls is a binary OLE file,
// not a zip, so this will reject for those; callers should treat that
// as "unknown sheet count" and hide the stat, not as a validation
// failure -- the file itself still converts fine server-side.
export async function countSheets(file) {
  const JSZip = (await import('jszip')).default
  const buf = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(buf)
  const sheetFiles = zip.file(/^xl\/worksheets\/sheet\d+\.xml$/)
  return sheetFiles.length
}
