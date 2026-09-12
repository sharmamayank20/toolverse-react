// ============================================================
// CHESS ENGINE — pure rules logic, zero DOM/React dependencies.
//
// Ported from the original isomorphic chessEngine.js/.cjs, same
// pattern as ludoEngine.js's port: UMD IIFE -> plain ES module,
// logic unchanged. One real fix applied here: the original browser
// copy (chessEngine.js) was missing `forfeitPlayer`, which existed
// in the server's chessEngine.cjs and is actually used by
// chessSocket.js (resign + disconnect-grace). Added below so the
// two copies are back in sync -- if chess rules ever change, both
// this file and the server's chessEngine.cjs need the same edit.
//
// Board: flat 64-array, index = rank*8 + file (file 0-7 = a-h,
// rank 0-7 = ranks 1-8). Pieces are 2-char strings: color ('w'/'b')
// + type ('P','N','B','R','Q','K'), e.g. 'wP', 'bK'. Empty = null.
// ============================================================

const FILES = 'abcdefgh';

export function sq(file, rank) { return rank * 8 + file; }
export function fileOf(i) { return i % 8; }
export function rankOf(i) { return Math.floor(i / 8); }
export function toAlg(i) { return FILES[fileOf(i)] + (rankOf(i) + 1); }
export function fromAlg(s) { return sq(FILES.indexOf(s[0]), parseInt(s[1], 10) - 1); }
function onBoard(file, rank) { return file >= 0 && file < 8 && rank >= 0 && rank < 8; }

export function colorOf(piece) { return piece ? piece[0] : null; }
export function typeOf(piece) { return piece ? piece[1] : null; }
export function opponent(color) { return color === 'w' ? 'b' : 'w'; }

export function createInitialState() {
  const board = new Array(64).fill(null);
  const backRank = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  for (let f = 0; f < 8; f++) {
    board[sq(f, 0)] = 'w' + backRank[f];
    board[sq(f, 1)] = 'wP';
    board[sq(f, 6)] = 'bP';
    board[sq(f, 7)] = 'b' + backRank[f];
  }
  return {
    board,
    turn: 'w',
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null,      // square index a pawn could capture INTO via en passant, or null
    halfmoveClock: 0,     // resets on pawn move/capture; 100 half-moves = fifty-move draw
    fullmoveNumber: 1,
    status: 'playing',    // 'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw' | 'resigned'
    winner: null,          // 'w' | 'b' | null
    drawReason: null,      // 'stalemate' | 'insufficient-material' | 'fifty-move' | null
    log: []
  };
}

function cloneState(state) { return JSON.parse(JSON.stringify(state)); }

export function findKing(board, color) {
  for (let i = 0; i < 64; i++) if (board[i] === color + 'K') return i;
  return -1;
}

// ---- attack detection (check + castling-through-check) ----
const KNIGHT_DELTAS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING_DELTAS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function isSquareAttacked(board, target, byColor) {
  const tf = fileOf(target), tr = rankOf(target);

  // pawns: a byColor pawn on a square diagonally "behind" (from byColor's
  // forward direction) the target would be attacking it
  const pawnDir = byColor === 'w' ? -1 : 1;
  const pr = tr + pawnDir;
  if (onBoard(tf - 1, pr) && board[sq(tf - 1, pr)] === byColor + 'P') return true;
  if (onBoard(tf + 1, pr) && board[sq(tf + 1, pr)] === byColor + 'P') return true;

  for (const [df, dr] of KNIGHT_DELTAS) {
    const nf = tf + df, nr = tr + dr;
    if (onBoard(nf, nr) && board[sq(nf, nr)] === byColor + 'N') return true;
  }
  for (const [df, dr] of KING_DELTAS) {
    const kf = tf + df, kr = tr + dr;
    if (onBoard(kf, kr) && board[sq(kf, kr)] === byColor + 'K') return true;
  }
  for (const [df, dr] of BISHOP_DIRS) {
    let f = tf + df, r = tr + dr;
    while (onBoard(f, r)) {
      const p = board[sq(f, r)];
      if (p) { if (colorOf(p) === byColor && (typeOf(p) === 'B' || typeOf(p) === 'Q')) return true; break; }
      f += df; r += dr;
    }
  }
  for (const [df, dr] of ROOK_DIRS) {
    let f = tf + df, r = tr + dr;
    while (onBoard(f, r)) {
      const p = board[sq(f, r)];
      if (p) { if (colorOf(p) === byColor && (typeOf(p) === 'R' || typeOf(p) === 'Q')) return true; break; }
      f += df; r += dr;
    }
  }
  return false;
}

export function isInCheck(state, color) {
  const kingSq = findKing(state.board, color);
  if (kingSq === -1) return false;
  return isSquareAttacked(state.board, kingSq, opponent(color));
}

