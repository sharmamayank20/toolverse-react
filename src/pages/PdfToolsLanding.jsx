import { TOOLS } from '../config/toolsRegistry'
import ToolCard from '../components/ToolCard'

// Tools not yet ported (no route, no card) — purely descriptive preview
// tiles so people can see what's coming. NOT part of the TOOLS registry,
// so this never risks a dead link. Remove an item here the same session
// its real tool is registered in toolsRegistry.js.
const PDF_TOOLS_COMING_SOON = [
  'Merge PDF', 'Split PDF', 'JPG to PDF', 'PDF to JPG', 'Scan to PDF',
  'Word to PDF', 'Excel to PDF', 'Watermark PDF', 'Organize PDF',
  'Crop PDF', 'Secure PDF', 'Sign PDF',
]

function PdfToolsLanding() {
  const pdfTools = TOOLS.filter(t => t.category === 'PDF Tools')

  return (
    <div>
      <div className="pdftools-landing-hero">
        <div className="pdftools-landing-eyebrow">PDF.SYS / {pdfTools.length + PDF_TOOLS_COMING_SOON.length} TOOLS</div>
        <h1>PDF Tools</h1>
        <p>Compress, convert, merge, and sign — every PDF utility in one place.</p>
      </div>

      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 40px 80px' }}>
        {pdfTools.length > 0 && (
          <div className="grid">
            {pdfTools.map(tool => <ToolCard key={tool.id} tool={tool} />)}
          </div>
        )}

        {PDF_TOOLS_COMING_SOON.length > 0 && (
          <div className="pdftools-soon-section">
            <h3 className="pdftools-soon-heading">Coming Soon</h3>
            <div className="pdftools-soon-grid">
              {PDF_TOOLS_COMING_SOON.map(name => (
                <div key={name} className="pdftools-soon-tile">{name}</div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

export default PdfToolsLanding