import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Smartphone, Globe, Swords, Plus, LogIn, RotateCcw, Share2, Flag, Copy, Check } from 'lucide-react';
import { io } from 'socket.io-client';
import CircularText from '../components/CircularText';
import CE from '../utils/chessEngine';
import ChessBoard from './chess/ChessBoard';
import { GLYPH, PIECE_VALUE } from './chess/chessConstants';
import { percentForFileRank, rotationForColor } from './chess/chessLayout';
import { computeSAN } from './chess/chessNotation';
import { useWebRTC } from '../hooks/useWebRTC';
import VideoPanel from '../components/VideoPanel';

const GAME_SERVER_URL = import.meta.env.VITE_GAME_SERVER_URL || 'http://localhost:3000';
const SESSION_KEY = 'chess-session';

function saveSession(roomCode, color) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode, color })); } catch { /* non-fatal */ }
}
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* non-fatal */ }
}

const EASE = [0.22, 1, 0.36, 1]; // matches --ease-smooth/--ease-glide
const MOVE_ANIM_MS = 320;

function statusMessage(state, names) {
  if (state.status === 'checkmate') return `${names[state.winner]} wins — checkmate.`;
  if (state.status === 'stalemate') return 'Draw — stalemate.';
  if (state.status === 'draw') {
    const reasons = {
      'insufficient-material': 'Draw — insufficient material.',
      'fifty-move': 'Draw — fifty-move rule.',
    };
    return reasons[state.drawReason] || 'Draw.';
  }
  if (state.status === 'resigned') return `${names[state.winner]} wins — opponent resigned.`;
  return `${names[state.turn]}'s turn${state.status === 'check' ? ' — check!' : ''}`;
}

