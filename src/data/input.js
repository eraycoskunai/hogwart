/**
 * @file Input action definitions and default bindings.
 *
 * Keyboard codes follow `KeyboardEvent.code`. Mouse buttons are encoded as
 * `Mouse0` (left), `Mouse1` (middle), `Mouse2` (right), `Mouse3`, `Mouse4`.
 * Gamepad bindings use the W3C "standard" mapping indices.
 */

/** Actions and their UI labels. `rebindable:false` actions are fixed. */
export const ACTIONS = Object.freeze({
  moveForward: { label: 'İleri', rebindable: true },
  moveBack: { label: 'Geri', rebindable: true },
  moveLeft: { label: 'Sol', rebindable: true },
  moveRight: { label: 'Sağ', rebindable: true },
  jump: { label: 'Zıpla', rebindable: true },
  sprint: { label: 'Koş (depar)', rebindable: true },
  walk: { label: 'Yürü', rebindable: true },
  crouch: { label: 'Çömel', rebindable: true },
  aim: { label: 'Nişan al', rebindable: true },
  lockOn: { label: 'Hedefe kilitlen', rebindable: true },
  shoulderSwap: { label: 'Omuz değiştir', rebindable: true },
  interact: { label: 'Etkileşim', rebindable: true },
  cast: { label: 'Büyü yap', rebindable: true },
  spellWheel: { label: 'Büyü tekerleği (basılı tut)', rebindable: true },
  gesture: { label: 'Jestle büyü çiz (basılı tut)', rebindable: true },
  dodge: { label: 'Kaçın (yuvarlan)', rebindable: true },
  help: { label: 'Kontroller', rebindable: true },
  quickSave: { label: 'Hızlı kayıt', rebindable: true },
  quickLoad: { label: 'Hızlı yükle', rebindable: true },
  pause: { label: 'Duraklat', rebindable: false },
  debug: { label: 'Hata ayıklama paneli', rebindable: false },
});

/** Default keyboard / mouse bindings (two slots per action). */
export const DEFAULT_KEY_BINDINGS = Object.freeze({
  moveForward: ['KeyW', 'ArrowUp'],
  moveBack: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  walk: ['KeyZ'],
  crouch: ['KeyC', 'ControlLeft'],
  aim: ['Mouse2'],
  lockOn: ['Tab', 'Mouse1'],
  shoulderSwap: ['KeyX'],
  interact: ['KeyE'],
  cast: ['Mouse0'],
  spellWheel: ['KeyQ'],
  gesture: ['KeyG', 'Mouse4'],
  dodge: ['KeyF', 'AltLeft'],
  help: ['KeyH'],
  quickSave: ['F5'],
  quickLoad: ['F9'],
  pause: ['Escape', 'KeyP'],
  debug: ['F3'],
});

/** Gamepad mapping (standard layout). */
export const GAMEPAD = Object.freeze({
  buttons: {
    jump: [0], // A / Cross
    crouch: [1], // B / Circle
    interact: [2], // X / Square
    cast: [7], // RT (analog, thresholded)
    spellWheel: [4], // LB
    gesture: [5], // RB
    dodge: [13], // D-pad down
    shoulderSwap: [3], // Y / Triangle
    aim: [6], // LT (analog, thresholded)
    sprint: [10], // L3
    lockOn: [11], // R3
    help: [8], // Back / Select
    pause: [9], // Start
    debug: [16], // Guide / Home
  },
  axes: { moveX: 0, moveY: 1, lookX: 2, lookY: 3 },
  deadzone: 0.18,
  triggerThreshold: 0.35,
  /** Walk when the stick is pushed less than this. */
  walkThreshold: 0.55,
});

/** Keys whose browser default must be suppressed while playing. */
export const PREVENT_DEFAULT_CODES = Object.freeze([
  'Tab', 'Space', 'F3', 'F5', 'F9', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ControlLeft', 'AltLeft', 'KeyP',
]);

/** Human-readable names for binding codes shown in menus. */
export function describeCode(code) {
  if (!code) return '—';
  if (code.startsWith('Mouse')) {
    const names = { Mouse0: 'Sol Tık', Mouse1: 'Orta Tık', Mouse2: 'Sağ Tık', Mouse3: 'Fare 4', Mouse4: 'Fare 5' };
    return names[code] ?? code;
  }
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = {
    Space: 'Boşluk', ShiftLeft: 'Sol Shift', ShiftRight: 'Sağ Shift', ControlLeft: 'Sol Ctrl',
    ControlRight: 'Sağ Ctrl', AltLeft: 'Sol Alt', Tab: 'Tab', Escape: 'Esc', ArrowUp: '↑',
    ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'Enter', Backspace: 'Geri Sil',
  };
  return map[code] ?? code;
}
