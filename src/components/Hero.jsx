import StatCounter from './StatCounter'

function Hero() {
  return (
    <div className="hero">
      <h1>EVERY TOOL YOU NEED, ONE <span className="hl">CLICK</span> AWAY.</h1>
      <div className="hero-side">
        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: 'var(--cobalt)', marginBottom: '10px' }}>
          CATALOG NO. 001&ndash;030
        </p>
        <p style={{ color: 'var(--muted)', lineHeight: 1.6, marginBottom: '20px' }}>
          A running index of text, media, dev, and utility tools. No sign-up, no ads, no bloat.
        </p>
        <div className="stat-row">
          <StatCounter target={30} label="Tools" />
          <StatCounter target={0} label="Sign-ups" />
          <StatCounter target={100} suffix="%" label="Free" />
        </div>
      </div>
    </div>
  )
}

export default Hero