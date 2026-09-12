import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Smartphone, Globe, Dice5, Gamepad2, Plus, LogIn, RotateCcw, Share2, Copy, Check } from 'lucide-react';
import { io } from 'socket.io-client';
import CircularText from '../components/CircularText';
import LE from '../utils/ludoEngine';
import LudoBoard from './ludo/LudoBoard';
import LudoDice from './ludo/LudoDice';
import { percentForRowCol, percentForFinishedSlot } from './ludo/ludoLayout';
import { useWebRTC } from '../hooks/useWebRTC';
import VideoPanel from '../components/VideoPanel';

const COLOR_NAMES = { RED: 'Red', GREEN: 'Green', YELLOW: 'Yellow', BLUE: 'Blue' };
const DEFAULT_COLORS_BY_COUNT = {
  2: ['RED', 'YELLOW'],
  3: ['RED', 'GREEN', 'YELLOW'],
  4: ['RED', 'GREEN', 'YELLOW', 'BLUE'],
};
const GLIDE_STEP_MS = 110;
const DICE_SPIN_MS = 900; // must match the CSS transition duration on .ludo-dice-cube
const GAME_SERVER_URL = import.meta.env.VITE_GAME_SERVER_URL || 'http://localhost:3000';
const SESSION_KEY = 'ludo-session';

// Static per-face rotation (deg) that brings that face to the front, given
// how the 6 faces are physically placed in CSS (see LudoDice's face-N
// classes / the CSS transition block).
const DICE_FACE_ROTATION = {
  1: { x: 0, y: 0 },
  6: { x: 0, y: 180 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  2: { x: -90, y: 0 },
  5: { x: 90, y: 0 },
};

const EASE = [0.22, 1, 0.36, 1]; // matches --ease-smooth/--ease-glide

function defaultNames(count) {
  const names = {};
  DEFAULT_COLORS_BY_COUNT[count].forEach((c) => { names[c] = `${COLOR_NAMES[c]} Player`; });
  return names;
}

function cellPositionForProgress(color, progress, tokenId) {
  if (progress === LE.HOME_STEPS) return percentForFinishedSlot(color, tokenId);
  const cell = LE.cellForToken(color, progress);
  return percentForRowCol(cell[0], cell[1]);
}

function buildGlidePath(color, tokenId, from, to) {
  if (from === -1) return [cellPositionForProgress(color, 0, tokenId)];
  const path = [];
  for (let p = from + 1; p <= to; p++) path.push(cellPositionForProgress(color, p, tokenId));
  return path;
}

function turnMessage(state) {
  if (state.winner) return null;
  const player = state.players[state.currentPlayerIndex];
  return state.awaitingMove ? `${player.name} — pick a token to move.` : `${player.name} — roll the die.`;
}

function saveSession(roomCode, color) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode, color })); } catch { /* storage unavailable, non-fatal */ }
}
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* non-fatal */ }
}

