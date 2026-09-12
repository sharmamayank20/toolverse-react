// ============================================================
// LUDO ENGINE — pure rules logic, zero DOM/React dependencies.
//
// Ported from the original isomorphic ludoEngine.js/.cjs (same file
// used browser-side and Node-side in the vanilla version). Logic is
// UNCHANGED — only the module wrapper changed, from a UMD IIFE to a
// plain ES module, since Vite/React only ever needs the ESM shape.
// The Node backend keeps using its own ludoEngine.cjs unchanged —
// this file and that one must be kept in sync if the rules ever
// change, since they are now two copies of one ruleset again.
//
// Board geometry was generated + verified programmatically (52/56-cell
// ring trace, checked for a single closed loop with correct symmetry)
// rather than hand-typed, so the coordinates below are trustworthy.
// ============================================================

export const COLORS = ['RED', 'GREEN', 'YELLOW', 'BLUE'];

// 56-cell shared ring, traced clockwise starting at RED's entry.
export const RING = [[6,1],[6,2],[6,3],[6,4],[6,5],[6,6],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[6,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],[8,13],[8,12],[8,11],[8,10],[8,9],[8,8],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],[13,6],[12,6],[11,6],[10,6],[9,6],[8,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0]];
export const RING_LEN = RING.length; // 56 -- total cells in the SHARED ring (used by all colors' capture detection)

export const ENTRY_INDEX = { RED: 0, GREEN: 14, YELLOW: 28, BLUE: 42 };
export const SAFE_INDICES = [0, 8, 14, 22, 28, 36, 42, 50]; // entries + 4 mid-arm stars

export const STRETCH = {
  RED:    [[7,1],[7,2],[7,3],[7,4],[7,5]],
  GREEN:  [[1,7],[2,7],[3,7],[4,7],[5,7]],
  YELLOW: [[7,13],[7,12],[7,11],[7,10],[7,9]],
  BLUE:   [[13,7],[12,7],[11,7],[10,7],[9,7]]
};
export const STRETCH_LEN = 5;

// The real per-color distance traveled on the shared ring before reaching
// its OWN stretch entrance -- NOT the same as RING_LEN (56). Verified by
// checking actual board adjacency: relative progress 52 is the ring cell
// genuinely adjacent to each color's STRETCH[color][0], so the ring
// portion runs progress 0..52 (53 cells) and the stretch begins at 53.
// Using RING_LEN (56) here (the original bug) let a token travel 4 extra,
// geometrically-invalid steps -- a diagonal "jump" with no real board
// move behind it -- before ever reaching its stretch.
export const HOME_ENTRY_STEPS = 53;

// Progress values, per token:
//   -1            => sitting in the yard, not yet on the board
//   0 .. 51       => on the shared ring, relative to this color's own entry
//   52 .. 56      => in this color's private home stretch (5 cells)
//   57            => finished (reached home)
export const HOME_STEPS = HOME_ENTRY_STEPS + STRETCH_LEN; // 57 -- progress value that means "finished"

// ---- geometry helpers ----

export function cellForToken(color, progress) {
  if (progress < 0) return null; // in yard -- UI positions these separately
  if (progress < HOME_ENTRY_STEPS) {
    const idx = (ENTRY_INDEX[color] + progress) % RING_LEN;
    return RING[idx];
  }
  if (progress < HOME_STEPS) {
    return STRETCH[color][progress - HOME_ENTRY_STEPS];
  }
  return null; // finished -- UI renders these in a "finished" tray
}

export function isSafeProgress(color, progress) {
  if (progress < 0 || progress >= HOME_ENTRY_STEPS) return true; // yard or stretch: always safe
  const idx = (ENTRY_INDEX[color] + progress) % RING_LEN;
  return SAFE_INDICES.indexOf(idx) !== -1;
}

export function absoluteRingIndex(color, progress) {
  return (ENTRY_INDEX[color] + progress) % RING_LEN;
}

// ---- state creation ----

