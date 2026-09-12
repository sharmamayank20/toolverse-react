import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { TOOLS, CATEGORIES } from '../config/toolsRegistry'
import LogoLoop from '../components/LogoLoop'
import PhotoReel from '../components/PhotoReel'
import CreatorAvatarCard from '../components/CreatorAvatarCard'
import StoryChapter from '../components/StoryChapter'
import {
  Atom, Zap, Sparkles, Box, Orbit, Activity, Route, Palette,
  GitBranch, Briefcase, Globe, ShieldAlert, Gamepad2, HeartPulse, ChevronDown,
} from 'lucide-react'

const EASE = [0.22, 1, 0.36, 1]

const TECH_LOGOS = [
  { node: <><Atom size={26} /><span className="logoloop__node-label">React</span></>, href: 'https://react.dev' },
  { node: <><Zap size={26} /><span className="logoloop__node-label">Vite</span></>, href: 'https://vite.dev' },
  { node: <><Sparkles size={26} /><span className="logoloop__node-label">Framer Motion</span></>, href: 'https://motion.dev' },
  { node: <><Box size={26} /><span className="logoloop__node-label">Three.js</span></>, href: 'https://threejs.org' },
  { node: <><Orbit size={26} /><span className="logoloop__node-label">Rapier Physics</span></>, href: 'https://rapier.rs' },
  { node: <><Activity size={26} /><span className="logoloop__node-label">GSAP</span></>, href: 'https://gsap.com' },
  { node: <><Route size={26} /><span className="logoloop__node-label">React Router</span></>, href: 'https://reactrouter.com' },
  { node: <><Palette size={26} /><span className="logoloop__node-label">Lucide</span></>, href: 'https://lucide.dev' },
]