export default function Ludo() {
  const [searchParams] = useSearchParams();

  // ---- top-level view: which screen is showing ----
  const [view, setView] = useState('setup'); // 'setup' | 'lobby' | 'playing'
  const [gameMode, setGameMode] = useState(null); // 'local' | 'online' -- which rules apply to the current 'playing' view

  // ---- local (same-device) setup state ----
  const [playerCount, setPlayerCount] = useState(3);
  const [playerNames, setPlayerNames] = useState(() => defaultNames(3));

  // ---- top-level mode ----
  const [mode, setMode] = useState('local'); // 'local' | 'online'

  // ---- shared game state (both local + online play through this) ----
  const [gameState, setGameState] = useState(null);
  const [diceFace, setDiceFace] = useState(null);
  const [diceRotation, setDiceRotation] = useState({ x: 0, y: 0 });
  const [isRolling, setIsRolling] = useState(false);
  const [isAnimatingMove, setIsAnimatingMove] = useState(false);
  const [validMoves, setValidMoves] = useState([]);
  const [message, setMessage] = useState('');
  const [confirmingNewGame, setConfirmingNewGame] = useState(false);
  const tokenRefs = useRef(new Map());

  // ---- online room state ----
  const [roomCode, setRoomCode] = useState(null);
  const [myColor, setMyColor] = useState(null);
  const [players, setPlayers] = useState([]);
  const [maxPlayers, setMaxPlayers] = useState(null);
  const [isSpectator, setIsSpectator] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const socketRef = useRef(null);

  // Local pass-and-play only: the board flip is a real physical cue ("pass
  // the device now") and snapping it the instant a move resolves felt too
  // abrupt -- this holds the just-finished move's orientation for a full
  // second before rotationColor is allowed to change, on top of whatever
  // the flip's own CSS transition duration adds after that.
  const [boardRotationColor, setBoardRotationColor] = useState(null);
  useEffect(() => {
    if (gameMode !== 'local' || !gameState) return;
    const newColor = LE.currentColor(gameState);
    if (boardRotationColor === null) { setBoardRotationColor(newColor); return; } // starting orientation, no delay
    if (boardRotationColor === newColor) return; // extra turn (6/capture) -- nothing to flip
    const t = setTimeout(() => setBoardRotationColor(newColor), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, gameMode]);

  useEffect(() => {
    if (!confirmingNewGame) return;
    const t = setTimeout(() => setConfirmingNewGame(false), 4000);
    return () => clearTimeout(t);
  }, [confirmingNewGame]);

  // Someone shared a room link -- prefill the join form. Runs once on mount.
  useEffect(() => {
    const join = searchParams.get('join');
    if (join) {
      setMode('online');
      setOnlineSubTab('join');
      setJoinCode(join);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconnect to a previous room if the tab was closed/refreshed mid-game.
  useEffect(() => {
    const saved = loadSession();
    if (!saved) return;
    const socket = ensureSocket();
    const attempt = () => {
      socket.emit('ludo:rejoin-room', { roomCode: saved.roomCode, color: saved.color }, (ack) => {
        if (!ack?.ok) { clearSession(); return; }
        setRoomCode(saved.roomCode);
        setMyColor(saved.color);
        setPlayers(ack.players || []);
        setGameMode('online');
        if (ack.state) {
          setGameState(ack.state);
          setValidMoves([]);
          setMessage(turnMessage(ack.state));
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
    const socket = io(GAME_SERVER_URL); // default transports (polling -> upgrade) -- forcing websocket-only made the first connection brittle
    socketRef.current = socket;

    socket.on('ludo:players-update', ({ players: pl }) => setPlayers(pl));

    socket.on('ludo:game-started', ({ state }) => {
      setGameState(state);
      setValidMoves([]);
      setDiceFace(null);
      setMessage(turnMessage(state));
      setGameMode('online');
      setView('playing');
    });

    socket.on('ludo:dice-rolled', ({ dice, state, validMoves: vm, autoPassed, forfeited }) => {
      spinDiceCubeTo(dice);
      setTimeout(() => {
        setDiceFace(dice);
        setGameState(state);
        setValidMoves(autoPassed ? [] : vm);
        setIsRolling(false);
        setMessage(
          forfeited ? 'Three 6s in a row — turn forfeited.'
          : autoPassed ? `Rolled ${dice} — no legal move, turn passes.`
          : `Rolled ${dice} — pick a token to move.`
        );
      }, DICE_SPIN_MS);
    });

    socket.on('ludo:state-update', ({ state }) => {
      setGameState(state);
      setValidMoves([]);
      setMessage(
        state.winner
          ? `${state.players.find((p) => p.color === state.winner)?.name || state.winner} wins!`
          : turnMessage(state)
      );
    });

    socket.on('ludo:player-disconnected', ({ color, graceMs }) => {
      setPlayers((prev) => prev.map((p) => (p.color === color ? { ...p, connected: false } : p)));
      setMessage(`${COLOR_NAMES[color] || color} disconnected — waiting up to ${Math.round(graceMs / 60000)} min to reconnect.`);
    });

    socket.on('ludo:player-reconnected', ({ color, players: pl }) => {
      setPlayers(pl);
      setMessage(`${COLOR_NAMES[color] || color} reconnected.`);
    });

    socket.on('ludo:player-forfeited', ({ color, state }) => {
      setGameState(state);
      setMessage(`${COLOR_NAMES[color] || color} forfeited — sent home.`);
    });

    return socket;
  }

  // NOT a plain unmount-cleanup effect on purpose: React 18 StrictMode
  // mounts -> unmounts -> remounts every component once in dev to catch
  // cleanup bugs. A `return () => socket.disconnect()` here would fire
  // during that simulated unmount too, killing a socket mid-handshake
  // before you'd even clicked anything -- which is exactly the "closed
  // before the connection is established" error. beforeunload only fires
  // on an actual tab close/navigation, never during StrictMode's churn.
  useEffect(() => {
    const handleUnload = () => { socketRef.current?.disconnect(); };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  function registerTokenRef(color, tokenId, el) {
    const key = `${color}-${tokenId}`;
    if (el) tokenRefs.current.set(key, el);
    else tokenRefs.current.delete(key);
  }

  function spinDiceCubeTo(value) {
    const target = DICE_FACE_ROTATION[value];
    setDiceRotation((prev) => {
      const spinsX = 3 + Math.floor(Math.random() * 2); // 3-4 extra full turns, never resets to 0
      const spinsY = 3 + Math.floor(Math.random() * 2);
      const lapX = prev.x - (prev.x % 360);
      const lapY = prev.y - (prev.y % 360);
      return { x: lapX + spinsX * 360 + target.x, y: lapY + spinsY * 360 + target.y };
    });
  }

  async function glideTokenTo(color, tokenId, from, to) {
    setIsAnimatingMove(true);
    const ref = tokenRefs.current.get(`${color}-${tokenId}`);
    const path = buildGlidePath(color, tokenId, from, to);
    for (const pos of path) {
      if (ref) { ref.style.left = pos.left; ref.style.top = pos.top; }
      await new Promise((resolve) => setTimeout(resolve, GLIDE_STEP_MS));
    }
    setIsAnimatingMove(false);
  }

  // ---- local pass-and-play ----

  function handleRollDice() {
    if (!gameState || isRolling || isAnimatingMove || gameState.awaitingMove || gameState.winner) return;
    setIsRolling(true);
    const value = 1 + Math.floor(Math.random() * 6);
    spinDiceCubeTo(value);
    setTimeout(() => {
      const result = LE.applyDiceRoll(gameState, value);
      setDiceFace(value);
      setGameState(result.state);
      setValidMoves(result.autoPassed ? [] : result.validMoves);
      setIsRolling(false);
      setMessage(
        result.forfeited ? 'Three 6s in a row — turn forfeited.'
        : result.autoPassed ? `Rolled ${value} — no legal move, turn passes.`
        : `Rolled ${value} — pick a token to move.`
      );
    }, DICE_SPIN_MS);
  }

  async function handleTokenClick(color, tokenId) {
    if (isAnimatingMove || isRolling || !gameState) return;
    if (color !== LE.currentColor(gameState)) return;
    const move = validMoves.find((m) => m.tokenId === tokenId);
    if (!move) return;

    await glideTokenTo(color, tokenId, move.from, move.to);

    const nextState = LE.applyMove(gameState, tokenId, gameState.dice);
    setGameState(nextState);
    setValidMoves([]);
    setMessage(
      nextState.winner
        ? `${nextState.players.find((p) => p.color === nextState.winner)?.name || nextState.winner} wins!`
        : turnMessage(nextState)
    );
  }

  function handleStartLocal() {
    const initial = LE.createInitialState(activeColors, playerNames);
    setGameState(initial);
    setDiceFace(null);
    setValidMoves([]);
    setMessage(turnMessage(initial));
    setBoardRotationColor(null); // next effect run applies the starting orientation immediately, no delay
    setGameMode('local');
    setView('playing');
  }

  function handlePlayAgain() {
    const initial = LE.createInitialState(gameState.players.map((p) => p.color), Object.fromEntries(gameState.players.map((p) => [p.color, p.name])));
    setGameState(initial);
    setDiceFace(null);
    setValidMoves([]);
    setMessage(turnMessage(initial));
    setBoardRotationColor(null);
  }

  function handleNewSetup() {
    setView('setup');
    setGameMode(null);
    setGameState(null);
    setDiceFace(null);
    setValidMoves([]);
  }

  // ---- online: room lifecycle ----

  function handleCreateRoom() {
    if (!onlineName.trim()) { setOnlineError('Enter your name first.'); return; }
    setOnlineError('');
    const socket = ensureSocket();
    const doCreate = () => {
      socket.emit('ludo:create-room', { playerName: onlineName.trim(), playerCount: onlineCount }, (ack) => {
        if (!ack?.ok) { setOnlineError(ack?.error || 'Could not create room.'); return; }
        setRoomCode(ack.roomCode);
        setMyColor(ack.color);
        setPlayers(ack.players || []);
        setMaxPlayers(ack.maxPlayers || null);
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
      socket.emit('ludo:join-room', { roomCode: joinCode.trim(), playerName: onlineName.trim() }, (ack) => {
        if (!ack?.ok) { setOnlineError(ack?.error || 'Could not join room.'); return; }
        setRoomCode(ack.roomCode);
        setMyColor(ack.color);
        setPlayers(ack.players || []);
        setMaxPlayers(ack.maxPlayers || null);
        setIsSpectator(!!ack.spectator);
        saveSession(ack.roomCode, ack.color);
        setGameMode('online');
        if (ack.started && ack.state) {
          setGameState(ack.state);
          setValidMoves([]);
          setMessage(turnMessage(ack.state));
          setView('playing');
        } else {
          setView('lobby');
        }
      });
    };
    if (socket.connected) doJoin(); else socket.once('connect', doJoin);
  }

  function handleStartOnlineGame() {
    socketRef.current?.emit('ludo:start-game', { roomCode }, (ack) => {
      if (!ack?.ok) setOnlineError(ack?.error || 'Could not start game.');
    });
  }

  function handleLeaveRoom() {
    socketRef.current?.emit('ludo:leave-room');
    clearSession();
    setRoomCode(null);
    setMyColor(null);
    setPlayers([]);
    setMaxPlayers(null);
    setIsSpectator(false);
    setGameMode(null);
    setGameState(null);
    setView('setup');
  }

  async function handleShareRoom() {
    const link = `${window.location.origin}${window.location.pathname}?join=${roomCode}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Join my Ludo room', text: `Join my Ludo game — room code ${roomCode}`, url: link }); }
      catch { /* user closed the share sheet, nothing to do */ }
    } else {
      try { await navigator.clipboard.writeText(link); setMessage('Invite link copied.'); }
      catch { setMessage(`Room code: ${roomCode}`); }
    }
  }

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1500);
    } catch {
      setMessage(`Room code: ${roomCode}`);
    }
  }

  // ---- online: in-game (server-authoritative -- we only ever send intents) ----

  function handleRollDiceOnline() {
    if (!gameState || isRolling || isAnimatingMove || gameState.awaitingMove || gameState.winner) return;
    if (myColor !== LE.currentColor(gameState)) return;
    setIsRolling(true);
    socketRef.current?.emit('ludo:roll-dice', { roomCode }, (ack) => {
      if (!ack?.ok) { setIsRolling(false); setMessage(ack?.error || 'Could not roll.'); }
      // success: the 'ludo:dice-rolled' broadcast (bound in ensureSocket) drives the spin + state update
    });
  }

  async function handleTokenClickOnline(color, tokenId) {
    if (isAnimatingMove || isRolling || !gameState || isSpectator) return;
    if (color !== myColor || color !== LE.currentColor(gameState)) return;
    const move = validMoves.find((m) => m.tokenId === tokenId);
    if (!move) return;

    await glideTokenTo(color, tokenId, move.from, move.to);
    setValidMoves([]);
    socketRef.current?.emit('ludo:move-token', { roomCode, tokenId }, (ack) => {
      if (!ack?.ok) setMessage(ack?.error || 'Move rejected.');
      // authoritative result arrives via 'ludo:state-update' regardless
    });
  }

  // ---- online setup state ----
  const [onlineSubTab, setOnlineSubTab] = useState('create'); // 'create' | 'join'
  const [onlineName, setOnlineName] = useState('');
  const [onlineCount, setOnlineCount] = useState(3);
  const [joinCode, setJoinCode] = useState('');
  const [onlineError, setOnlineError] = useState('');


  const activeColors = DEFAULT_COLORS_BY_COUNT[playerCount];
  const webrtcEnabled = !!roomCode && (view === 'lobby' || view === 'playing');
  const webrtc = useWebRTC({ socket: socketRef.current, roomCode, enabled: webrtcEnabled });

  function handleCountChange(count) {
    setPlayerCount(count);
    setPlayerNames(defaultNames(count));
  }

  return (
    <div className="arcade-shell">
      <div className="tool-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <div className="tool-crumb">
              <span className="cat arcade">ARCADE</span>
              <span className="num">CATALOG NO. 017</span>
            </div>
            <h1>Ludo</h1>
            <p>Roll, race, and capture — same device, or a private room with voice and video.</p>
            <div className="tool-chips">
              <span className="tool-chip accent">2–4 PLAYERS</span>
              <span className="tool-chip">LOCAL + ONLINE</span>
              <span className="tool-chip">VOICE/VIDEO</span>
            </div>
          </div>
          <CircularText text="LUDO.SYS • ROLL A SIX • " spinDuration={18} onHover="speedUp" />
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
                    {[2, 3, 4].map((n) => (
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
                  <span className="field-label">Players</span>
                  <div className="arcade-player-rows">
                    <AnimatePresence initial={false}>
                      {activeColors.map((color) => (
                        <motion.div
                          layout
                          key={color}
                          className="arcade-player-row"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.22, ease: EASE }}
                        >
                          <span className={`arcade-swatch swatch-${color.toLowerCase()}`} aria-hidden="true" />
                          <input
                            type="text"
                            maxLength={16}
                            aria-label={`${COLOR_NAMES[color]} player name`}
                            value={playerNames[color] || ''}
                            onChange={(e) => setPlayerNames((p) => ({ ...p, [color]: e.target.value }))}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>

                <button type="button" className="btn-primary" onClick={handleStartLocal}>
                  <Dice5 size={16} /> Start game
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
                      <label htmlFor="ludo-name-create">Your name</label>
                      <input
                        id="ludo-name-create" type="text" maxLength={16} placeholder="Your name"
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
                    <button type="button" className="btn-primary" onClick={handleCreateRoom}>
                      <Gamepad2 size={16} /> Create room
                    </button>
                  </>
                ) : (
                  <>
                    <div className="field" style={{ marginBottom: 16 }}>
                      <label htmlFor="ludo-name-join">Your name</label>
                      <input
                        id="ludo-name-join" type="text" maxLength={16} placeholder="Your name"
                        value={onlineName} onChange={(e) => setOnlineName(e.target.value)}
                      />
                    </div>
                    <div className="field" style={{ marginBottom: 16 }}>
                      <label htmlFor="ludo-join-code">Room code</label>
                      <input
                        id="ludo-join-code" type="text" maxLength={8} inputMode="numeric" placeholder="00000000"
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
            <span className="field-label">Players {maxPlayers ? `(${players.length}/${maxPlayers})` : `(${players.length})`}</span>
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
                    <span className={`arcade-swatch swatch-${p.color.toLowerCase()}`} aria-hidden="true" />
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
              <Gamepad2 size={16} /> Start game
            </button>
          ) : (
            <p className="ludo-message">Waiting for at least one more player…</p>
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
        className="ludo-game-stage"
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: EASE }}
      >
        {!gameState ? null : (
        <>
        <div className="arcade-game-topbar">
          <div className="arcade-turn-banner" style={{ '--turn-color': `var(--ludo-${LE.currentColor(gameState).toLowerCase()})` }}>
            {gameState.winner ? 'Game over' : turnMessage(gameState)}
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

        <div className={`ludo-game-main ${gameMode === 'online' ? 'online' : ''}`}>
          {gameMode === 'online' && (
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
          )}

          <div className="ludo-board-holder">
            <LudoBoard
              gameState={gameState}
              activeColors={gameState.players.map((p) => p.color)}
              selectableTokenIds={
                gameMode === 'online'
                  ? (gameState.awaitingMove && myColor === LE.currentColor(gameState) ? validMoves.map((m) => m.tokenId) : [])
                  : (gameState.awaitingMove ? validMoves.map((m) => m.tokenId) : [])
              }
              onTokenClick={gameMode === 'online' ? handleTokenClickOnline : handleTokenClick}
              registerTokenRef={registerTokenRef}
              rotationColor={gameMode === 'online' ? myColor : boardRotationColor}
            />
          </div>

          <aside className="ludo-dice-panel">
            <LudoDice
              rotation={diceRotation}
              disabled={
                isRolling || isAnimatingMove || gameState.awaitingMove || !!gameState.winner
                || (gameMode === 'online' && myColor !== LE.currentColor(gameState))
              }
              onClick={gameMode === 'online' ? handleRollDiceOnline : handleRollDice}
              revealedValue={diceFace}
            />
            <p className="ludo-message">{message}</p>
          </aside>
        </div>

        <AnimatePresence>
          {gameState.winner && (
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
                <h3>{gameState.players.find((p) => p.color === gameState.winner)?.name} wins!</h3>
                {gameMode === 'online' ? (
                  <button type="button" className="btn-primary" onClick={handleLeaveRoom}>
                    <Dice5 size={16} /> Back to lobby
                  </button>
                ) : (
                  <button type="button" className="btn-primary" onClick={handlePlayAgain}>
                    <Dice5 size={16} /> Play again
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
