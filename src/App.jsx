import { Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Marquee from './components/Marquee'
import ScrollToTop from './components/ScrollToTop'
import LandingPage from './pages/LandingPage'
import PdfToolsLanding from './pages/PdfToolsLanding'
import GamesLanding from './pages/GamesLanding'
import About from './pages/About'
import NotFound from './pages/NotFound'
import { TOOLS } from './config/toolsRegistry'
import CursorTag from './components/CursorTag'
import AmbientPlayer from './components/AmbientPlayer'

const EASE = [0.22, 1, 0.36, 1]

// Every other route uses the same fade/slide transition below -- deliberately
// unchanged, so it stays a quiet default. /about gets its own one-time
// "unfold" reveal instead: a circle wipe expanding out from roughly where
// the AboutBadge sits in the navbar (top-right), since that's what the
// person actually clicked. This is the one orchestrated motion moment for
// the site, not a pattern to copy onto other routes.
const DEFAULT_VARIANTS = {
  initial: { opacity: 0, y: 14, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -14, scale: 0.985 },
}
const ABOUT_VARIANTS = {
  initial: { clipPath: 'circle(0% at 96% 4%)' },
  animate: { clipPath: 'circle(150% at 96% 4%)' },
  exit: { clipPath: 'circle(0% at 96% 4%)' },
}

function App() {
  const location = useLocation()
  const isLanding = location.pathname === '/'
  const isGamesLanding = location.pathname === '/games'
  const isAbout = location.pathname === '/about'
  const currentTool = TOOLS.find((t) => t.path === location.pathname)
  const isArcade = currentTool?.category === 'Arcade' || isGamesLanding

  return (
    <div
       className={isArcade ? 'arcade-active' : undefined}
       style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
     >
      <ScrollToTop />
      {!isGamesLanding && <CursorTag />}
      <AmbientPlayer />
      <AnimatePresence>
        {isLanding && (
          <motion.div
            key="marquee"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 42, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
            style={{ overflow: 'hidden' }}
          >
            <Marquee />
          </motion.div>
        )}
      </AnimatePresence>
      <Navbar isArcade={isArcade} />
      <AnimatePresence mode="wait">
        <motion.main
          key={location.pathname}
          variants={isAbout ? ABOUT_VARIANTS : DEFAULT_VARIANTS}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: isAbout ? 0.6 : 0.35, ease: EASE }}
          style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        >
          <Routes location={location}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/pdf-tools" element={<PdfToolsLanding />} />
            <Route path="/games" element={<GamesLanding />} />
            <Route path="/about" element={<About />} />
            {TOOLS.map((tool) => (
              <Route key={tool.id} path={tool.path} element={<tool.component />} />
            ))}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </motion.main>
      </AnimatePresence>
      <Footer />
    </div>
  )
}

export default App
