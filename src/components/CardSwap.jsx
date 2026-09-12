import { useState, useEffect } from 'react'

const CARDS = [
  { text: <>NO ADS.<br />EVER.</>, color: 'cobalt' },
  { text: <>BUILT FOR<br />SPEED.</>, color: 'acid' },
  { text: <>OPEN INDEX,<br />ALWAYS GROWING.</>, color: 'coral' },
]

const POSITIONS = [
  { transform: 'translate(0,0) rotate(-1deg) scale(1)', zIndex: 3, opacity: 1 },
  { transform: 'translate(14px,14px) rotate(3deg) scale(0.95)', zIndex: 2, opacity: 0.85 },
  { transform: 'translate(28px,28px) rotate(7deg) scale(0.9)', zIndex: 1, opacity: 0.6 },
]

function CardSwap() {
  const [order, setOrder] = useState([0, 1, 2])

  useEffect(() => {
    const id = setInterval(() => {
      setOrder(prev => {
        const next = [...prev]
        next.push(next.shift())
        return next
      })
    }, 2600)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="card-swap-wrap">
      <div className="swap-label">SIGNALS //</div>
      <div className="swap-stack">
        {order.map((cardIdx, posIdx) => {
          const card = CARDS[cardIdx]
          const pos = POSITIONS[posIdx]
          return (
            <div
              key={cardIdx}
              className={`swap-card ${card.color}`}
              style={{ transform: pos.transform, zIndex: pos.zIndex, opacity: pos.opacity }}
            >
              {card.text}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default CardSwap