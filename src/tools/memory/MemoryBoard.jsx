import { ICON_POOL } from './memoryConstants';

function Card({ card, index, faceUp, dimmed, noMatch, selectable, onClick }) {
  const Icon = ICON_POOL[card.symbol % ICON_POOL.length];
  const cls = [
    'memory-card',
    faceUp ? 'flipped' : '',
    card.matched ? 'matched' : '',
    dimmed ? 'dimmed' : '',
    noMatch ? 'no-match' : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={cls}
      onClick={() => onClick(index)}
      disabled={!selectable}
      aria-label={faceUp ? 'Card revealed' : `Face-down card ${index + 1}`}
    >
      <span className="memory-card-inner">
        <span className="memory-card-face memory-card-front" />
        <span className="memory-card-face memory-card-back">
          <Icon size={26} />
        </span>
      </span>
    </button>
  );
}

export default function MemoryBoard({ gameState, showingNoMatch, dimmedIndices, animating, onCardClick }) {
  return (
    <div
      className="memory-cards-grid"
      style={{
        gridTemplateColumns: `repeat(${gameState.cols}, 1fr)`,
        gridTemplateRows: `repeat(${gameState.rows}, 1fr)`,
      }}
    >
      {gameState.cards.map((card, index) => {
        const faceUp = card.matched || gameState.flipped.includes(index) || showingNoMatch.includes(index);
        const selectable = !animating && !card.matched && !gameState.flipped.includes(index) && !gameState.gameOver;
        return (
          <Card
            key={card.id}
            card={card}
            index={index}
            faceUp={faceUp}
            dimmed={dimmedIndices.has(index)}
            noMatch={showingNoMatch.includes(index)}
            selectable={selectable}
            onClick={onCardClick}
          />
        );
      })}
    </div>
  );
}
