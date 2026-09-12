import { Suspense, lazy } from 'react'
import { TOOLS } from '../config/toolsRegistry'
import GameTile from '../components/GameTile'
import GameTargetCursor from '../components/GameTargetCursor'
import DesktopOnlyGate from '../components/DesktopOnlyGate'

// React.lazy + dynamic import means the three/@react-three/rapier/meshline
// chunk is only ever network-fetched at the moment this component actually
// attempts to render. Since it only renders inside the isDesktop branch of
// DesktopOnlyGate below, mobile/tablet visitors -- and everyone on every
// other page in the app -- never download or execute any of it.
const GameLanyard3D = lazy(() => import('../components/GameLanyard3D'))

function GamesLanding() {
  const games = TOOLS.filter((t) => t.category === 'Arcade')

  return (
    <DesktopOnlyGate toolName="Game Room">
      <div className="arcade-shell games-landing-page">
        <GameTargetCursor />

        <div className="games-landing-hero">
          <Suspense fallback={null}>
            <GameLanyard3D
              frontImage="/lanyard-front.png"
              backImage="/lanyard-back.png"
              // lanyardImage="/lanyard-strap.png"   // optional -- reskins the strap too
            />
          </Suspense>
          <div className="games-landing-eyebrow">ARCADE.SYS // {games.length} GAMES LOADED</div>
          <h1 className="games-landing-title">GAME&nbsp;ROOM</h1>
          <p className="games-landing-tagline">Pick a cabinet. Same device or a private room with friends.</p>
          <div className="games-landing-blink">PRESS START</div>
        </div>

        <section className="games-tile-grid">
          {games.map((game, i) => (
            <GameTile key={game.id} tool={game} index={i} />
          ))}
        </section>
      </div>
    </DesktopOnlyGate>
  )
}

export default GamesLanding
