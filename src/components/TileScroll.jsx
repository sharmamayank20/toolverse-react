const UPCOMING = [
  { icon: 'Rx', name: 'Regex Tester' },
  { icon: '64', name: 'Base64 Encoder' },
  { icon: 'Md', name: 'Markdown Preview' },
  { icon: 'Δ', name: 'Diff Checker' },
  { icon: '#', name: 'Hash Generator' },
  { icon: 'Lk', name: 'URL Shortener' },
]

function TileScroll() {
  const looped = [...UPCOMING, ...UPCOMING]

  return (
    <div className="tile-scroll-wrap">
      <div className="tile-scroll-label">MORE IN THE CATALOG //</div>
      <div className="tile-scroll">
        <div className="tile-track">
          {looped.map((tile, i) => (
            <div className="mini-tile" key={i}>
              <span className="mini-icon">{tile.icon}</span>
              <span className="mini-name">{tile.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default TileScroll