export default function Chess() {
  // ---- top-level view ----
  const [view, setView] = useState('setup'); // 'setup' | 'lobby' | 'playing'
  const [gameMode, setGameMode] = useState(null); // 'local' | 'online' -- which rules apply to the current 'playing' view
  const [searchParams] = useSearchParams();

  // ---- local (same-device) setup state ----
  const [whiteName, setWhiteName] = useState('');
  const [blackName, setBlackName] = useState('');
  const [displayNames, setDisplayNames] = useState({ w: 'White', b: 'Black' });

  // ---- top-level mode ----
  const [mode, setMode] = useState('local'); // 'local' | 'online'

  // ---- game state (both local + online play through this) ----
  const [gameState, setGameState] = useState(null);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalForSelected, setLegalForSelected] = useState([]);
  const [lastMoveSquares, setLastMoveSquares] = useState(null);
  const [pendingPromotion, setPendingPromotion] = useState(null); // { from, to }
  const [isAnimatingMove, setIsAnimatingMove] = useState(false);
  const [capturedByWhite, setCapturedByWhite] = useState([]);
  const [capturedByBlack, setCapturedByBlack] = useState([]);
  const [moveLogEntries, setMoveLogEntries] = useState([]);
  const [confirmingNewGame, setConfirmingNewGame] = useState(false);
  const pieceRefs = useRef(new Map());

  // ---- online room state ----
  const [roomCode, setRoomCode] = useState(null);
  const [myColor, setMyColor] = useState(null); // 'w' | 'b'
  const [players, setPlayers] = useState([]);
  const [isSpectator, setIsSpectator] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [onlineMessage, setOnlineMessage] = useState('');
  const socketRef = useRef(null);

  // Local pass-and-play only: hold the just-finished move's orientation for
  // a full second before the board is allowed to flip, same reasoning as
  // Ludo's identical fix -- a physical "pass the device" cue shouldn't snap
  // instantly.
  const [boardRotationColor, setBoardRotationColor] = useState(null);
  useEffect(() => {
    if (gameMode !== 'local' || !gameState) return;
    const newColor = gameState.turn;
    if (boardRotationColor === null) { setBoardRotationColor(newColor); return; } // starting orientation, no delay
    if (boardRotationColor === newColor) return;
    const t = setTimeout(() => setBoardRotationColor(newColor), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, gameMode]);
  const gameStateRef = useRef(null);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  const webrtcEnabled = !!roomCode && (view === 'lobby' || view === 'playing');
  const webrtc = useWebRTC({ socket: socketRef.current, roomCode, enabled: webrtcEnabled });

  function registerPieceRef(square, el) {
    if (el) pieceRefs.current.set(square, el);
    else pieceRefs.current.delete(square);
  }

  useEffect(() => {
    if (!confirmingNewGame) return;
    const t = setTimeout(() => setConfirmingNewGame(false), 4000);
    return () => clearTimeout(t);
  }, [confirmingNewGame]);

  // Someone shared a room link -- prefill the join form. Runs once on mount.
  useEffect(() => {
    const join = searchParams.get('join');
    if (join) { setMode('online'); setOnlineSubTab('join'); setJoinCode(join); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconnect to a previous room if the tab was closed/refreshed mid-game.
  useEffect(() => {
    const saved = loadSession();
    if (!saved) return;
    const socket = ensureSocket();
    const attempt = () => {
      socket.emit('chess:rejoin-room', { roomCode: saved.roomCode, color: saved.color }, (ack) => {
        if (!ack?.ok) { clearSession(); return; }
        setRoomCode(saved.roomCode);
        setMyColor(saved.color);
        setPlayers(ack.players || []);
        setGameMode('online');
        if (ack.state) {
          setGameState(ack.state);
          setView('playing');
        } else {
          setView('lobby');
        }
      });
    };
    if (socket.connected) attempt(); else socket.once('connect', attempt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Socket is only created lazily (first online interaction, or the rejoin
  // effect above) -- most visits never touch the network at all.
  function ensureSocket() {
    if (socketRef.current) return socketRef.current;
    const socket = io(GAME_SERVER_URL);
    socketRef.current = socket;

    socket.on('chess:players-update', ({ players: pl }) => setPlayers(pl));

    socket.on('chess:game-started', ({ state, players: pl }) => {
      setGameState(state);
      setPlayers(pl);
      setLastMoveSquares(null);
      setCapturedByWhite([]);
      setCapturedByBlack([]);
      setMoveLogEntries([]);
      setGameMode('online');
      setView('playing');
    });

    socket.on('chess:state-update', ({ state, move }) => {
      // ensureSocket() only runs once, so this handler's closure would
      // otherwise always see whatever `gameState` was at that first call --
      // gameStateRef.current is kept fresh by the effect below specifically
      // to avoid that staleness (see DESIGN.md's stale-closure rule).
      const prevState = gameStateRef.current;
      if (prevState && move) {
        animateAndApply(prevState, move, move.promotion, state);
      } else {
        setGameState(state);
      }
    });

    socket.on('chess:game-over', ({ reason }) => {
      setOnlineMessage(reason === 'resigned' || reason === 'forfeit' ? 'Game over — opponent left the board.' : '');
    });

    socket.on('chess:player-disconnected', ({ color, graceMs }) => {
      setPlayers((prev) => prev.map((p) => (p.color === color ? { ...p, connected: false } : p)));
      setOnlineMessage(`Opponent disconnected — waiting up to ${Math.round(graceMs / 60000)} min to reconnect.`);
    });

    socket.on('chess:player-reconnected', ({ players: pl }) => {
      setPlayers(pl);
      setOnlineMessage('Opponent reconnected.');
    });

    socket.on('chess:player-forfeited', ({ state }) => {
      setGameState(state);
      setOnlineMessage('Opponent forfeited.');
    });

    return socket;
  }

  useEffect(() => {
    const handleUnload = () => { socketRef.current?.disconnect(); };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  function clearSelection() {
    setSelectedSquare(null);
    setLegalForSelected([]);
  }

  function recordMove(beforeState, match, afterState, promotionType) {
    const moveForSan = { ...match, promotion: promotionType };
    const piece = beforeState.board[match.from];
    const color = CE.colorOf(piece);
    const capturedPiece = match.flag === 'enpassant'
      ? beforeState.board[CE.sq(CE.fileOf(match.to), CE.rankOf(match.from))]
      : beforeState.board[match.to];
    if (capturedPiece) {
      const capturedType = CE.typeOf(capturedPiece);
      if (color === 'w') setCapturedByWhite((prev) => [...prev, capturedType]);
      else setCapturedByBlack((prev) => [...prev, capturedType]);
    }
    const san = computeSAN(beforeState, moveForSan, afterState);
    setMoveLogEntries((prev) => {
      if (color === 'w') return [...prev, { num: beforeState.fullmoveNumber, white: san, black: null }];
      const last = prev[prev.length - 1];
      if (last && last.black === null) {
        const updated = [...prev];
        updated[updated.length - 1] = { ...last, black: san };
        return updated;
      }
      return [...prev, { num: beforeState.fullmoveNumber, white: null, black: san }];
    });
    setLastMoveSquares({ from: match.from, to: match.to });
  }

  // Shared by both local play (where `match`/`afterState` are computed from
  // a local click) and online play (where they arrive from the server's
  // chess:state-update broadcast) -- same glide/capture-fade/castle-rook
  // animation either way, then applies the resulting state once it settles.
  async function animateAndApply(beforeState, match, promotionType, afterState) {
    setIsAnimatingMove(true);

    const { from, to } = match;
    const isCapture = !!beforeState.board[to] || match.flag === 'enpassant';
    const capturedSquare = match.flag === 'enpassant' ? CE.sq(CE.fileOf(to), CE.rankOf(from)) : to;

    const moverRef = pieceRefs.current.get(from);
    if (moverRef) {
      const pos = percentForFileRank(CE.fileOf(to), CE.rankOf(to));
      moverRef.style.left = pos.left;
      moverRef.style.top = pos.top;
    }

    if (match.flag === 'castleK' || match.flag === 'castleQ') {
      const rank0 = CE.rankOf(from);
      const rookFrom = match.flag === 'castleK' ? CE.sq(7, rank0) : CE.sq(0, rank0);
      const rookTo = match.flag === 'castleK' ? CE.sq(5, rank0) : CE.sq(3, rank0);
      const rookRef = pieceRefs.current.get(rookFrom);
      if (rookRef) {
        const rp = percentForFileRank(CE.fileOf(rookTo), CE.rankOf(rookTo));
        rookRef.style.left = rp.left;
        rookRef.style.top = rp.top;
      }
    }

    if (isCapture) {
      const capturedRef = pieceRefs.current.get(capturedSquare);
      if (capturedRef) {
        capturedRef.style.transition = 'transform 0.25s var(--ease-smooth), opacity 0.25s';
        capturedRef.style.transform = `${capturedRef.style.transform || ''} scale(0)`;
        capturedRef.style.opacity = '0';
      }
    }

    await new Promise((resolve) => setTimeout(resolve, MOVE_ANIM_MS));

    recordMove(beforeState, match, afterState, promotionType);
    setGameState(afterState);
    setIsAnimatingMove(false);
    setSelectedSquare(null);
    setLegalForSelected([]);
  }

  function performMove(from, to, promotionType) {
    const beforeState = gameState;
    const legal = CE.getLegalMoves(beforeState, from);
    const match = legal.find((m) => m.to === to);
    if (!match) return; // defensive guard -- shouldn't happen, selection already filtered to legal moves
    const afterState = CE.applyMove(beforeState, from, to, promotionType);
    animateAndApply(beforeState, match, promotionType, afterState);
  }

  function handleSquareClick(square) {
    if (isAnimatingMove || !gameState) return;
    if (['checkmate', 'stalemate', 'draw', 'resigned'].includes(gameState.status)) return;
    const piece = gameState.board[square];

    if (selectedSquare !== null) {
      const movesToSquare = legalForSelected.filter((m) => m.to === square);
      if (movesToSquare.length > 1) {
        setPendingPromotion({ from: selectedSquare, to: square });
        clearSelection();
        return;
      }
      if (movesToSquare.length === 1) {
        const mv = movesToSquare[0];
        const from = selectedSquare;
        clearSelection();
        performMove(from, square, mv.promotion || null);
        return;
      }
      if (square === selectedSquare) { clearSelection(); return; }
    }

    if (piece && CE.colorOf(piece) === gameState.turn) {
      setSelectedSquare(square);
      setLegalForSelected(CE.expandPromotions(CE.getLegalMoves(gameState, square)));
    } else {
      clearSelection();
    }
  }

  function handlePromotionChoice(pieceType) {
    if (!pendingPromotion) return;
    const { from, to } = pendingPromotion;
    setPendingPromotion(null);
    performMove(from, to, pieceType);
  }

  function handleStartLocal() {
    setDisplayNames({ w: whiteName.trim() || 'White', b: blackName.trim() || 'Black' });
    const initial = CE.createInitialState();
    setGameState(initial);
    clearSelection();
    setLastMoveSquares(null);
    setPendingPromotion(null);
    setCapturedByWhite([]);
    setCapturedByBlack([]);
    setMoveLogEntries([]);
    setBoardRotationColor(null); // next effect run applies the starting orientation immediately, no delay
    setGameMode('local');
    setView('playing');
  }

  function handleNewSetup() {
    setView('setup');
    setGameMode(null);
    setGameState(null);
  }

  // ---- online: in-game (server-authoritative -- we only ever send intents) ----

  function handleSquareClickOnline(square) {
    if (isAnimatingMove || !gameState || isSpectator) return;
    if (['checkmate', 'stalemate', 'draw', 'resigned'].includes(gameState.status)) return;
    if (myColor !== gameState.turn) return; // not my turn -- server enforces this too, but keep the UI honest
    const piece = gameState.board[square];

    if (selectedSquare !== null) {
      const movesToSquare = legalForSelected.filter((m) => m.to === square);
      if (movesToSquare.length > 1) {
        setPendingPromotion({ from: selectedSquare, to: square });
        clearSelection();
        return;
      }
      if (movesToSquare.length === 1) {
        const mv = movesToSquare[0];
        const from = selectedSquare;
        clearSelection();
        socketRef.current?.emit('chess:move', { roomCode, from, to: square, promotion: mv.promotion || null }, (ack) => {
          if (!ack?.ok) setOnlineMessage(ack?.error || 'Move rejected.');
        });
        return;
      }
      if (square === selectedSquare) { clearSelection(); return; }
    }

    if (piece && CE.colorOf(piece) === myColor) {
      setSelectedSquare(square);
      setLegalForSelected(CE.expandPromotions(CE.getLegalMoves(gameState, square)));
    } else {
      clearSelection();
    }
  }

  function handlePromotionChoiceOnline(pieceType) {
    if (!pendingPromotion) return;
    const { from, to } = pendingPromotion;
    setPendingPromotion(null);
    socketRef.current?.emit('chess:move', { roomCode, from, to, promotion: pieceType }, (ack) => {
      if (!ack?.ok) setOnlineMessage(ack?.error || 'Move rejected.');
    });
  }

  // ---- online: room lifecycle ----

  function handleCreateRoom() {
    if (!onlineName.trim()) { setOnlineError('Enter your name first.'); return; }
    setOnlineError('');
    const socket = ensureSocket();
    const doCreate = () => {
      socket.emit('chess:create-room', { playerName: onlineName.trim() }, (ack) => {
        if (!ack?.ok) { setOnlineError(ack?.error || 'Could not create room.'); return; }
        setRoomCode(ack.roomCode);
        setMyColor(ack.color);
        setPlayers(ack.players || []);
        setIsSpectator(false);
        saveSession(ack.roomCode, ack.color);
        setView('lobby');
      });
    };
    if (socket.connected) doCreate(); else socket.once('connect', doCreate);
  }

  function handleJoinRoom() {
    if (!onlineName.trim()) { setOnlineError('Enter your name first.'); return; }
    if (!joinCode.trim()) { setOnlineError('Enter a room code.'); return; }
    setOnlineError('');
    const socket = ensureSocket();
    const doJoin = () => {
      socket.emit('chess:join-room', { roomCode: joinCode.trim(), playerName: onlineName.trim() }, (ack) => {
        if (!ack?.ok) { setOnlineError(ack?.error || 'Could not join room.'); return; }
        setRoomCode(ack.roomCode);
        setMyColor(ack.color);
        setPlayers(ack.players || []);
        setIsSpectator(!!ack.spectator);
        saveSession(ack.roomCode, ack.color);
        setGameMode('online');
        if (ack.started && ack.state) {
          setGameState(ack.state);
          setView('playing');
        } else {
          setView('lobby');
        }
      });
    };
    if (socket.connected) doJoin(); else socket.once('connect', doJoin);
  }

  function handleStartOnlineGame() {
    socketRef.current?.emit('chess:start-game', { roomCode }, (ack) => {
      if (!ack?.ok) setOnlineError(ack?.error || 'Could not start game.');
    });
  }

  function handleLeaveRoom() {
    socketRef.current?.emit('chess:leave-room');
    clearSession();
    setRoomCode(null);
    setMyColor(null);
    setPlayers([]);
    setIsSpectator(false);
    setGameMode(null);
    setGameState(null);
    setView('setup');
  }

  async function handleShareRoom() {
    const link = `${window.location.origin}${window.location.pathname}?join=${roomCode}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Join my Chess room', text: `Join my Chess game — room code ${roomCode}`, url: link }); }
      catch { /* user closed the share sheet, nothing to do */ }
    } else {
      try { await navigator.clipboard.writeText(link); setOnlineMessage('Invite link copied.'); }
      catch { setOnlineMessage(`Room code: ${roomCode}`); }
    }
  }

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1500);
    } catch {
      setOnlineMessage(`Room code: ${roomCode}`);
    }
  }

  function handleResign() {
    socketRef.current?.emit('chess:resign', { roomCode }, (ack) => {
      if (!ack?.ok) setOnlineMessage(ack?.error || 'Could not resign.');
    });
  }

  // ---- online setup state ----
  const [onlineSubTab, setOnlineSubTab] = useState('create'); // 'create' | 'join'
  const [onlineName, setOnlineName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [onlineError, setOnlineError] = useState('');

  const activeDisplayNames = gameMode === 'online'
    ? { w: players.find((p) => p.color === 'w')?.name || 'White', b: players.find((p) => p.color === 'b')?.name || 'Black' }
    : displayNames;

  return (
    <div className="arcade-shell chess-shell">
      <div className="tool-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div className="tool-crumb">
              <span className="cat chess">ARCADE</span>
              <span className="num">CATALOG NO. 018</span>
            </div>
            <h1>Chess</h1>
            <p>Full rules — castling, en passant, promotion, check and checkmate. Same device, or a private room with voice and video.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">2 PLAYERS</span>
              <span className="tool-chip">LOCAL + ONLINE</span>
              <span className="tool-chip">VOICE/VIDEO</span>
            </div>
          </div>
          <CircularText text="CHESS.SYS • CHECKMATE • " spinDuration={18} onHover="speedUp" />
        </div>
      </div>

      <AnimatePresence mode="wait">
      {view === 'setup' ? (
      <motion.div
        key="setup"
        className="arcade-setup-stage"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.25, ease: EASE }}
      >
        <motion.section
          layout
          className="panel-card arcade-setup-panel"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ default: { duration: 0.25, ease: EASE }, layout: { duration: 0.35, ease: EASE } }}
        >
          <div className="panel-head">
            <h2>Set up your game</h2>
          </div>

          <div className="arcade-tab-row" role="tablist" aria-label="Game mode">
            <button
              type="button"
              className={`btn-mini arcade-tab ${mode === 'local' ? 'pressed' : ''}`}
              aria-pressed={mode === 'local'}
              onClick={() => setMode('local')}
            >
              <Smartphone size={14} /> Same device
            </button>
            <button
              type="button"
              className={`btn-mini arcade-tab ${mode === 'online' ? 'pressed' : ''}`}
              aria-pressed={mode === 'online'}
              onClick={() => setMode('online')}
            >
              <Globe size={14} /> Online room
            </button>
          </div>

          <AnimatePresence mode="popLayout">
            {mode === 'local' ? (
              <motion.div
                key="local"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: EASE }}
              >
                <div className="arcade-field-block">
                  <span className="field-label">Players</span>
                  <div className="arcade-player-rows">
                    <div className="arcade-player-row">
                      <span className="arcade-swatch swatch-white" aria-hidden="true" />
                      <input
                        type="text"
                        maxLength={16}
                        placeholder="White"
                        aria-label="White player name"
                        value={whiteName}
                        onChange={(e) => setWhiteName(e.target.value)}
                      />
                    </div>
                    <div className="arcade-player-row">
                      <span className="arcade-swatch swatch-black" aria-hidden="true" />
                      <input
                        type="text"
                        maxLength={16}
                        placeholder="Black"
                        aria-label="Black player name"
                        value={blackName}
                        onChange={(e) => setBlackName(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <button type="button" className="btn-primary" onClick={handleStartLocal}>
                  <Swords size={16} /> Start game
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="online"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: EASE }}
              >
                <div className="arcade-tab-row" role="tablist" aria-label="Create or join">
                  <button
                    type="button"
                    className={`btn-mini arcade-tab ${onlineSubTab === 'create' ? 'pressed' : ''}`}
                    aria-pressed={onlineSubTab === 'create'}
                    onClick={() => { setOnlineSubTab('create'); setOnlineError(''); }}
                  >
                    <Plus size={14} /> Create room
                  </button>
                  <button
                    type="button"
                    className={`btn-mini arcade-tab ${onlineSubTab === 'join' ? 'pressed' : ''}`}
                    aria-pressed={onlineSubTab === 'join'}
                    onClick={() => { setOnlineSubTab('join'); setOnlineError(''); }}
                  >
                    <LogIn size={14} /> Join room
                  </button>
                </div>

                {onlineSubTab === 'create' ? (
                  <>
                    <div className="field" style={{ marginBottom: 16 }}>
                      <label htmlFor="chess-name-create">Your name</label>
                      <input
                        id="chess-name-create" type="text" maxLength={16} placeholder="Your name"
                        value={onlineName} onChange={(e) => setOnlineName(e.target.value)}
                      />
                    </div>
                    <button type="button" className="btn-primary" onClick={handleCreateRoom}>
                      <Swords size={16} /> Create room
                    </button>
                  </>
                ) : (
                  <>
                    <div className="field" style={{ marginBottom: 16 }}>
                      <label htmlFor="chess-name-join">Your name</label>
                      <input
                        id="chess-name-join" type="text" maxLength={16} placeholder="Your name"
                        value={onlineName} onChange={(e) => setOnlineName(e.target.value)}
                      />
                    </div>
                    <div className="field" style={{ marginBottom: 16 }}>
                      <label htmlFor="chess-join-code">Room code</label>
                      <input
                        id="chess-join-code" type="text" maxLength={8} inputMode="numeric" placeholder="00000000"
                        value={joinCode} onChange={(e) => setJoinCode(e.target.value)}
                      />
                    </div>
                    <button type="button" className="btn-primary" onClick={handleJoinRoom}>
                      <LogIn size={16} /> Join room
                    </button>
                  </>
                )}

                {onlineError && <p className="arcade-error">{onlineError}</p>}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>
      </motion.div>
      ) : view === 'lobby' ? (
      <motion.div
        key="lobby"
        className="arcade-setup-stage"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.25, ease: EASE }}
      >
        <motion.section
          layout
          className="panel-card arcade-setup-panel"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ default: { duration: 0.25, ease: EASE }, layout: { duration: 0.35, ease: EASE } }}
        >
          <div className="panel-head">
            <h2>Waiting for an opponent</h2>
          </div>

          <div className="ludo-room-code-box">
            <span className="field-label">Room code — share this</span>
            <div className="ludo-room-code-value">{roomCode}</div>
            <div className="ludo-room-code-actions">
              <button type="button" className="btn-mini" onClick={handleCopyCode}>
                {codeCopied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy code</>}
              </button>
              <button type="button" className="btn-mini" onClick={handleShareRoom}>
                <Share2 size={14} /> Share invite
              </button>
            </div>
          </div>

          <div className="arcade-field-block">
            <span className="field-label">Players ({players.length}/2)</span>
            <div className="arcade-player-rows">
              <AnimatePresence initial={false}>
                {players.map((p) => (
                  <motion.div
                    layout
                    key={p.color}
                    className="arcade-player-row"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22, ease: EASE }}
                  >
                    <span className={`arcade-swatch swatch-${p.color === 'w' ? 'white' : 'black'}`} aria-hidden="true" />
                    <span className="ludo-lobby-name">{p.name}{p.color === myColor ? ' (you)' : ''}</span>
                    {!p.connected && <span className="ludo-lobby-status">reconnecting…</span>}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          <div className="arcade-field-block">
            <span className="field-label">Voice &amp; video — turn on now, or later in-game</span>
            <VideoPanel
              localStream={webrtc.localStream}
              remoteStreams={webrtc.remoteStreams}
              remoteVideoEnabled={webrtc.remoteVideoEnabled}
              players={players}
              myColor={myColor}
              micOn={webrtc.micOn}
              camOn={webrtc.camOn}
              toggleMic={webrtc.toggleMic}
              toggleCam={webrtc.toggleCam}
              mediaError={webrtc.mediaError}
            />
          </div>

          {isSpectator ? (
            <p className="ludo-message">You're spectating — this room is full or already playing.</p>
          ) : players.length >= 2 ? (
            <button type="button" className="btn-primary" onClick={handleStartOnlineGame}>
              <Swords size={16} /> Start game
            </button>
          ) : (
            <p className="ludo-message">Waiting for an opponent to join…</p>
          )}

          <button type="button" className="btn-mini" onClick={handleLeaveRoom} style={{ marginTop: 12 }}>
            Leave room
          </button>

          {onlineError && <p className="arcade-error">{onlineError}</p>}
        </motion.section>
      </motion.div>
      ) : (
      <motion.div
        key="playing"
        className="chess-game-stage"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: EASE }}
      >
        {!gameState ? null : (
        <>
        <div className="arcade-game-topbar">
          <div
            className="arcade-turn-banner"
            style={{ '--turn-color': gameState.turn === 'w' ? 'var(--paper)' : 'var(--ink)' }}
          >
            {statusMessage(gameState, activeDisplayNames)}
          </div>

          <div className="arcade-newgame-control">
            <AnimatePresence mode="wait" initial={false}>
              {!confirmingNewGame ? (
                <motion.button
                  key="ask"
                  type="button"
                  className="btn-mini"
                  onClick={() => setConfirmingNewGame(true)}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: EASE }}
                >
                  {gameMode === 'online' ? <><Flag size={14} /> Resign</> : <><RotateCcw size={14} /> New game</>}
                </motion.button>
              ) : (
                <motion.div
                  key="confirm"
                  className="arcade-confirm-row"
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.18, ease: EASE }}
                >
                  <span className="arcade-confirm-text">{gameMode === 'online' ? 'Resign this game?' : 'End this game?'}</span>
                  <button
                    type="button"
                    className="btn-mini danger"
                    onClick={gameMode === 'online' ? handleResign : handleNewSetup}
                  >
                    Yes, {gameMode === 'online' ? 'resign' : 'end it'}
                  </button>
                  <button type="button" className="btn-mini" onClick={() => setConfirmingNewGame(false)}>Cancel</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {gameMode === 'online' && (
          <div className="chess-video-row">
            <VideoPanel
              localStream={webrtc.localStream}
              remoteStreams={webrtc.remoteStreams}
              remoteVideoEnabled={webrtc.remoteVideoEnabled}
              players={players}
              myColor={myColor}
              micOn={webrtc.micOn}
              camOn={webrtc.camOn}
              toggleMic={webrtc.toggleMic}
              toggleCam={webrtc.toggleCam}
              mediaError={webrtc.mediaError}
            />
          </div>
        )}

        <div className="chess-game-main">
          <aside className="chess-side-panel">
            <div className="chess-player-card">
              <span className="arcade-swatch swatch-black" aria-hidden="true" />
              <span className="chess-player-name">{activeDisplayNames.b}</span>
            </div>
            <div className="chess-capture-tray">
              {capturedByBlack.map((t, i) => <span key={i}>{GLYPH[t]}</span>)}
            </div>
            <div className="chess-material-diff">
              {(() => {
                const diff = capturedByWhite.reduce((s, t) => s + PIECE_VALUE[t], 0)
                  - capturedByBlack.reduce((s, t) => s + PIECE_VALUE[t], 0);
                return diff < 0 ? `+${-diff}` : '';
              })()}
            </div>
          </aside>

          <div className="chess-board-holder">
            <ChessBoard
              gameState={gameState}
              selectedSquare={selectedSquare}
              legalForSelected={legalForSelected}
              lastMoveSquares={lastMoveSquares}
              onSquareClick={gameMode === 'online' ? handleSquareClickOnline : handleSquareClick}
              registerPieceRef={registerPieceRef}
              rotation={gameMode === 'online' ? rotationForColor(myColor) : rotationForColor(boardRotationColor)}
            />
          </div>

          <aside className="chess-side-panel">
            <div className="chess-player-card">
              <span className="arcade-swatch swatch-white" aria-hidden="true" />
              <span className="chess-player-name">{activeDisplayNames.w}</span>
            </div>
            <div className="chess-capture-tray">
              {capturedByWhite.map((t, i) => <span key={i}>{GLYPH[t]}</span>)}
            </div>
            <div className="chess-material-diff">
              {(() => {
                const diff = capturedByWhite.reduce((s, t) => s + PIECE_VALUE[t], 0)
                  - capturedByBlack.reduce((s, t) => s + PIECE_VALUE[t], 0);
                return diff > 0 ? `+${diff}` : '';
              })()}
            </div>
            <div className="chess-move-log">
              <span className="field-label">Moves</span>
              <div className="chess-move-log-list">
                {moveLogEntries.map((entry, i) => (
                  <div className="chess-move-row" key={i}>
                    <span className="chess-move-num">{entry.num}.</span>
                    <span className="chess-move-w">{entry.white || ''}</span>
                    <span className="chess-move-b">{entry.black || ''}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>

        <AnimatePresence>
          {pendingPromotion && (
            <motion.div
              className="chess-promo-overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE }}
            >
              <motion.div
                className="chess-promo-card panel-card"
                initial={{ scale: 0.85, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.85, y: 20 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <h3>Promote to</h3>
                <div className="chess-promo-choices">
                  {['Q', 'R', 'B', 'N'].map((p) => (
                    <button
                      key={p} type="button" className="chess-promo-btn"
                      onClick={() => (gameMode === 'online' ? handlePromotionChoiceOnline(p) : handlePromotionChoice(p))}
                    >
                      {GLYPH[p]}
                    </button>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {['checkmate', 'stalemate', 'draw', 'resigned'].includes(gameState.status) && (
            <motion.div
              className="arcade-winner-overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <motion.div
                className="arcade-winner-card panel-card"
                initial={{ scale: 0.85, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.85, y: 20 }}
                transition={{ duration: 0.35, ease: EASE }}
              >
                <h3>{gameState.winner ? `${activeDisplayNames[gameState.winner]} wins!` : 'Draw'}</h3>
                <p>{statusMessage(gameState, activeDisplayNames)}</p>
                {gameMode === 'online' ? (
                  <button type="button" className="btn-primary" onClick={handleLeaveRoom}>
                    <Swords size={16} /> Back to lobby
                  </button>
                ) : (
                  <button type="button" className="btn-primary" onClick={handleStartLocal}>
                    <Swords size={16} /> Play again
                  </button>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        </>
        )}
      </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