// ---- pseudo-legal move generation (doesn't yet check king safety) ----
// move shape: {from, to, flag} where flag is one of:
//   null | 'capture' | 'double' | 'enpassant' | 'castleK' | 'castleQ' |
//   'promotion' | 'promotion-capture'
function pseudoMovesForSquare(state, from) {
  const board = state.board;
  const piece = board[from];
  if (!piece) return [];
  const color = colorOf(piece), type = typeOf(piece);
  const f = fileOf(from), r = rankOf(from);
  const moves = [];

  function tryStep(nf, nr) {
    if (!onBoard(nf, nr)) return;
    const to = sq(nf, nr);
    const target = board[to];
    if (!target) moves.push({ from, to, flag: null });
    else if (colorOf(target) !== color) moves.push({ from, to, flag: 'capture' });
  }

  if (type === 'P') {
    const dir = color === 'w' ? 1 : -1;
    const startRank = color === 'w' ? 1 : 6;
    const promoRank = color === 'w' ? 7 : 0;
    if (onBoard(f, r + dir) && !board[sq(f, r + dir)]) {
      const to1 = sq(f, r + dir);
      moves.push({ from, to: to1, flag: rankOf(to1) === promoRank ? 'promotion' : null });
      if (r === startRank && !board[sq(f, r + 2 * dir)]) {
        moves.push({ from, to: sq(f, r + 2 * dir), flag: 'double' });
      }
    }
    [f - 1, f + 1].forEach((cf) => {
      if (!onBoard(cf, r + dir)) return;
      const ct = sq(cf, r + dir);
      const target = board[ct];
      if (target && colorOf(target) !== color) {
        moves.push({ from, to: ct, flag: rankOf(ct) === promoRank ? 'promotion-capture' : 'capture' });
      } else if (state.enPassant === ct) {
        moves.push({ from, to: ct, flag: 'enpassant' });
      }
    });
  } else if (type === 'N') {
    KNIGHT_DELTAS.forEach((d) => tryStep(f + d[0], r + d[1]));
  } else if (type === 'K') {
    KING_DELTAS.forEach((d) => tryStep(f + d[0], r + d[1]));
    const rank0 = color === 'w' ? 0 : 7;
    if (r === rank0 && f === 4) {
      const rights = state.castling;
      const kRight = color === 'w' ? rights.wK : rights.bK;
      const qRight = color === 'w' ? rights.wQ : rights.bQ;
      const oppColor = opponent(color);
      if (kRight && !board[sq(5, rank0)] && !board[sq(6, rank0)] &&
          !isSquareAttacked(board, sq(4, rank0), oppColor) &&
          !isSquareAttacked(board, sq(5, rank0), oppColor) &&
          !isSquareAttacked(board, sq(6, rank0), oppColor)) {
        moves.push({ from, to: sq(6, rank0), flag: 'castleK' });
      }
      if (qRight && !board[sq(3, rank0)] && !board[sq(2, rank0)] && !board[sq(1, rank0)] &&
          !isSquareAttacked(board, sq(4, rank0), oppColor) &&
          !isSquareAttacked(board, sq(3, rank0), oppColor) &&
          !isSquareAttacked(board, sq(2, rank0), oppColor)) {
        moves.push({ from, to: sq(2, rank0), flag: 'castleQ' });
      }
    }
  } else {
    const dirs = type === 'B' ? BISHOP_DIRS : type === 'R' ? ROOK_DIRS : BISHOP_DIRS.concat(ROOK_DIRS);
    dirs.forEach((d) => {
      let nf = f + d[0], nr = r + d[1];
      while (onBoard(nf, nr)) {
        const target = board[sq(nf, nr)];
        if (!target) { moves.push({ from, to: sq(nf, nr), flag: null }); }
        else { if (colorOf(target) !== color) moves.push({ from, to: sq(nf, nr), flag: 'capture' }); break; }
        nf += d[0]; nr += d[1];
      }
    });
  }
  return moves;
}

// mutates `board` in place -- used both for check-simulation and the real applyMove
function makeRawMove(board, move, promotionType) {
  const piece = board[move.from];
  const color = colorOf(piece);
  board[move.to] = piece;
  board[move.from] = null;

  if (move.flag === 'enpassant') {
    board[sq(fileOf(move.to), rankOf(move.from))] = null;
  }
  if (move.flag === 'castleK') {
    const r1 = rankOf(move.from);
    board[sq(5, r1)] = board[sq(7, r1)];
    board[sq(7, r1)] = null;
  }
  if (move.flag === 'castleQ') {
    const r2 = rankOf(move.from);
    board[sq(3, r2)] = board[sq(0, r2)];
    board[sq(0, r2)] = null;
  }
  if (move.flag === 'promotion' || move.flag === 'promotion-capture') {
    board[move.to] = color + (promotionType || 'Q');
  }
}

function isLegalMove(state, move) {
  const tempBoard = state.board.slice();
  makeRawMove(tempBoard, move, 'Q'); // promotion choice never affects check-legality
  const color = colorOf(state.board[move.from]);
  return !isSquareAttacked(tempBoard, findKing(tempBoard, color), opponent(color));
}