export function createInitialState(activeColors, names) {
  activeColors = COLORS.filter((c) => activeColors.indexOf(c) !== -1);
  const tokens = {};
  activeColors.forEach((color) => {
    tokens[color] = [0, 1, 2, 3].map((id) => ({ id, progress: -1 }));
  });
  return {
    players: activeColors.map((color) => ({
      color,
      name: (names && names[color]) || (color.charAt(0) + color.slice(1).toLowerCase())
    })),
    tokens,
    currentPlayerIndex: 0,
    dice: null,
    sixStreak: 0,
    awaitingMove: false,
    winner: null,
    finishOrder: [],
    log: []
  };
}

export function currentColor(state) {
  return state.players[state.currentPlayerIndex].color;
}

function cloneState(state) {
  // Cheap deep clone -- state is small (a handful of numbers), JSON round-trip is fine.
  return JSON.parse(JSON.stringify(state));
}

// ---- move computation ----

export function getValidMoves(state, diceValue) {
  const color = currentColor(state);
  const moves = [];
  state.tokens[color].forEach((token) => {
    if (token.progress === HOME_STEPS) return; // already finished
    if (token.progress === -1) {
      if (diceValue === 6) moves.push({ tokenId: token.id, from: -1, to: 0 });
      return;
    }
    const target = token.progress + diceValue;
    if (target > HOME_STEPS) return; // overshoot -- must land exactly on home
    moves.push({ tokenId: token.id, from: token.progress, to: target });
  });
  return moves;
}

export function tokensAt(state, color, progress) {
  return state.tokens[color].filter((t) => t.progress === progress);
}

function findCapturesAt(state, movingColor, targetProgress) {
  // Only meaningful on the shared ring -- stretch/yard cells are always private/safe.
  if (targetProgress < 0 || targetProgress >= HOME_ENTRY_STEPS) return [];
  const targetAbsIdx = absoluteRingIndex(movingColor, targetProgress);
  if (SAFE_INDICES.indexOf(targetAbsIdx) !== -1) return []; // safe cell, no captures

  const captured = [];
  COLORS.forEach((color) => {
    if (color === movingColor || !state.tokens[color]) return;
    state.tokens[color].forEach((t) => {
      if (t.progress < 0 || t.progress >= HOME_ENTRY_STEPS) return;
      if (absoluteRingIndex(color, t.progress) === targetAbsIdx) {
        captured.push({ color, tokenId: t.id });
      }
    });
  });
  return captured;
}

// ---- applying a move (mutating a cloned state, returning it) ----

export function applyMove(state, tokenId, diceValue) {
  const next = cloneState(state);
  const color = currentColor(next);
  const moves = getValidMoves(next, diceValue);
  const move = moves.filter((m) => m.tokenId === tokenId)[0];
  if (!move) throw new Error('Illegal move: token ' + tokenId + ' cannot play a ' + diceValue);

  const token = next.tokens[color].filter((t) => t.id === tokenId)[0];
  token.progress = move.to;

  const captures = findCapturesAt(next, color, move.to);
  captures.forEach((cap) => {
    const capturedToken = next.tokens[cap.color].filter((t) => t.id === cap.tokenId)[0];
    capturedToken.progress = -1;
  });

  const allFinished = next.tokens[color].every((t) => t.progress === HOME_STEPS);

  next.log.push({
    type: 'move', color, tokenId, dice: diceValue,
    from: move.from, to: move.to,
    captured: captures.map((c) => c.color)
  });

  if (allFinished && next.finishOrder.indexOf(color) === -1) {
    next.finishOrder.push(color);
    next.log.push({ type: 'finished', color });
    if (next.winner === null) next.winner = color;
  }

  const earnedExtraTurn = (diceValue === 6 || captures.length > 0) && next.sixStreak < 3;
  // three 6-rolls in a row forfeits the turn even without this move logic,
  // but that's enforced at roll-time (see applyDiceRoll's sixStreak handling).

  next.dice = null;
  next.awaitingMove = false;

  if (!earnedExtraTurn) {
    advanceTurn(next);
    next.sixStreak = 0;
  }
  return next;
}

