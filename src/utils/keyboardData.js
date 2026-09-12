export const FN_ROW = [
  { c: 'Escape', l: 'Esc' }, { gap: 0.5 },
  { c: 'F1', l: 'F1' }, { c: 'F2', l: 'F2' }, { c: 'F3', l: 'F3' }, { c: 'F4', l: 'F4' }, { gap: 0.4 },
  { c: 'F5', l: 'F5' }, { c: 'F6', l: 'F6' }, { c: 'F7', l: 'F7' }, { c: 'F8', l: 'F8' }, { gap: 0.4 },
  { c: 'F9', l: 'F9' }, { c: 'F10', l: 'F10' }, { c: 'F11', l: 'F11' }, { c: 'F12', l: 'F12' },
]
export const FN_ROW_EXTRA = [
  { gap: 0.5 },
  { c: 'PrintScreen', l: 'PrtSc' }, { c: 'ScrollLock', l: 'ScrLk' }, { c: 'Pause', l: 'Pause' },
]
export const MAIN_ROWS = [
  [
    { c: 'Backquote', l: '`' }, { c: 'Digit1', l: '1' }, { c: 'Digit2', l: '2' }, { c: 'Digit3', l: '3' },
    { c: 'Digit4', l: '4' }, { c: 'Digit5', l: '5' }, { c: 'Digit6', l: '6' }, { c: 'Digit7', l: '7' },
    { c: 'Digit8', l: '8' }, { c: 'Digit9', l: '9' }, { c: 'Digit0', l: '0' }, { c: 'Minus', l: '-' },
    { c: 'Equal', l: '=' }, { c: 'Backspace', l: '⌫', u: 2, wide: true },
  ],
  [
    { c: 'Tab', l: 'Tab', u: 1.5 },
    { c: 'KeyQ', l: 'Q' }, { c: 'KeyW', l: 'W' }, { c: 'KeyE', l: 'E' }, { c: 'KeyR', l: 'R' }, { c: 'KeyT', l: 'T' },
    { c: 'KeyY', l: 'Y' }, { c: 'KeyU', l: 'U' }, { c: 'KeyI', l: 'I' }, { c: 'KeyO', l: 'O' }, { c: 'KeyP', l: 'P' },
    { c: 'BracketLeft', l: '[' }, { c: 'BracketRight', l: ']' }, { c: 'Backslash', l: '\\', u: 1.5, wide: true },
  ],
  [
    { c: 'CapsLock', l: 'Caps', u: 1.75, wide: true },
    { c: 'KeyA', l: 'A' }, { c: 'KeyS', l: 'S' }, { c: 'KeyD', l: 'D' }, { c: 'KeyF', l: 'F' }, { c: 'KeyG', l: 'G' },
    { c: 'KeyH', l: 'H' }, { c: 'KeyJ', l: 'J' }, { c: 'KeyK', l: 'K' }, { c: 'KeyL', l: 'L' },
    { c: 'Semicolon', l: ';' }, { c: 'Quote', l: "'" }, { c: 'Enter', l: '⏎ Enter', u: 2.25, wide: true },
  ],
  [
    { c: 'ShiftLeft', l: 'Shift', u: 2.25, wide: true },
    { c: 'KeyZ', l: 'Z' }, { c: 'KeyX', l: 'X' }, { c: 'KeyC', l: 'C' }, { c: 'KeyV', l: 'V' }, { c: 'KeyB', l: 'B' },
    { c: 'KeyN', l: 'N' }, { c: 'KeyM', l: 'M' }, { c: 'Comma', l: ',' }, { c: 'Period', l: '.' }, { c: 'Slash', l: '/' },
    { c: 'ShiftRight', l: 'Shift', u: 2.75, wide: true },
  ],
  [
    { c: 'ControlLeft', l: 'Ctrl', u: 1.25, wide: true },
    { c: 'MetaLeft', l: 'Meta', u: 1.25, wide: true },
    { c: 'AltLeft', l: 'Alt', u: 1.25, wide: true },
    { c: 'Space', l: '', u: 6.25 },
    { c: 'AltRight', l: 'Alt', u: 1.25, wide: true },
    { c: 'MetaRight', l: 'Meta', u: 1.25, wide: true, laptopHide: true },
    { c: 'ContextMenu', l: 'Menu', u: 1.25, wide: true, laptopHide: true },
    { c: 'ControlRight', l: 'Ctrl', u: 1.25, wide: true },
  ],
]
export const NAV6 = [
  { c: 'Insert', l: 'Ins' }, { c: 'Home', l: 'Home' }, { c: 'PageUp', l: 'PgUp' },
  { c: 'Delete', l: 'Del' }, { c: 'End', l: 'End' }, { c: 'PageDown', l: 'PgDn' },
]
export const ARROWS = [
  { c: 'ArrowUp', l: '↑', cls: 'arrow-up', wide: true },
  { c: 'ArrowLeft', l: '←', cls: 'arrow-left', wide: true },
  { c: 'ArrowDown', l: '↓', cls: 'arrow-down', wide: true },
  { c: 'ArrowRight', l: '→', cls: 'arrow-right', wide: true },
]
export const NUMPAD = [
  { c: 'NumLock', l: 'Num' }, { c: 'NumpadDivide', l: '/' }, { c: 'NumpadMultiply', l: '*' }, { c: 'NumpadSubtract', l: '-' },
  { c: 'Numpad7', l: '7' }, { c: 'Numpad8', l: '8' }, { c: 'Numpad9', l: '9' }, { c: 'NumpadAdd', l: '+' },
  { c: 'Numpad4', l: '4' }, { c: 'Numpad5', l: '5' }, { c: 'Numpad6', l: '6' }, { c: 'NumpadEnter', l: '⏎' },
  { c: 'Numpad1', l: '1' }, { c: 'Numpad2', l: '2' }, { c: 'Numpad3', l: '3' },
  { c: 'Numpad0', l: '0', span2: true }, { c: 'NumpadDecimal', l: '.' },
]
export const RELABEL_CODES = [
  'KeyA','KeyB','KeyC','KeyD','KeyE','KeyF','KeyG','KeyH','KeyI','KeyJ','KeyK','KeyL','KeyM',
  'KeyN','KeyO','KeyP','KeyQ','KeyR','KeyS','KeyT','KeyU','KeyV','KeyW','KeyX','KeyY','KeyZ',
  'Digit0','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9',
  'Backquote','Minus','Equal','BracketLeft','BracketRight','Backslash','Semicolon','Quote','Comma','Period','Slash',
]

