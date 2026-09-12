import CE from '../../utils/chessEngine';
import { GLYPH } from './chessConstants';
import { percentForFileRank } from './chessLayout';

const FILES = 'abcdefgh';

export default function ChessBoard({
  gameState, selectedSquare, legalForSelected, lastMoveSquares,
  onSquareClick, registerPieceRef, rotation,
}) {
  const inCheckSquare = (gameState.status === 'check' || gameState.status === 'checkmate')
    ? CE.findKing(gameState.board, gameState.turn)
    : -1;

  const cells = [];
  for (let pixelRow = 0; pixelRow < 8; pixelRow++) {
    for (let pixelCol = 0; pixelCol < 8; pixelCol++) {
      const file = pixelCol, rank = 7 - pixelRow; // pixel row 0 = top = rank 8
      const square = CE.sq(file, rank);
      const isDark = (file + rank) % 2 === 0; // a1 is dark, by convention
      const legalMove = legalForSelected.find((m) => m.to === square);
      const isLegalCapture = legalMove && (!!gameState.board[square] || legalMove.flag === 'enpassant');
      const isLastMove = lastMoveSquares && (lastMoveSquares.from === square || lastMoveSquares.to === square);

      const cellClass = [
        'chess-cell', isDark ? 'chess-cell-dark' : 'chess-cell-light',
        selectedSquare === square ? 'selected' : '',
        legalMove ? (isLegalCapture ? 'legal-capture' : 'legal-dest') : '',
        isLastMove ? 'last-move' : '',
        square === inCheckSquare ? 'in-check' : '',
      ].filter(Boolean).join(' ');

      cells.push(
        <div
          key={`cell-${square}`}
          className={cellClass}
          style={{ gridColumn: pixelCol + 1, gridRow: pixelRow + 1 }}
          onClick={() => onSquareClick(square)}
        >
          {file === 0 && (
            <span className="chess-coord chess-coord-rank" style={{ transform: `rotate(${-rotation}deg)` }}>
              {rank + 1}
            </span>
          )}
          {rank === 0 && (
            <span className="chess-coord chess-coord-file" style={{ transform: `rotate(${-rotation}deg)` }}>
              {FILES[file]}
            </span>
          )}
        </div>
      );
    }
  }

  const pieces = [];
  for (let square = 0; square < 64; square++) {
    const piece = gameState.board[square];
    if (!piece) continue;
    const color = CE.colorOf(piece);
    const pos = percentForFileRank(CE.fileOf(square), CE.rankOf(square));
    const selectable = color === gameState.turn;
    pieces.push(
      <div
        key={`piece-${square}-${piece}`}
        ref={(el) => registerPieceRef(square, el)}
        className={`chess-piece ${color === 'w' ? 'chess-piece-white' : 'chess-piece-black'} ${selectable ? 'selectable' : ''}`}
        style={{ left: pos.left, top: pos.top, opacity: 1, transform: `rotate(${-rotation}deg)` }}
        onClick={() => onSquareClick(square)}
        aria-label={`${color === 'w' ? 'White' : 'Black'} ${CE.typeOf(piece)} on ${CE.toAlg(square)}`}
        role="button"
      >
        {GLYPH[CE.typeOf(piece)]}
      </div>
    );
  }

  return (
    <div className="chess-board-rotator" style={{ transform: `rotate(${rotation}deg)` }}>
      <div className="chess-cells-grid">{cells}</div>
      <div className="chess-piece-layer">{pieces}</div>
    </div>
  );
}