export function getLegalMoves(state, from) {
  const piece = state.board[from];
  if (!piece || colorOf(piece) !== state.turn) return [];
  return pseudoMovesForSquare(state, from).filter((m) => isLegalMove(state, m));
}

export function getAllLegalMoves(state, color) {
  let moves = [];
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (p && colorOf(p) === color) {
      moves = moves.concat(pseudoMovesForSquare(state, i).filter((m) => isLegalMove(state, m)));
    }
  }
  return moves;
}

// expands each promotion move into 4 distinct choices (Q/R/B/N) -- the UI
// needs this same list to offer a choice (defaulting to queen when it
// doesn't ask, e.g. an online move where the player already chose).
export function expandPromotions(moves) {
  const out = [];
  moves.forEach((m) => {
    if (m.flag === 'promotion' || m.flag === 'promotion-capture') {
      ['Q', 'R', 'B', 'N'].forEach((pt) => out.push({ from: m.from, to: m.to, flag: m.flag, promotion: pt }));
    } else out.push(m);
  });
  return out;
}

function insufficientMaterial(board) {
  const nonKing = board.filter((p) => p && typeOf(p) !== 'K');
  if (nonKing.length === 0) return true;
  if (nonKing.length === 1 && (typeOf(nonKing[0]) === 'B' || typeOf(nonKing[0]) === 'N')) return true;
  if (nonKing.length === 2 && nonKing.every((p) => typeOf(p) === 'B')) {
    const squares = [];
    for (let i = 0; i < 64; i++) if (board[i] && typeOf(board[i]) === 'B') squares.push(i);
    if (squares.length === 2) {
      const c0 = (fileOf(squares[0]) + rankOf(squares[0])) % 2;
      const c1 = (fileOf(squares[1]) + rankOf(squares[1])) % 2;
      if (colorOf(board[squares[0]]) !== colorOf(board[squares[1]]) && c0 === c1) return true;
    }
  }
  return false;
}

function computeStatus(state) {
  const color = state.turn;
  const inCheck = isInCheck(state, color);
  const legal = getAllLegalMoves(state, color);
  if (legal.length === 0) {
    if (inCheck) { state.status = 'checkmate'; state.winner = opponent(color); }
    else { state.status = 'stalemate'; state.winner = null; state.drawReason = 'stalemate'; }
    return;
  }
  if (insufficientMaterial(state.board)) {
    state.status = 'draw'; state.winner = null; state.drawReason = 'insufficient-material';
    return;
  }
  if (state.halfmoveClock >= 100) {
    state.status = 'draw'; state.winner = null; state.drawReason = 'fifty-move';
    return;
  }
  state.status = inCheck ? 'check' : 'playing';
}

export function applyMove(state, from, to, promotionType) {
  const next = cloneState(state);
  const legal = getLegalMoves(next, from);
  const match = legal.filter((m) => m.to === to)[0];
  if (!match) throw new Error('Illegal move: ' + toAlg(from) + '-' + toAlg(to));

  const piece = next.board[from];
  const color = colorOf(piece);
  const isCapture = !!next.board[to] || match.flag === 'enpassant';
  const isPawnMove = typeOf(piece) === 'P';

  makeRawMove(next.board, match, promotionType || 'Q');

  if (typeOf(piece) === 'K') {
    if (color === 'w') { next.castling.wK = false; next.castling.wQ = false; }
    else { next.castling.bK = false; next.castling.bQ = false; }
  }
  [from, to].forEach((square) => {
    if (square === sq(0, 0)) next.castling.wQ = false;
    if (square === sq(7, 0)) next.castling.wK = false;
    if (square === sq(0, 7)) next.castling.bQ = false;
    if (square === sq(7, 7)) next.castling.bK = false;
  });

  next.enPassant = match.flag === 'double' ? sq(fileOf(to), (rankOf(from) + rankOf(to)) / 2) : null;
  next.halfmoveClock = (isCapture || isPawnMove) ? 0 : next.halfmoveClock + 1;
  if (color === 'b') next.fullmoveNumber += 1;

  next.log.push({ from: toAlg(from), to: toAlg(to), piece, flag: match.flag, promotion: promotionType || null });

  next.turn = opponent(color);
  next.status = 'playing'; next.winner = null; next.drawReason = null;
  computeStatus(next);

  return next;
}

// Added here to match chessEngine.cjs (the server copy already had this --
// see the file header comment). Chess is always 2 players, so unlike
// Ludo's forfeitPlayer there's no "who else is still in" bookkeeping --
// the game just ends immediately and the other color wins.
export function forfeitPlayer(state, color) {
  const next = cloneState(state);
  next.status = 'resigned';
  next.winner = opponent(color);
  next.drawReason = null;
  next.log.push({ type: 'forfeit', color });
  return next;
}

const ChessEngine = {
  createInitialState,
  sq, fileOf, rankOf, toAlg, fromAlg,
  colorOf, typeOf, opponent,
  isInCheck,
  getLegalMoves,
  getAllLegalMoves,
  expandPromotions,
  applyMove,
  forfeitPlayer,
  findKing
};

export default ChessEngine;
