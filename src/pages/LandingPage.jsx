import Hero from '../components/Hero'
import SearchBand from '../components/SearchBand'
import ToolCard from '../components/ToolCard'
import FlowingMenu from '../components/FlowingMenu'
import CardSwap from '../components/CardSwap'
import TileScroll from '../components/TileScroll'
import { TOOLS, CATEGORIES } from '../config/toolsRegistry'

function LandingPage() {
  return (
    <div>
      <Hero />
      <SearchBand />
      <FlowingMenu />
      <section style={{ maxWidth: '1200px', margin: '0 auto', padding: '56px 40px 120px' }}>
        {CATEGORIES.map(category => {
          const tools = TOOLS.filter(t => t.category === category)
          if (tools.length === 0) return null
          return (
            <div key={category} style={{ marginBottom: '64px' }}>
              <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '22px', textTransform: 'uppercase', marginBottom: '24px' }}>
                {category}
              </h2>
              <div className="grid">
                {tools.map(tool => <ToolCard key={tool.id} tool={tool} />)}
              </div>
            </div>
          )
        })}
      </section>
      <CardSwap />
      <TileScroll />
    </div>
  )
}

export default LandingPage