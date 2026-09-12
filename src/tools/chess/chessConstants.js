// One consistent glyph set (the Unicode "black" chess symbols) for BOTH
// colors, colored via CSS instead of relying on separate white/black
// glyphs -- avoids the known cross-platform inconsistency where "white"
// piece glyphs render oddly or go missing in some fonts. Same choice the
// original vanilla version made.
export const GLYPH = { P: '♟', N: '♞', B: '♝', R: '♜', Q: '♛', K: '♚' };
export const PIECE_VALUE = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
