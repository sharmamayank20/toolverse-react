// ============================================================
// CHESS LAYOUT — pure presentation geometry, no rules logic.
// Board is always 8x8; file 0-7 = a-h, rank 0-7 = ranks 1-8,
// matching chessEngine's sq()/fileOf()/rankOf() exactly.
// ============================================================

export const BOARD_SIZE = 8;

// Top-left-corner positioning (not center-anchored) -- the piece element
// itself is sized to exactly fill one cell (12.5% x 12.5%), same
// convention as the original vanilla version.
export function percentForFileRank(file, rank) {
  return { left: `${file * 12.5}%`, top: `${(7 - rank) * 12.5}%` };
}

// Chess only ever needs a binary flip (unlike Ludo's 4-way corner
// rotation) -- White's view is 0deg, Black's is 180deg.
export function rotationForColor(color) {
  return color === 'b' ? 180 : 0;
}
