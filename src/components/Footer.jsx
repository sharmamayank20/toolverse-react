function Footer() {
  return (
    <footer style={{
      borderTop: '3px solid var(--fg)',
      padding: '30px 40px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: '12px',
      color: 'var(--muted)',
      background: 'var(--bg)',
      transition: 'background-color 0.4s var(--ease-smooth), color 0.4s var(--ease-smooth), border-color 0.4s var(--ease-smooth)'
    }}>
      <span>TOOLVERSE by Mayank Sharma</span>
    </footer>
  )
}

export default Footer