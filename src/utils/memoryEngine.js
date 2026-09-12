// ============================================================
// MEMORY ENGINE — pure rules logic, zero DOM/React dependencies.
//
// Unlike ludoEngine/chessEngine, this game never had a server or an
// online mode in the original vanilla version -- this file (and the
// disconnect-handling in it) is new, designed to match the same
// server-authoritative pattern the other two games use.
//
// One deliberate change from the original: cards hold an abstract
// `symbol` ID (a number), not an emoji string. The original embedded
// literal emoji directly in the engine, which (a) conflicts with the
// site's no-emoji rule and (b) mixes presentation into supposedly
// presentation-free rules logic -- exactly what ludoEngine/chessEngine
// avoid. Mapping symbol ID -> actual icon happens only in the React
// board component, using lucide-react.
//
// No UMD/.cjs split needed either, unlike the other two engines --
// both this project's frontend (Vite) and backend ("type": "module")
// consume plain ES modules, so one file works as-is in both places.
// Just place an identical copy in each project; they're siblings, not
// a client/server pair in two different formats.
//
// Flipping is deliberately split into two steps, same as the original:
//   flipCard(state, index)   -- turns one card face-up, no resolution
//   resolveFlip(state)       -- called once 2 cards are face-up; decides
//                                match/no-match, updates score/turn
// This mirrors Ludo's roll/move split -- "both cards visible, then
// decide" is a real part of how the game is played, not just an
// animation, so the engine models it as an explicit state.
// ============================================================

// How many distinct symbols exist to draw from -- must cover the
// largest supported grid's pair count (6x6 = 36 cells = 18 pairs).
export const SYMBOL_COUNT = 20;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createInitialState(playerCount, names, rows, cols) {
  const totalCells = rows * cols;
  if (totalCells % 2 !== 0) throw new Error('Grid must have an even number of cells');
  const pairCount = totalCells / 2;
  if (pairCount > SYMBOL_COUNT) throw new Error('Grid too large for the symbol pool');

  const chosenSymbols = shuffle(Array.from({ length: SYMBOL_COUNT }, (_, i) => i)).slice(0, pairCount);
  const deck = shuffle(chosenSymbols.concat(chosenSymbols));
  const cards = deck.map((symbol, i) => ({ id: i, symbol, matched: false }));

  const players = [];
  for (let p = 0; p < playerCount; p++) players.push({ id: p, name: (names && names[p]) || `Player ${p + 1}` });
  const scores = {};
  const active = {};
  players.forEach((pl) => { scores[pl.id] = 0; active[pl.id] = true; });

  return {
    rows, cols,
    cards,
    players,
    scores,
    active,               // playerId -> bool; false once disconnected past the grace period (online only)
    currentPlayerIndex: 0,
    flipped: [],           // indices currently face-up and unresolved (0, 1, or 2 entries)
    awaitingResolve: false, // true once 2 are flipped, until resolveFlip() is called
    lastResult: null,      // { matched, indices } -- set after resolveFlip, for UI messaging
    gameOver: false,
    winners: [],           // player ids with the top score, once gameOver (ties possible)
    log: []
  };
}

function cloneState(state) { return JSON.parse(JSON.stringify(state)); }
export function currentPlayer(state) { return state.players[state.currentPlayerIndex]; }

function advanceTurn(state) {
  const n = state.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (state.currentPlayerIndex + i) % n;
    if (state.active[state.players[idx].id] !== false) { state.currentPlayerIndex = idx; return; }
  }
  // nobody else is active -- leave currentPlayerIndex as-is, forfeitPlayer's
  // caller is responsible for ending the game in that case
}

export function flipCard(state, index) {
  if (state.awaitingResolve) throw new Error('Two cards are already flipped -- resolve them first');
  if (state.gameOver) throw new Error('Game is already over');
  const card = state.cards[index];
  if (!card) throw new Error('No such card: ' + index);
  if (card.matched) throw new Error('Card already matched: ' + index);
  if (state.flipped.indexOf(index) !== -1) throw new Error('Card already face-up: ' + index);
  if (state.flipped.length >= 2) throw new Error('Two cards already flipped');

  const next = cloneState(state);
  next.flipped.push(index);
  if (next.flipped.length === 2) next.awaitingResolve = true;
  return next;
}

export function resolveFlip(state) {
  if (!state.awaitingResolve || state.flipped.length !== 2) {
    throw new Error('resolveFlip() called without two flipped cards pending');
  }
  const next = cloneState(state);
  const [ia, ib] = next.flipped;
  const matched = next.cards[ia].symbol === next.cards[ib].symbol;

  if (matched) {
    next.cards[ia].matched = true;
    next.cards[ib].matched = true;
    const player = currentPlayer(next);
    next.scores[player.id] += 1;
    next.log.push({ type: 'match', playerId: player.id, indices: [ia, ib], symbol: next.cards[ia].symbol });
    // matching player goes again -- no turn advance
  } else {
    next.log.push({ type: 'no-match', playerId: currentPlayer(next).id, indices: [ia, ib] });
    advanceTurn(next);
  }

  next.flipped = [];
  next.awaitingResolve = false;
  next.lastResult = { matched, indices: [ia, ib] };

  const allMatched = next.cards.every((c) => c.matched);
  if (allMatched) {
    next.gameOver = true;
    const maxScore = Math.max(...next.players.map((pl) => next.scores[pl.id]));
    next.winners = next.players.filter((pl) => next.scores[pl.id] === maxScore).map((pl) => pl.id);
  }

  return next;
}

// New -- the original never had online mode, so there was no disconnect
// concept to port. Marks a player inactive (skipped in turn rotation from
// here on) rather than ending the whole game, since up to 4 people can be
// playing and losing 1 shouldn't necessarily end it for the rest. Only
// ends the game if fewer than 2 players remain active.
export function forfeitPlayer(state, playerId) {
  const next = cloneState(state);
  if (next.gameOver) return next;
  next.active[playerId] = false;
  next.log.push({ type: 'forfeit', playerId });

  const stillActive = next.players.filter((p) => next.active[p.id] !== false);
  if (stillActive.length < 2) {
    next.gameOver = true;
    next.winners = stillActive.length === 1 ? [stillActive[0].id] : [];
    return next;
  }
  if (currentPlayer(next).id === playerId) advanceTurn(next);
  return next;
}

const MemoryEngine = {
  SYMBOL_COUNT,
  createInitialState,
  currentPlayer,
  flipCard,
  resolveFlip,
  forfeitPlayer
};

export default MemoryEngine;