export function detectOS() {
  const uaData = navigator.userAgentData
  const platform = (uaData && uaData.platform) || navigator.platform || navigator.userAgent || ''
  const p = platform.toLowerCase()
  if (p.includes('mac')) return 'mac'
  if (p.includes('win')) return 'windows'
  if (p.includes('linux') || p.includes('x11') || p.includes('cros')) return 'linux'
  return 'other'
}

export const MODIFIER_LABELS = {
  mac:     { ControlLeft: '⌃ Ctrl', ControlRight: '⌃ Ctrl', AltLeft: '⌥ Opt', AltRight: '⌥ Opt', MetaLeft: '⌘ Cmd', MetaRight: '⌘ Cmd', ContextMenu: 'Menu' },
  windows: { ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt', MetaLeft: '⊞ Win', MetaRight: '⊞ Win', ContextMenu: 'Menu' },
  linux:   { ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt', MetaLeft: 'Super', MetaRight: 'Super', ContextMenu: 'Menu' },
  other:   { ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt', MetaLeft: 'Meta', MetaRight: 'Meta', ContextMenu: 'Menu' },
}

export const NEVER_PREVENT = new Set(['F12'])
export const STUCK_TIMEOUT_MS = 4000
export const STORAGE_KEY = 'toolverse_kbtester_v1'