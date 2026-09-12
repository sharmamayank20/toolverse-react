import { Star } from 'lucide-react';
import LE from '../../utils/ludoEngine';
import {
  percentForRowCol,
  percentForYardSlot,
  percentForFinishedSlot,
  YARD_ORIGIN,
  ROTATION_BY_COLOR,
} from './ludoLayout';

const TOKEN_COLOR_VAR = {
  RED: 'var(--ludo-red)',
  GREEN: 'var(--ludo-green)',
  YELLOW: 'var(--ludo-yellow)',
  BLUE: 'var(--ludo-blue)',
};

// idx (position in LE.RING) -> color, for the single square where each
// color exits its yard onto the shared ring -- tinted so it reads clearly
// as "this is RED's entry" at a glance, like a real board's colored arrow.
const ENTRY_COLOR_BY_INDEX = Object.fromEntries(
  LE.COLORS.map((c) => [LE.ENTRY_INDEX[c], c])
);

function YardQuadrant({ color }) {
  const origin = YARD_ORIGIN[color];
  return (
    <div
      className="ludo-yard"
      style={{
        gridRow: `${origin.row + 1} / span 6`,
        gridColumn: `${origin.col + 1} / span 6`,
        background: TOKEN_COLOR_VAR[color],
      }}
    />
  );
}

function HomeTriangles({ rotation }) {
  const clips = {
    // Inscribed diamond (touches each edge's midpoint, not the 3x3's
    // corners) -- deliberately NOT corner-to-corner triangles. Each of the
    // 4 corner cells of this 3x3 is also a real ring-path cell (the point
    // where the path turns from one arm to the next), so covering them
    // with color would visually bury that ring cell underneath the
    // triangle -- exactly the "piece merges into the home square" bug.
    RED: 'polygon(0% 33.33%, 33.33% 33.33%, 50% 50%, 33.33% 66.66%, 0% 66.66%)',
    GREEN: 'polygon(33.33% 0%, 66.66% 0%, 66.66% 33.33%, 50% 50%, 33.33% 33.33%)',
    YELLOW: 'polygon(100% 33.33%, 66.66% 33.33%, 50% 50%, 66.66% 66.66%, 100% 66.66%)',
    BLUE: 'polygon(33.33% 100%, 33.33% 66.66%, 50% 50%, 66.66% 66.66%, 66.66% 100%)',
  };
  return (
    <div className="ludo-home-center" style={{ gridRow: '7 / span 3', gridColumn: '7 / span 3' }}>
      {LE.COLORS.map((color) => (
        <div
          key={color}
          className="ludo-home-wedge"
          style={{ background: TOKEN_COLOR_VAR[color], clipPath: clips[color] }}
        />
      ))}
    </div>
  );
}

export default function LudoBoard({
  gameState,
  activeColors,
  selectableTokenIds,
  onTokenClick,
  registerTokenRef,
  rotationColor,
}) {
  const rotation = rotationColor ? ROTATION_BY_COLOR[rotationColor] : 0;
  const turnColor = LE.currentColor(gameState);

  return (
    <div className="ludo-board-rotator" style={{ transform: `rotate(${rotation}deg)` }}>
      <div className="ludo-cells-grid">
        {activeColors.map((color) => (
          <YardQuadrant key={color} color={color} />
        ))}

        {LE.RING.map(([row, col], idx) => {
          const isSafe = LE.SAFE_INDICES.includes(idx);
          const entryColor = ENTRY_COLOR_BY_INDEX[idx];
          const alt = (row + col) % 2 === 0;
          const cellClass = [
            'ludo-cell', 'ludo-cell-path',
            alt ? 'ludo-cell-alt' : '',
            isSafe ? 'ludo-cell-safe' : '',
          ].filter(Boolean).join(' ');
          return (
            <div
              key={`ring-${idx}`}
              className={cellClass}
              style={
                entryColor
                  ? { gridRow: row + 1, gridColumn: col + 1, background: `color-mix(in srgb, ${TOKEN_COLOR_VAR[entryColor]} 38%, var(--arcade-bg))` }
                  : { gridRow: row + 1, gridColumn: col + 1 }
              }
            >
              {isSafe && (
                <span className="ludo-safe-star" style={{ transform: `rotate(${-rotation}deg)` }}>
                  <Star size={11} aria-hidden="true" />
                </span>
              )}
            </div>
          );
        })}

        {LE.COLORS.map((color) =>
          LE.STRETCH[color].map(([row, col], i) => (
            <div
              key={`stretch-${color}-${i}`}
              className="ludo-cell ludo-cell-stretch"
              style={{ gridRow: row + 1, gridColumn: col + 1, background: TOKEN_COLOR_VAR[color] }}
            />
          ))
        )}

        <HomeTriangles rotation={rotation} />
      </div>

      <div className="ludo-token-layer">
        {activeColors.map((color) =>
          gameState.tokens[color].map((token) => {
            let pos;
            if (token.progress === -1) pos = percentForYardSlot(color, token.id);
            else if (token.progress === LE.HOME_STEPS) pos = percentForFinishedSlot(color, token.id);
            else {
              const cell = LE.cellForToken(color, token.progress);
              pos = percentForRowCol(cell[0], cell[1]);
            }
            const selectable =
              !!selectableTokenIds && color === turnColor && selectableTokenIds.includes(token.id);
            return (
              <button
                key={`${color}-${token.id}`}
                ref={(el) => registerTokenRef(color, token.id, el)}
                type="button"
                className={`ludo-token ${selectable ? 'selectable' : ''}`}
                style={{ left: pos.left, top: pos.top, background: TOKEN_COLOR_VAR[color] }}
                disabled={!selectable}
                aria-label={`${color} token ${token.id + 1}${selectable ? ' — tap to move' : ''}`}
                onClick={() => onTokenClick(color, token.id)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}