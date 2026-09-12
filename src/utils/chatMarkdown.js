/* ================================================================
   src/utils/chatMarkdown.js
   Pure string-transform markdown/code renderer for the AI Assistant
   tool. No DOM, no React — safe to unit-test by reading.
   Ported from the legacy chatbot.js render engine.
   ================================================================ */

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/* -------------------- syntax highlighting -------------------- */

const LANG_ALIAS = {
  js: 'js', javascript: 'js', jsx: 'js', mjs: 'js', cjs: 'js',
  ts: 'js', typescript: 'js', tsx: 'js',
  py: 'python', python: 'python', python3: 'python',
  sh: 'bash', bash: 'bash', shell: 'bash', zsh: 'bash', console: 'bash',
  json: 'json', jsonc: 'json',
  html: 'html', xml: 'html', svg: 'html',
  css: 'css', scss: 'css', sass: 'css',
}

function normalizeLang(lang) {
  if (!lang) return ''
  const key = lang.toLowerCase().trim()
  return LANG_ALIAS[key] || key
}

const KEYWORDS = {
  js: new Set(['const','let','var','function','return','if','else','for','while','class','import','export','default','from','async','await','new','this','try','catch','finally','throw','typeof','instanceof','extends','super','null','undefined','true','false','switch','case','break','continue','static','get','set','yield','of','in','do','delete','void']),
  python: new Set(['def','return','if','elif','else','for','while','class','import','from','as','try','except','finally','raise','with','lambda','yield','pass','break','continue','and','or','not','in','is','None','True','False','self','async','await','global','nonlocal','del','assert','print']),
  bash: new Set(['if','then','else','elif','fi','for','do','done','while','case','esac','function','return','export','local','echo','exit','in','set','shift']),
  json: new Set(['true','false','null']),
}

const TOKEN_PATTERNS = {
  js: /\/\/.*|\/\*[\s\S]*?\*\/|`[\s\S]*?`|"[^"\n]*"|'[^'\n]*'|\b\d+(?:\.\d+)?\b|[A-Za-z_$][A-Za-z0-9_$]*/g,
  python: /#.*|"""[\s\S]*?"""|'''[\s\S]*?'''|"[^"\n]*"|'[^'\n]*'|\b\d+(?:\.\d+)?\b|[A-Za-z_][A-Za-z0-9_]*/g,
  bash: /#.*|"[^"\n]*"|'[^'\n]*'|\b\d+(?:\.\d+)?\b|[A-Za-z_][A-Za-z0-9_]*/g,
  json: /"[^"\n]*"|\b\d+(?:\.\d+)?\b|true|false|null/g,
  html: /<!--[\s\S]*?-->|<\/?[A-Za-z][A-Za-z0-9-]*|"[^"\n]*"|'[^'\n]*'|[A-Za-z-]+(?=\s*=)|\/?>/g,
  css: /\/\*[\s\S]*?\*\/|"[^"\n]*"|'[^'\n]*'|#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms)?\b|[.#]?[A-Za-z-][A-Za-z0-9-]*(?=\s*[:{])/g,
}