function advanceTurn(state) {
  const n = state.players.length;
  const start = state.currentPlayerIndex;
  for (let i = 1; i <= n; i++) {
    const idx = (start + i) % n;
    const color = state.players[idx].color;
    const stillPlaying = state.finishOrder.indexOf(color) === -1;
    if (stillPlaying) { state.currentPlayerIndex = idx; return; }
  }
  // everyone has finished -- game over, leave currentPlayerIndex as-is
}

// Called when a player rolls the die. Returns the updated state plus
// metadata the UI needs (whether a choice is required, or the turn
// auto-passed because no legal move existed).
export function applyDiceRoll(state, diceValue) {
  const next = cloneState(state);

  if (diceValue === 6) next.sixStreak += 1;
  else next.sixStreak = 0;

  if (next.sixStreak === 3) {
    // Three 6es in a row: forfeit the whole turn, no move happens.
    next.log.push({ type: 'triple-six-forfeit', color: currentColor(next) });
    next.dice = null;
    next.sixStreak = 0;
    advanceTurn(next);
    return { state: next, validMoves: [], autoPassed: true, forfeited: true };
  }

  const moves = getValidMoves(next, diceValue);
  next.dice = diceValue;

  if (moves.length === 0) {
    next.log.push({ type: 'no-moves', color: currentColor(next), dice: diceValue });
    next.dice = null;
    const earnedExtraTurn = diceValue === 6;
    if (!earnedExtraTurn) { advanceTurn(next); next.sixStreak = 0; }
    return { state: next, validMoves: [], autoPassed: true, forfeited: false };
  }

  next.awaitingMove = true;
  return { state: next, validMoves: moves, autoPassed: false, forfeited: false };
}

// Called by the server when a player fails to reconnect within the
// grace period. Sends their tokens back to the yard, removes them
// from turn rotation, and declares a winner if only one player is
// left standing. Safe to call even if it's currently their turn.
//
// (Kept here too, not just in the server's copy, so a future
// spectator/replay view or offline "simulate a drop" test can reuse
// it client-side without needing the server round-trip.)
export function forfeitPlayer(state, color) {
  const next = cloneState(state);
  if (!next.tokens[color]) return next; // not a valid color in this game

  next.tokens[color].forEach((t) => { t.progress = -1; });

  const wasCurrentTurn = currentColor(next) === color;
  if (next.finishOrder.indexOf(color) === -1) next.finishOrder.push(color);
  next.log.push({ type: 'forfeited', color });

  if (wasCurrentTurn) {
    next.dice = null;
    next.awaitingMove = false;
    next.sixStreak = 0;
    advanceTurn(next);
  }

  const stillIn = next.players.filter((p) => next.finishOrder.indexOf(p.color) === -1);
  if (stillIn.length === 1 && next.winner === null) {
    next.winner = stillIn[0].color;
    if (next.finishOrder.indexOf(stillIn[0].color) === -1) next.finishOrder.push(stillIn[0].color);
    next.log.push({ type: 'won-by-default', color: stillIn[0].color });
  }
  return next;
}

// Default export mirrors the original window.LudoEngine / module.exports
// shape (an "LE" object with every function as a method), so porting
// ludojs.js's `var LE = window.LudoEngine; LE.currentColor(state)` call
// sites into React is a mechanical `import LE from '../utils/ludoEngine'`
// with the call sites themselves untouched.
const LudoEngine = {
  COLORS, RING, RING_LEN, ENTRY_INDEX, SAFE_INDICES, STRETCH, STRETCH_LEN, HOME_ENTRY_STEPS, HOME_STEPS,
  cellForToken, isSafeProgress, absoluteRingIndex,
  createInitialState, currentColor, getValidMoves, tokensAt,
  applyMove, applyDiceRoll, forfeitPlayer
};

export default LudoEngine;
