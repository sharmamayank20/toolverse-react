import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Smartphone, Globe, Grid3x3, Plus, LogIn, RotateCcw, Share2, Copy, Check } from 'lucide-react';
import { io } from 'socket.io-client';
import CircularText from '../components/CircularText';
import ME from '../utils/memoryEngine';
import MemoryBoard from './memory/MemoryBoard';
import { ICON_POOL } from './memory/memoryConstants';
import { useWebRTC } from '../hooks/useWebRTC';
import VideoPanel from '../components/VideoPanel';

const GAME_SERVER_URL = import.meta.env.VITE_GAME_SERVER_URL || 'http://localhost:3000';
const SESSION_KEY = 'memory-session';

function saveSession(roomCode, playerId) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode, playerId })); } catch { /* non-fatal */ }
}
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* non-fatal */ }
}

// Shared between local resolve and the online flip-resolved broadcast --
// both end up with a fresh state whose last log entry says who just acted
// and what happened, so the message text can be derived the same way
// either way rather than needing a separately-tracked "acting player".
function messageForResolve(state) {
  const lastLog = state.log[state.log.length - 1];
  if (!lastLog) return '';
  const actor = state.players.find((p) => p.id === lastLog.playerId);
  if (lastLog.type === 'match') {
    const again = state.players.length > 1 ? ' Go again!' : '';
    return `${actor.name} found a match!${again}`;
  }
  if (lastLog.type === 'no-match') {
    const nextName = ME.currentPlayer(state).name;
    return `No match.${state.players.length > 1 ? ` ${nextName}'s turn.` : ' Try again.'}`;
  }
  return '';
}
function activityForResolve(state) {
  const lastLog = state.log[state.log.length - 1];
  if (!lastLog) return null;
  const actor = state.players.find((p) => p.id === lastLog.playerId);
  return lastLog.type === 'match' ? `${actor.name} matched a pair` : `${actor.name} missed`;
}

const EASE = [0.22, 1, 0.36, 1]; // matches --ease-smooth/--ease-glide
const RESOLVE_DELAY_MS = 900;   // how long both cards stay visible before resolving
const FLIP_BACK_DELAY_MS = 550; // how long a non-match sits (shaking) before flipping back down
const DIM_DELAY_MS = 2000;      // how long a fresh match glows before settling into its dimmed "solved" look

const GRID_PRESETS = [
  { rows: 4, cols: 4, label: '4×4', diff: 'Easy' },
  { rows: 4, cols: 6, label: '4×6', diff: 'Medium' },
  { rows: 6, cols: 6, label: '6×6', diff: 'Hard' },
];
const PLAYER_SWATCH = ['swatch-red', 'swatch-green', 'swatch-yellow', 'swatch-blue'];
const PLAYER_COLOR_VAR = ['var(--ludo-red)', 'var(--ludo-green)', 'var(--ludo-yellow)', 'var(--ludo-blue)'];

function defaultNames(count) {
  const labels = ['Red', 'Green', 'Yellow', 'Blue'];
  return Array.from({ length: count }, (_, i) => (count === 1 ? 'Player' : `${labels[i]} Player`));
}

function gridKey(g) { return `${g.rows}x${g.cols}`; }