function classifyToken(match, lang) {
  if (lang === 'html') {
    if (match.startsWith('<!--')) return 'comment'
    if (/^<\/?[A-Za-z]/.test(match)) return 'tag'
    if (match === '>' || match === '/>') return 'tag'
    if (/^["']/.test(match)) return 'string'
    return 'attr'
  }
  if (lang === 'css') {
    if (match.startsWith('/*')) return 'comment'
    if (/^["']/.test(match)) return 'string'
    if (/^#[0-9a-fA-F]{3,8}$/.test(match)) return 'number'
    if (/^\d/.test(match)) return 'number'
    return 'attr'
  }
  if (match.startsWith('//') || match.startsWith('#') || match.startsWith('/*')) return 'comment'
  if (/^["'`]/.test(match)) return 'string'
  if (/^\d/.test(match)) return 'number'
  const kws = KEYWORDS[lang]
  if (kws && kws.has(match)) return 'keyword'
  return null
}

function highlightCode(code, langRaw) {
  const lang = normalizeLang(langRaw)
  const pattern = TOKEN_PATTERNS[lang]
  if (!pattern) return escapeHtml(code)

  let out = ''
  let lastIndex = 0
  pattern.lastIndex = 0
  let m
  while ((m = pattern.exec(code)) !== null) {
    if (m.index > lastIndex) out += escapeHtml(code.slice(lastIndex, m.index))
    const type = classifyToken(m[0], lang)
    const esc = escapeHtml(m[0])
    out += type ? `<span class="tok-${type}">${esc}</span>` : esc
    lastIndex = pattern.lastIndex
    if (m[0].length === 0) pattern.lastIndex++
  }
  out += escapeHtml(code.slice(lastIndex))
  return out
}

/* -------------------- inline formatting -------------------- */

function inlineFormat(raw) {
  const inlineCodes = []
  let s = raw.replace(/`([^`\n]+)`/g, (_, code) => {
    const idx = inlineCodes.length
    inlineCodes.push(code)
    return `\u0000IC${idx}\u0000`
  })

  s = escapeHtml(s)

  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, txt, url) =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer">${txt}</a>`)

  s = s.replace(/https?:\/\/[^\s<]+/g, (url, offset, full) => {
    const before = full.slice(Math.max(0, offset - 6), offset)
    if (before.includes('href="')) return url
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  })

  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/__(.+?)__/g, '<strong>$1</strong>')
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>')

  s = s.replace(/\u0000IC(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(inlineCodes[Number(i)])}</code>`)
  return s
}

/* -------------------- code block rendering -------------------- */

// Inline SVG (Lucide "copy" glyph) — replaces the old emoji so the
// generated HTML string stays compliant with the no-emoji rule even
// though it's inserted via dangerouslySetInnerHTML.
const COPY_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="0" ry="0"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>'

let codeBlockCounter = 0
const codeBlockStore = new Map()

export function resetCodeBlockStore() {
  codeBlockCounter = 0
  codeBlockStore.clear()
}

export function getStoredCode(id) {
  return codeBlockStore.get(id) || ''
}

function renderCodeBlock({ lang, code }) {
  const id = `cb-${codeBlockCounter++}`
  codeBlockStore.set(id, code)
  const displayLang = lang ? lang : 'text'
  const highlighted = highlightCode(code, lang)
  return `<div class="code-block"><div class="code-block-header"><span class="code-lang">${escapeHtml(displayLang)}</span><button type="button" class="code-copy-btn" data-code-id="${id}">${COPY_ICON_SVG}<span>Copy</span></button></div><pre><code>${highlighted}</code></pre></div>`
}

function renderTable(lines) {
  const parseRow = (line) => line.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim())
  const header = parseRow(lines[0])
  const rows = lines.slice(2).map(parseRow)
  let html = '<table class="md-table"><thead><tr>'
  header.forEach(h => { html += `<th>${inlineFormat(h)}</th>` })
  html += '</tr></thead><tbody>'
  rows.forEach(r => {
    html += '<tr>'
    r.forEach(c => { html += `<td>${inlineFormat(c)}</td>` })
    html += '</tr>'
  })
  html += '</tbody></table>'
  return html
}

/* -------------------- block-level parser -------------------- */

export function renderMessageHTML(rawText) {
  let text = String(rawText ?? '')
  const codeBlocks = []

  text = text.replace(/```([\w+-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length
    codeBlocks.push({ lang: (lang || '').trim(), code: code.replace(/\n$/, '') })
    return `\u0000CODEBLOCK${idx}\u0000`
  })

  // handle a dangling/unterminated fence — matters for streaming responses
  const fenceCount = (text.match(/```/g) || []).length
  if (fenceCount > 0) {
    const lastFenceIdx = text.lastIndexOf('```')
    const before = text.slice(0, lastFenceIdx)
    let after = text.slice(lastFenceIdx + 3)
    let lang = ''
    const firstNewline = after.indexOf('\n')
    if (firstNewline !== -1) {
      const firstLine = after.slice(0, firstNewline).trim()
      if (firstLine.length > 0 && firstLine.length < 20 && /^[\w+-]*$/.test(firstLine)) {
        lang = firstLine
        after = after.slice(firstNewline + 1)
      }
    }
    const idx = codeBlocks.length
    codeBlocks.push({ lang, code: after })
    text = before + `\u0000CODEBLOCK${idx}\u0000`
  }

  const lines = text.split('\n')
  const blocks = []
  let i = 0

  const isHeading = (l) => /^#{1,6}\s+/.test(l)
  const isQuote = (l) => /^>\s?/.test(l)
  const isUl = (l) => /^\s*[-*+]\s+/.test(l)
  const isOl = (l) => /^\s*\d+\.\s+/.test(l)
  const isTableRow = (l) => /^\|.*\|\s*$/.test(l)
  const isTableSep = (l) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l)
  const isCodeToken = (l) => /^\u0000CODEBLOCK\d+\u0000$/.test(l.trim())

  while (i < lines.length) {
    const line = lines[i]

    if (isCodeToken(line)) { blocks.push({ type: 'codeplaceholder', token: line.trim() }); i++; continue }
    if (line.trim() === '') { i++; continue }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2] })
      i++; continue
    }

    if (isQuote(line)) {
      const qLines = []
      while (i < lines.length && isQuote(lines[i])) { qLines.push(lines[i].replace(/^>\s?/, '')); i++ }
      blocks.push({ type: 'blockquote', text: qLines.join('\n') })
      continue
    }

    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const tLines = [line, lines[i + 1]]
      i += 2
      while (i < lines.length && isTableRow(lines[i])) { tLines.push(lines[i]); i++ }
      blocks.push({ type: 'table', lines: tLines })
      continue
    }

    if (isUl(line)) {
      const items = []
      while (i < lines.length && isUl(lines[i])) { items.push(lines[i].replace(/^\s*[-*+]\s+/, '')); i++ }
      blocks.push({ type: 'ul', items })
      continue
    }

    if (isOl(line)) {
      const items = []
      while (i < lines.length && isOl(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++ }
      blocks.push({ type: 'ol', items })
      continue
    }

    const paraLines = [line]
    i++
    while (
      i < lines.length && lines[i].trim() !== '' &&
      !isHeading(lines[i]) && !isQuote(lines[i]) && !isUl(lines[i]) &&
      !isOl(lines[i]) && !isTableRow(lines[i]) && !isCodeToken(lines[i])
    ) { paraLines.push(lines[i]); i++ }
    blocks.push({ type: 'p', text: paraLines.join('\n') })
  }

  let html = ''
  for (const b of blocks) {
    if (b.type === 'codeplaceholder') {
      const idx = Number(b.token.match(/\d+/)[0])
      html += renderCodeBlock(codeBlocks[idx])
    } else if (b.type === 'heading') {
      html += `<div class="md-heading md-h${b.level}">${inlineFormat(b.text)}</div>`
    } else if (b.type === 'blockquote') {
      html += `<blockquote>${b.text.split('\n').map(inlineFormat).join('<br>')}</blockquote>`
    } else if (b.type === 'ul') {
      html += `<ul>${b.items.map(it => `<li>${inlineFormat(it)}</li>`).join('')}</ul>`
    } else if (b.type === 'ol') {
      html += `<ol>${b.items.map(it => `<li>${inlineFormat(it)}</li>`).join('')}</ol>`
    } else if (b.type === 'table') {
      html += renderTable(b.lines)
    } else if (b.type === 'p') {
      html += `<p>${b.text.split('\n').map(inlineFormat).join('<br>')}</p>`
    }
  }
  return html
}