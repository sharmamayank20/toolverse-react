const ITEMS = [
  { label: 'Speed', desc: 'Everything runs instantly. No loading screens, no waiting.', color: 'cobalt' },
  { label: 'Privacy', desc: 'Client-side tools never leave your browser. No tracking.', color: 'acid' },
  { label: 'Free', desc: 'Every tool, no paywall, no sign-up. Just use it.', color: 'coral' },
  { label: 'Growing', desc: 'New tools get added constantly. The catalog never stops.', color: 'cobalt' },
]

function FlowingMenu() {
  return (
    <div className="flow-menu">
      {ITEMS.map(item => (
        <div key={item.label} className={`flow-row ${item.color}`}>
          <span className="flow-label">{item.label}</span>
          <span className="flow-desc">{item.desc}</span>
          <div className="flow-marquee">
            <div className="flow-track">
              {Array(18).fill(item.label.toUpperCase()).map((t, i) => (
                <span key={i}>{t} ·</span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default FlowingMenu