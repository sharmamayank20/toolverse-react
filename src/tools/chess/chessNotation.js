import CE from '../../utils/chessEngine';

// Standard Algebraic Notation, including disambiguation (e.g. "Nbd7" when
// two knights could both legally reach d7). Pure function, ported directly
// from the vanilla chessjs.js's computeSAN.
export function computeSAN(beforeState, move, afterState) {
  const suffix = afterState.status === 'checkmate' ? '#' : (afterState.status === 'check' ? '+' : '');
  if (move.flag === 'castleK') return 'O-O' + suffix;
  if (move.flag === 'castleQ') return 'O-O-O' + suffix;

  const piece = beforeState.board[move.from];
  const type = CE.typeOf(piece);
  const isCapture = !!beforeState.board[move.to] || move.flag === 'enpassant';
  const destAlg = CE.toAlg(move.to);
  const fromAlg = CE.toAlg(move.from);

  if (type === 'P') {
    let san = (isCapture ? fromAlg[0] + 'x' : '') + destAlg;
    if (move.flag === 'promotion' || move.flag === 'promotion-capture') san += '=' + (move.promotion || 'Q');
    return san + suffix;
  }

  const others = [];
  for (let i = 0; i < 64; i++) {
    if (i === move.from) continue;
    const p = beforeState.board[i];
    if (p && CE.colorOf(p) === CE.colorOf(piece) && CE.typeOf(p) === type) {
      const legal = CE.getLegalMoves(beforeState, i);
      if (legal.some((m) => m.to === move.to)) others.push(i);
    }
  }
  let disambig = '';
  if (others.length > 0) {
    const shareFile = others.some((o) => CE.fileOf(o) === CE.fileOf(move.from));
    const shareRank = others.some((o) => CE.rankOf(o) === CE.rankOf(move.from));
    if (!shareFile) disambig = fromAlg[0];
    else if (!shareRank) disambig = fromAlg[1];
    else disambig = fromAlg;
  }
  return type + disambig + (isCapture ? 'x' : '') + destAlg + suffix;
}