export default function Memory() {
  // ---- top-level view ----
  const [view, setView] = useState('setup'); // 'setup' | 'lobby' | 'playing'
  const [gameMode, setGameMode] = useState(null); // 'local' | 'online'
  const [searchParams] = useSearchParams();

  // ---- local (same-device) setup state ----
  const [playerCount, setPlayerCount] = useState(2);
  const [gridPreset, setGridPreset] = useState(GRID_PRESETS[1]);
  const [playerNames, setPlayerNames] = useState(() => defaultNames(2));

  // ---- top-level mode ----
  const [mode, setMode] = useState('local'); // 'local' | 'online'

  // ---- game state (both local + online play through this) ----
  const [gameState, setGameState] = useState(null);
  const [animating, setAnimating] = useState(false);
  const [showingNoMatch, setShowingNoMatch] = useState([]); // [ia, ib] briefly held face-up + shaking after a miss
  const [dimmedIndices, setDimmedIndices] = useState(new Set()); // matched cards that have settled into their quiet "solved" look
  const [message, setMessage] = useState('');
  const [activityLog, setActivityLog] = useState([]);
  const [showWinnerOverlay, setShowWinnerOverlay] = useState(false);
  const [confirmingNewGame, setConfirmingNewGame] = useState(false);

  // ---- online room state ----
  const [roomCode, setRoomCode] = useState(null);
  const [myPlayerId, setMyPlayerId] = useState(null); // '0'..'3'
  const [players, setPlayers] = useState([]);
  const [isSpectator, setIsSpectator] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [onlineMessage, setOnlineMessage] = useState('');
  const socketRef = useRef(null);

  const webrtcEnabled = !!roomCode && (view === 'lobby' || view === 'playing');
  const webrtc = useWebRTC({ socket: socketRef.current, roomCode, enabled: webrtcEnabled });

  function logActivity(text) {
    setActivityLog((prev) => [text, ...prev].slice(0, 30));
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
      socket.emit('memory:rejoin-room', { roomCode: saved.roomCode, playerId: saved.playerId }, (ack) => {
        if (!ack?.ok) { clearSession(); return; }
        setRoomCode(saved.roomCode);
        setMyPlayerId(saved.playerId);
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

  // Socket is only created lazily -- most visits never touch the network.
  function ensureSocket() {
    if (socketRef.current) return socketRef.current;
    const socket = io(GAME_SERVER_URL);
    socketRef.current = socket;

    socket.on('memory:players-update', ({ players: pl }) => setPlayers(pl));

    socket.on('memory:game-started', ({ state }) => {
      setGameState(state);
      setShowingNoMatch([]);
      setDimmedIndices(new Set());
      setActivityLog([]);
      setShowWinnerOverlay(false);
      setAnimating(false);
      setMessage(state.players.length === 1 ? 'Find all the pairs!' : `${ME.currentPlayer(state).name}'s turn.`);
      setGameMode('online');
      setView('playing');
    });

    // First or second flip of a pair -- just reflect the server's state
    // directly, no local pacing needed (the server owns the "Checking…"
    // pause, unlike local mode where the client schedules it itself).
    socket.on('memory:card-flipped', ({ state }) => {
      setGameState(state);
      setAnimating(state.awaitingResolve);
      if (!state.awaitingResolve) {
        setMessage(`${ME.currentPlayer(state).name}: pick a second card…`);
      } else {
        setMessage('Checking…');
      }
    });

    socket.on('memory:flip-resolved', ({ state }) => {
      const { matched, indices } = state.lastResult;
      const [ia, ib] = indices;
      setMessage(messageForResolve(state));
      const activity = activityForResolve(state);
      if (activity) logActivity(activity);

      if (matched) {
        setGameState(state);
        setAnimating(false);
        setTimeout(() => setDimmedIndices((prev) => new Set(prev).add(ia).add(ib)), DIM_DELAY_MS);
        if (state.gameOver) setTimeout(() => setShowWinnerOverlay(true), DIM_DELAY_MS + 400);
      } else {
        setShowingNoMatch([ia, ib]);
        setTimeout(() => {
          setShowingNoMatch([]);
          setGameState(state);
          setAnimating(false);
        }, FLIP_BACK_DELAY_MS);
      }
    });

    socket.on('memory:player-disconnected', ({ playerId, graceMs }) => {
      setPlayers((prev) => prev.map((p) => (p.color === playerId ? { ...p, connected: false } : p)));
      setOnlineMessage(`A player disconnected — waiting up to ${Math.round(graceMs / 60000)} min to reconnect.`);
    });

    socket.on('memory:player-reconnected', ({ players: pl }) => {
      setPlayers(pl);
      setOnlineMessage('Player reconnected.');
    });

    socket.on('memory:player-forfeited', ({ state }) => {
      setGameState(state);
      setOnlineMessage('A player left the game.');
      if (state.gameOver) setShowWinnerOverlay(true);
    });

    return socket;
  }

  useEffect(() => {
    const handleUnload = () => { socketRef.current?.disconnect(); };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  async function handleCardClick(index) {
    if (!gameState || gameState.gameOver || animating) return;
    const card = gameState.cards[index];
    if (card.matched || gameState.flipped.includes(index)) return;

    const actingPlayer = ME.currentPlayer(gameState);
    let next;
    try { next = ME.flipCard(gameState, index); } catch { return; } // defensive -- stray click mid-transition
    setGameState(next);

    if (!next.awaitingResolve) {
      setMessage(`${actingPlayer.name}: pick a second card…`);
      return;
    }

    setAnimating(true);
    setMessage('Checking…');
    await new Promise((resolve) => setTimeout(resolve, RESOLVE_DELAY_MS));

    const resolved = ME.resolveFlip(next);
    const { matched, indices } = resolved.lastResult;
    const [ia, ib] = indices;

    if (matched) {
      setGameState(resolved);
      const again = resolved.players.length > 1 ? ' Go again!' : '';
      setMessage(`${actingPlayer.name} found a match!${again}`);
      logActivity(`${actingPlayer.name} matched a pair`);
      setAnimating(false);
      setTimeout(() => setDimmedIndices((prev) => new Set(prev).add(ia).add(ib)), DIM_DELAY_MS);
      if (resolved.gameOver) setTimeout(() => setShowWinnerOverlay(true), DIM_DELAY_MS + 400);
    } else {
      setShowingNoMatch([ia, ib]);
      const nextName = ME.currentPlayer(resolved).name; // resolveFlip already advanced the turn
      setMessage(`No match.${resolved.players.length > 1 ? ` ${nextName}'s turn.` : ' Try again.'}`);
      logActivity(`${actingPlayer.name} missed`);
      setTimeout(() => {
        setShowingNoMatch([]);
        setGameState(resolved); // safe now -- resolved.flipped is already [], and the local override clears in the same tick
        setAnimating(false);
      }, FLIP_BACK_DELAY_MS);
    }
  }

  function handleCountChange(count) {
    setPlayerCount(count);
    setPlayerNames(defaultNames(count));
  }

  function handleStartLocal() {
    const initial = ME.createInitialState(playerCount, playerNames, gridPreset.rows, gridPreset.cols);
    setGameState(initial);
    setAnimating(false);
    setShowingNoMatch([]);
    setDimmedIndices(new Set());
    setActivityLog([]);
    setShowWinnerOverlay(false);
    setMessage('Flip two cards to begin!');
    setGameMode('local');
    setView('playing');
  }

  function handleNewSetup() {
    setView('setup');
    setGameMode(null);
    setGameState(null);
  }

  // ---- online: in-game (server-authoritative -- we only ever send intents) ----

  function handleCardClickOnline(index) {
    if (!gameState || gameState.gameOver || animating || isSpectator) return;
    if (myPlayerId !== String(ME.currentPlayer(gameState).id)) return;
    const card = gameState.cards[index];
    if (card.matched || gameState.flipped.includes(index)) return;
    socketRef.current?.emit('memory:flip-card', { roomCode, index }, (ack) => {
      if (!ack?.ok) setOnlineMessage(ack?.error || 'Move rejected.');
    });
  }

  // ---- online setup state ----
  const [onlineSubTab, setOnlineSubTab] = useState('create'); // 'create' | 'join'
  const [onlineName, setOnlineName] = useState('');
  const [onlineCount, setOnlineCount] = useState(2);
  const [onlineGridPreset, setOnlineGridPreset] = useState(GRID_PRESETS[1]);
  const [joinCode, setJoinCode] = useState('');
  const [onlineError, setOnlineError] = useState('');

  // ---- online: room lifecycle ----

  function handleCreateRoom() {
    if (!onlineName.trim()) { setOnlineError('Enter your name first.'); return; }
    setOnlineError('');
    const socket = ensureSocket();
    const doCreate = () => {
      socket.emit('memory:create-room', {
        playerName: onlineName.trim(),
        playerCount: onlineCount,
        rows: onlineGridPreset.rows,
        cols: onlineGridPreset.cols,
      }, (ack) => {
        if (!ack?.ok) { setOnlineError(ack?.error || 'Could not create room.'); return; }
        setRoomCode(ack.roomCode);
        setMyPlayerId(ack.playerId);
        setPlayers(ack.players || []);
        setIsSpectator(false);
        saveSession(ack.roomCode, ack.playerId);
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
      socket.emit('memory:join-room', { roomCode: joinCode.trim(), playerName: onlineName.trim() }, (ack) => {
        if (!ack?.ok) { setOnlineError(ack?.error || 'Could not join room.'); return; }
        setRoomCode(ack.roomCode);
        setMyPlayerId(ack.playerId);
        setPlayers(ack.players || []);
        setIsSpectator(!!ack.spectator);
        saveSession(ack.roomCode, ack.playerId);
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
    socketRef.current?.emit('memory:start-game', { roomCode }, (ack) => {
      if (!ack?.ok) setOnlineError(ack?.error || 'Could not start game.');
    });
  }

  function handleLeaveRoom() {
    socketRef.current?.emit('memory:leave-room');
    clearSession();
    setRoomCode(null);
    setMyPlayerId(null);
    setPlayers([]);
    setIsSpectator(false);
    setGameMode(null);
    setGameState(null);
    setView('setup');
  }

  async function handleShareRoom() {
    const link = `${window.location.origin}${window.location.pathname}?join=${roomCode}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Join my Memory room', text: `Join my Memory game — room code ${roomCode}`, url: link }); }
      catch { /* user closed the share sheet */ }
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

  return (
    <div className="arcade-shell memory-shell">
      <div className="tool-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div className="tool-crumb">
              <span className="cat memory">ARCADE</span>
              <span className="num">CATALOG NO. 019</span>
            </div>
            <h1>Memory</h1>
            <p>Flip two, find the match, keep the streak alive. Same device with up to 4 players, or a private online room.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">1–4 PLAYERS</span>
              <span className="tool-chip">LOCAL + ONLINE</span>
              <span className="tool-chip">VOICE/VIDEO</span>
            </div>
          </div>
          <CircularText text="MEMORY.SYS • FIND THE PAIR • " spinDuration={18} onHover="speedUp" />
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
                  <span className="field-label">Number of players</span>
                  <div className="arcade-tab-row">
                    {[1, 2, 3, 4].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`btn-mini arcade-tab ${playerCount === n ? 'pressed' : ''}`}
                        aria-pressed={playerCount === n}
                        onClick={() => handleCountChange(n)}
                      >
                        <span className="arcade-pixel">{n}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="arcade-field-block">
                  <span className="field-label">Grid size</span>
                  <div className="arcade-tab-row">
                    {GRID_PRESETS.map((g) => (
                      <button
                        key={gridKey(g)}
                        type="button"
                        className={`btn-mini arcade-tab ${gridKey(gridPreset) === gridKey(g) ? 'pressed' : ''}`}
                        aria-pressed={gridKey(gridPreset) === gridKey(g)}
                        onClick={() => setGridPreset(g)}
                      >
                        {g.label} <span className="memory-diff-tag">{g.diff}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="arcade-field-block">
                  <span className="field-label">Players</span>
                  <div className="arcade-player-rows">
                    <AnimatePresence initial={false}>
                      {playerNames.map((name, i) => (
                        <motion.div
                          layout
                          key={i}
                          className="arcade-player-row"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.22, ease: EASE }}
                        >
                          <span className={`arcade-swatch ${PLAYER_SWATCH[i]}`} aria-hidden="true" />
                          <input
                            type="text"
                            maxLength={16}
                            aria-label={`Player ${i + 1} name`}
                            value={name}
                            onChange={(e) => setPlayerNames((prev) => prev.map((n, idx) => (idx === i ? e.target.value : n)))}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>

                <button type="button" className="btn-primary" onClick={handleStartLocal}>
                  <Grid3x3 size={16} /> Start game
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
                      <label htmlFor="memory-name-create">Your name</label>
                      <input
                        id="memory-name-create" type="text" maxLength={16} placeholder="Your name"
                        value={onlineName} onChange={(e) => setOnlineName(e.target.value)}
                      />
                    </div>
                    <div className="arcade-field-block">
                      <span className="field-label">Number of players</span>
                      <div className="arcade-tab-row">
                        {[2, 3, 4].map((n) => (
                          <button
                            key={n}
                            type="button"
                            className={`btn-mini arcade-tab ${onlineCount === n ? 'pressed' : ''}`}
                            aria-pressed={onlineCount === n}
                            onClick={() => setOnlineCount(n)}
                          >
                            <span className="arcade-pixel">{n}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="arcade-field-block">
                      <span className="field-label">Grid size</span>
                      <div className="arcade-tab-row">
                        {GRID_PRESETS.map((g) => (
                          <button
                            key={gridKey(g)}
                            type="button"
                            className={`btn-mini arcade-tab ${gridKey(onlineGridPreset) === gridKey(g) ? 'pressed' : ''}`}
                            aria-pressed={gridKey(onlineGridPreset) === gridKey(g)}
                            onClick={() => setOnlineGridPreset(g)}
                          >
                            {g.label} <span className="memory-diff-tag">{g.diff}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <button type="button" className="btn-primary" onClick={handleCreateRoom}>
                      <Grid3x3 size={16} /> Create room
                    </button>
                  </>
                ) : (
                  <>
                    <div className="field" style={{ marginBottom: 16 }}>
                      <label htmlFor="memory-name-join">Your name</label>
                      <input
                        id="memory-name-join" type="text" maxLength={16} placeholder="Your name"
                        value={onlineName} onChange={(e) => setOnlineName(e.target.value)}
                      />
                    </div>
                    <div className="field" style={{ marginBottom: 16 }}>
                      <label htmlFor="memory-join-code">Room code</label>
                      <input
                        id="memory-join-code" type="text" maxLength={8} inputMode="numeric" placeholder="00000000"
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
            <h2>Waiting for players</h2>
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
            <span className="field-label">Players ({players.length}/{onlineCount})</span>
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
                    <span className={`arcade-swatch ${PLAYER_SWATCH[parseInt(p.color, 10)]}`} aria-hidden="true" />
                    <span className="ludo-lobby-name">{p.name}{p.color === myPlayerId ? ' (you)' : ''}</span>
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
              myColor={myPlayerId}
              micOn={webrtc.micOn}
              camOn={webrtc.camOn}
              toggleMic={webrtc.toggleMic}
              toggleCam={webrtc.toggleCam}
              mediaError={webrtc.mediaError}
            />
          </div>

          {isSpectator ? (
            <p className="memory-message">You're spectating — this room is full or already playing.</p>
          ) : players.length >= 2 ? (
            <button type="button" className="btn-primary" onClick={handleStartOnlineGame}>
              <Grid3x3 size={16} /> Start game
            </button>
          ) : (
            <p className="memory-message">Waiting for at least one more player…</p>
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
        className="memory-game-stage"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: EASE }}
      >
        {!gameState ? null : (
        <>
        <div className="arcade-game-topbar">
          <div
            className="arcade-turn-banner"
            style={{ '--turn-color': gameState.gameOver ? 'var(--arcade-fg)' : PLAYER_COLOR_VAR[ME.currentPlayer(gameState).id] }}
          >
            {gameState.gameOver
              ? 'Game over'
              : gameState.players.length === 1 ? 'Find all the pairs!' : `${ME.currentPlayer(gameState).name}'s turn`}
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
                  <RotateCcw size={14} /> {gameMode === 'online' ? 'Leave game' : 'New game'}
                </motion.button>
              ) : (
                <motion.div
                  key="confirm"
                  className="arcade-confirm-row"
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.18, ease: EASE }}
                >
                  <span className="arcade-confirm-text">{gameMode === 'online' ? 'Leave this game?' : 'End this game?'}</span>
                  <button
                    type="button"
                    className="btn-mini danger"
                    onClick={gameMode === 'online' ? handleLeaveRoom : handleNewSetup}
                  >
                    Yes, {gameMode === 'online' ? 'leave' : 'end it'}
                  </button>
                  <button type="button" className="btn-mini" onClick={() => setConfirmingNewGame(false)}>Cancel</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {gameMode === 'online' && (
          <div className="memory-video-row">
            <VideoPanel
              localStream={webrtc.localStream}
              remoteStreams={webrtc.remoteStreams}
              remoteVideoEnabled={webrtc.remoteVideoEnabled}
              players={players}
              myColor={myPlayerId}
              micOn={webrtc.micOn}
              camOn={webrtc.camOn}
              toggleMic={webrtc.toggleMic}
              toggleCam={webrtc.toggleCam}
              mediaError={webrtc.mediaError}
            />
          </div>
        )}

        <div className="memory-game-main">
          <aside className="memory-side-panel">
            {gameState.players.map((p) => {
              const pairsTotal = gameState.cards.length / 2;
              const isCurrent = !gameState.gameOver && p.id === ME.currentPlayer(gameState).id;
              return (
                <div key={p.id} className={`memory-player-card ${isCurrent ? 'current' : ''}`}>
                  <span className={`arcade-swatch ${PLAYER_SWATCH[p.id]}`} aria-hidden="true" />
                  <div className="memory-player-info">
                    <div className="memory-player-name">{p.name}</div>
                    <div className="memory-player-score">{gameState.scores[p.id]} / {pairsTotal} pairs</div>
                  </div>
                </div>
              );
            })}
          </aside>

          <div className="memory-board-holder" style={{ '--memory-grid-ratio': gameState.cols / gameState.rows }}>
            <MemoryBoard
              gameState={gameState}
              showingNoMatch={showingNoMatch}
              dimmedIndices={dimmedIndices}
              animating={animating}
              onCardClick={gameMode === 'online' ? handleCardClickOnline : handleCardClick}
            />
          </div>

          <aside className="memory-side-panel">
            <p className="memory-message">{message}</p>
            <div className="memory-activity-log">
              {activityLog.map((text, i) => <div key={i} className="memory-activity-row">{text}</div>)}
            </div>
          </aside>
        </div>

        <AnimatePresence>
          {showWinnerOverlay && gameState.gameOver && (
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
                {gameState.winners.length === 1 ? (
                  <>
                    <h3>{gameState.players.length === 1 ? 'Nice work!' : `${gameState.players[gameState.winners[0]].name} wins!`}</h3>
                    <p>
                      {gameState.players.length === 1
                        ? 'You found all the pairs.'
                        : `Found the most pairs: ${gameState.scores[gameState.winners[0]]}.`}
                    </p>
                  </>
                ) : (
                  <>
                    <h3>It's a tie!</h3>
                    <p>
                      {gameState.winners.map((id) => gameState.players[id].name).join(' & ')} tied with{' '}
                      {gameState.scores[gameState.winners[0]]} pairs each.
                    </p>
                  </>
                )}
                {gameMode === 'online' ? (
                  <button type="button" className="btn-primary" onClick={handleLeaveRoom}>
                    <Grid3x3 size={16} /> Back to lobby
                  </button>
                ) : (
                  <button type="button" className="btn-primary" onClick={handleStartLocal}>
                    <Grid3x3 size={16} /> Play again
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
