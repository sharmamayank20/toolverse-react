// ============================================================
// LUDO LAYOUT — pure presentation geometry, no rules logic.
// Board is always a 15x15 grid, 0-indexed, matching ludoEngine's
// RING/STRETCH coordinates exactly, so there's one source of truth
// for "where is cell (row,col)".
// ============================================================

export const GRID_SIZE = 15;

// Top-left cell of each color's 6x6 yard quadrant.
export const YARD_ORIGIN = {
  RED: { row: 0, col: 0 },
  GREEN: { row: 0, col: 9 },
  YELLOW: { row: 9, col: 9 },
  BLUE: { row: 9, col: 0 },
};

// 4 token dots per yard, small 2x2 cluster centered in the 6x6 block
// (offsets in cell units, relative to the yard origin).
const YARD_SLOT_OFFSETS = [
  { row: 1.5, col: 1.5 },
  { row: 1.5, col: 3.5 },
  { row: 3.5, col: 1.5 },
  { row: 3.5, col: 3.5 },
];

// Approximate "in that color's wedge" cluster for finished tokens,
// inside the center 3x3 home area.
const FINISHED_SLOT = {
  RED: { row: 7, col: 6.3 },
  GREEN: { row: 6.3, col: 7 },
  YELLOW: { row: 7, col: 7.7 },
  BLUE: { row: 7.7, col: 7 },
};
const FINISHED_JITTER = [
  { row: -0.35, col: 0 },
  { row: 0.35, col: 0 },
  { row: 0, col: -0.35 },
  { row: 0, col: 0.35 },
];

// Rotation (deg, clockwise) that brings each color's yard corner to the
// bottom-left -- "nearest the player currently holding the phone" -- for
// same-device pass-and-play. Board naturally sits with BLUE bottom-left.
export const ROTATION_BY_COLOR = { BLUE: 0, YELLOW: 90, GREEN: 180, RED: 270 };

export function percentForRowCol(row, col) {
  return {
    left: `${((col + 0.5) / GRID_SIZE) * 100}%`,
    top: `${((row + 0.5) / GRID_SIZE) * 100}%`,
  };
}

export function percentForYardSlot(color, tokenId) {
  const origin = YARD_ORIGIN[color];
  const offset = YARD_SLOT_OFFSETS[tokenId];
  return percentForRowCol(origin.row + offset.row, origin.col + offset.col);
}

export function percentForFinishedSlot(color, tokenId) {
  const base = FINISHED_SLOT[color];
  const j = FINISHED_JITTER[tokenId];
  return percentForRowCol(base.row + j.row, base.col + j.col);
}
