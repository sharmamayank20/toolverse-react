// A genuine 3D cube (6 faces via CSS transforms), not an icon swap. The
// parent (Ludo.jsx) owns the roll orchestration and just hands us a
// {x, y} rotation target -- we're purely presentational, same split as
// LudoBoard. Rotation values are ever-increasing across rolls (never
// reset to 0) specifically so the CSS transition below animates a real
// multi-turn spin instead of the browser taking a "shortest path" between
// two small angles.

const PIP_PATTERNS = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function DiceFace({ value }) {
  const on = PIP_PATTERNS[value];
  return (
    <div className={`ludo-dice-face ludo-dice-face-${value}`}>
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className={`ludo-pip ${on.includes(i) ? 'on' : ''}`} />
      ))}
    </div>
  );
}

export default function LudoDice({ rotation, disabled, onClick, revealedValue }) {
  return (
    <button
      type="button"
      className="ludo-dice-scene"
      onClick={onClick}
      disabled={disabled}
      aria-label="Roll the die"
    >
      <div
        className="ludo-dice-cube"
        style={{ transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)` }}
      >
        {[1, 2, 3, 4, 5, 6].map((v) => <DiceFace key={v} value={v} />)}
      </div>
      <span className="sr-only" aria-live="polite">
        {revealedValue ? `Rolled ${revealedValue}` : ''}
      </span>
    </button>
  );
}