function About() {
  const gameCount = TOOLS.filter((t) => t.category === 'Arcade').length

  return (
    <div className="about-page">
      <section className="about-hero">
        <div className="about-hero-text">
          <p className="about-hero-eyebrow">ABOUT.SYS</p>
          <h1 className="about-hero-title">WHY THIS EXISTS</h1>
          <p className="about-hero-lede">
            I was always fascinated by how things worked on the internet.
            As a kid, that curiosity didn't really have anywhere to go —
            then I got the exposure I needed, and it didn't end the
            curiosity. It gave it a boost.
          </p>
        </div>
        <img src="/icon-mark.svg" alt="TOOLVERSE" className="about-hero-mark" />
      </section>

      <motion.div
        className="about-scroll-cue"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <span>SCROLL TO KNOW WHY</span>
        <ChevronDown size={18} />
      </motion.div>

      <section className="about-story-chapters">
        <StoryChapter number="01" align="left" icon={ShieldAlert} title="Why the PDF tools exist">
          Once I started using sites for everyday, formal things, I noticed
          how many of them quietly stored and sold data without ever really
          asking permission. So I decided to design my own set of tools
          instead — ones that just do the job and don't take anything with
          them. That's how the PDF tools were born.
        </StoryChapter>

        <StoryChapter number="02" align="right" icon={Gamepad2} title="The Game Room idea">
          One night, I was playing games with my friends when someone’s phone suddenly died. 
          Nobody else could jump in, and just like that, our game night was totally ruined. 
          That exact moment of frustration made me think: why can't we just hop into a web browser and play together instantly? 
          That’s how the idea for these online game rooms—complete with live video and audio—was born.
        </StoryChapter>

        <StoryChapter number="03" align="left" icon={HeartPulse} title="The hospital story">
          I was at a hospital once, trying to print my medical reports from a public kiosk. 
          The printout came out looking terrible, so I wanted to email the digital file to myself instead. 
          But there was no way I was logging into my personal email on a public computer. 
          Learning about tools like wormhole.io made me realize how common this problem is—and made me think, I can actually build this myself. 
          That’s how the peer-to-peer file sharing tool was born. It doesn't save or track a single thing; 
          it just passes files straight from one device to another.
        </StoryChapter>
      </section>

      <section className="about-pullquote">
        <p className="about-pullquote-text">
          "Created" would be an understatement. I sculpted them.<br />
          This isn't a side hustle for a résumé — it's my child, built for
          people who actually need it.<br />
          A lot of my heart and soul went into making this.
        </p>
      </section>

      <section className="about-photoreel">
        <p className="about-photoreel-heading">THE JOURNEY, IN PICTURES</p>
        <PhotoReel count={20} />
      </section>

      <section className="about-stats">
        <div className="about-stat">
          <span className="about-stat-num">{TOOLS.length}</span>
          <span className="about-stat-label">Tools &amp; games</span>
        </div>
        <div className="about-stat">
          <span className="about-stat-num">{CATEGORIES.length}</span>
          <span className="about-stat-label">Categories</span>
        </div>
        <div className="about-stat">
          <span className="about-stat-num">{gameCount}</span>
          <span className="about-stat-label">Arcade games</span>
        </div>
      </section>

      <section className="about-techloop">
        <p className="about-techloop-heading">BUILT WITH</p>
        <LogoLoop
          logos={TECH_LOGOS}
          speed={70}
          direction="left"
          logoHeight={26}
          gap={56}
          fadeOut
          scaleOnHover
          ariaLabel="Technologies used to build TOOLVERSE"
        />
      </section>

      <section className="about-opensource">
        <p className="about-opensource-heading">GIVING BACK</p>
        <p className="about-opensource-text">
          None of this exists in a vacuum. TOOLVERSE runs on React, Vite,
          Framer Motion, Three.js, Rapier, GSAP, and dozens of other
          projects built by people who gave their work away for free —
          including several of the actual interactive pieces on this very
          page, pulled straight from{' '}
          <a href="https://reactbits.dev" target="_blank" rel="noreferrer">reactbits.dev</a>.
          Curiosity doesn't scale alone; it scales because someone else
          already solved the hard part and shared it. If anything built
          here ever helps you build your own version of "I'll just make
          one more tool," that's the whole point of putting it back out
          into the world.
        </p>
      </section>

      <section className="about-creator">
        <CreatorAvatarCard initials="MS" imageSrc="/og-image-tall.png" />
        <div className="about-creator-text">
          <p className="about-creator-eyebrow">THE PERSON BEHIND IT</p>
          <h2 className="about-creator-name">Mayank Sharma</h2>
          <p className="about-creator-bio">
            One person, building tools for the same reason they always
            have — curiosity that never really quit, and a habit of
            building the thing myself when nothing else fit.
          </p>
          <div className="about-creator-links">
            <a href="https://github.com/sharmamayank20" target="_blank" rel="noreferrer" className="btn-mini" aria-label="GitHub"><GitBranch size={14} /> GitHub</a>
            <a href="https://www.linkedin.com/in/mayank-sharma-496a1935a/" target="_blank" rel="noreferrer" className="btn-mini" aria-label="LinkedIn"><Briefcase size={14} /> LinkedIn</a>
            <a href="https://github.com/sharmamayank20/BLITZ" target="_blank" rel="noreferrer" className="btn-mini" aria-label="Portfolio"><Globe size={14} /> Portfolio</a>
          </div>
        </div>
      </section>

      <section className="about-roadmap">
        <p className="about-roadmap-heading">WHAT'S NEXT</p>
        <div className="about-roadmap-list">
          {/* Placeholder roadmap items -- swap for the real ones whenever you have them */}
          <span className="about-roadmap-item">More Arcade games</span>
          <span className="about-roadmap-item">Expanded PDF toolset</span>
          <span className="about-roadmap-item">Dark mode refinements</span>
          <span className="about-roadmap-item">People's Recommendations</span>
        </div>
      </section>

      <section className="about-cta">
        <h2 className="about-cta-title">GO BUILD SOMETHING</h2>
        <p className="about-cta-sub">Thirty-Seven tools and counting. Go find one.</p>
        <Link to="/" className="btn-primary inline">Explore the catalog →</Link>
      </section>
    </div>
  )
}

export default About
