import { useTheme } from '../context/ThemeContext'

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <button className="theme-toggle" onClick={toggleTheme}>
      <span className="dot"></span>
      <span>{theme === 'light' ? 'DARK MODE' : 'LIGHT MODE'}</span>
    </button>
  )
}

export default ThemeToggle