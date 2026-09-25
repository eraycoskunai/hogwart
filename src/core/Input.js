/**
 * @file Input — unified keyboard, mouse and gamepad input with rebindable actions.
 *
 * Usage per rendered frame:
 *   input.update()            // poll gamepads, compute edges
 *   ... game logic reads down()/pressed()/released()/moveAxis()/mouseDelta ...
 *   input.endFrame()          // clear per-frame edges and deltas
 */
import { ACTIONS, DEFAULT_KEY_BINDINGS, GAMEPAD, PREVENT_DEFAULT_CODES } from '../data/input.js';

const MOUSE_PREFIX = 'Mouse';

export class Input {
  /**
   * @param {import('./EventBus.js').EventBus} bus
   * @param {HTMLElement} element element that captures the pointer (the canvas)
   * @param {import('./Settings.js').Settings} settings
   */
  constructor(bus, element, settings) {
    this.bus = bus;
    this.element = element;
    this.settings = settings;

    /** Codes currently held. */
    this._down = new Set();
    /** Codes pressed / released since the last endFrame(). */
    this._pressed = new Set();
    this._released = new Set();

    /** Accumulated mouse movement in pixels this frame. */
    this.mouseDelta = { x: 0, y: 0 };
    this.wheelDelta = 0;
    /** Right-stick look vector (-1..1) after deadzone. */
    this.lookStick = { x: 0, y: 0 };
    this._moveStick = { x: 0, y: 0 };
    this._padDown = new Set();
    this._padPrev = new Set();
    this._padIndex = -1;

    /** 'kbm' | 'pad' — last device the player touched (for UI prompts). */
    this.lastDevice = 'kbm';
    /** When false, gameplay queries return neutral values (menus open). */
    this.gameplayEnabled = true;
    this.pointerLocked = false;

    /** @type {Record<string, (string|null)[]>} */
    this.bindings = {};
    this.loadBindings();

    /** @type {null | {action:string, slot:number, resolve:(code:string|null)=>void}} */
    this._rebind = null;

    this._installListeners();
  }

  // ---------------------------------------------------------------- bindings

  loadBindings() {
    const overrides = this.settings.get('keyBindings') || {};
    for (const action of Object.keys(ACTIONS)) {
      const base = DEFAULT_KEY_BINDINGS[action] ?? [];
      const ov = ACTIONS[action].rebindable ? overrides[action] : null;
      const slots = Array.isArray(ov) ? ov : base;
      this.bindings[action] = [slots[0] ?? null, slots[1] ?? null];
    }
  }

  _persistBindings() {
    const overrides = {};
    for (const action of Object.keys(ACTIONS)) {
      if (ACTIONS[action].rebindable) overrides[action] = [...this.bindings[action]];
    }
    this.settings.set('keyBindings', overrides);
  }

  /**
   * Assign a code to an action slot. The code is removed from any other action.
   * @param {string} action
   * @param {number} slot 0 or 1
   * @param {string|null} code
   */
  setBinding(action, slot, code) {
    if (!ACTIONS[action]?.rebindable) return;
    if (code) {
      for (const [other, slots] of Object.entries(this.bindings)) {
        if (!ACTIONS[other].rebindable) continue;
        for (let i = 0; i < slots.length; i++) if (slots[i] === code) slots[i] = null;
      }
    }
    this.bindings[action][slot] = code;
    this._persistBindings();
    this.bus.emit('input:bindingsChanged', { action, slot, code });
  }

  resetBindings() {
    this.settings.set('keyBindings', {});
    this.loadBindings();
    this.bus.emit('input:bindingsChanged', { action: '*' });
  }

  /**
   * Wait for the next key / mouse button and bind it. Escape cancels.
   * @param {string} action
   * @param {number} slot
   * @returns {Promise<string|null>}
   */
  startRebind(action, slot) {
    this.cancelRebind();
    return new Promise((resolve) => {
      this._rebind = { action, slot, resolve };
    });
  }

  cancelRebind() {
    if (this._rebind) {
      this._rebind.resolve(null);
      this._rebind = null;
    }
  }

  get isRebinding() {
    return this._rebind !== null;
  }

  _finishRebind(code) {
    const r = this._rebind;
    this._rebind = null;
    if (code === 'Escape') {
      r.resolve(null);
      return;
    }
    // Reserved codes cannot be taken by rebindable actions.
    const reserved = [...DEFAULT_KEY_BINDINGS.pause, ...DEFAULT_KEY_BINDINGS.debug];
    if (reserved.includes(code)) {
      r.resolve(null);
      return;
    }
    this.setBinding(r.action, r.slot, code);
    r.resolve(code);
  }

  // --------------------------------------------------------------- listeners

  _installListeners() {
    this._onKeyDown = (e) => {
      if (this._rebind) {
        e.preventDefault();
        this._finishRebind(e.code);
        return;
      }
      if (this._isTypingTarget(e.target)) return;
      if (PREVENT_DEFAULT_CODES.includes(e.code)) e.preventDefault();
      this.lastDevice = 'kbm';
      if (!e.repeat) {
        this._down.add(e.code);
        this._pressed.add(e.code);
      }
    };
    this._onKeyUp = (e) => {
      if (this._down.delete(e.code)) this._released.add(e.code);
    };
    this._onMouseDown = (e) => {
      const code = MOUSE_PREFIX + e.button;
      if (this._rebind) {
        e.preventDefault();
        this._finishRebind(code);
        return;
      }
      // Only count clicks on the game canvas (or anywhere while locked).
      if (!this.pointerLocked && e.target !== this.element) return;
      this.lastDevice = 'kbm';
      this._down.add(code);
      this._pressed.add(code);
    };
    this._onMouseUp = (e) => {
      const code = MOUSE_PREFIX + e.button;
      if (this._down.delete(code)) this._released.add(code);
    };
    this._onMouseMove = (e) => {
      if (!this.pointerLocked) return;
      // Guard against the occasional huge spike some browsers report on lock.
      const limit = 400;
      this.mouseDelta.x += Math.max(-limit, Math.min(limit, e.movementX || 0));
      this.mouseDelta.y += Math.max(-limit, Math.min(limit, e.movementY || 0));
      this.lastDevice = 'kbm';
    };
    this._onWheel = (e) => {
      if (this.pointerLocked) this.wheelDelta += Math.sign(e.deltaY);
    };
    this._onContextMenu = (e) => {
      if (e.target === this.element || this.pointerLocked) e.preventDefault();
    };
    this._onBlur = () => this.clearAll();
    this._onLockChange = () => {
      const locked = document.pointerLockElement === this.element;
      if (locked !== this.pointerLocked) {
        this.pointerLocked = locked;
        this.bus.emit('input:pointerLock', { locked });
      }
    };
    this._onPadConnected = (e) => {
      this._padIndex = e.gamepad.index;
      this.bus.emit('input:gamepad', { connected: true, id: e.gamepad.id });
    };
    this._onPadDisconnected = (e) => {
      if (e.gamepad.index === this._padIndex) this._padIndex = -1;
      this.bus.emit('input:gamepad', { connected: false, id: e.gamepad.id });
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('wheel', this._onWheel, { passive: true });
    window.addEventListener('contextmenu', this._onContextMenu);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('pointerlockchange', this._onLockChange);
    window.addEventListener('gamepadconnected', this._onPadConnected);
    window.addEventListener('gamepaddisconnected', this._onPadDisconnected);
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('contextmenu', this._onContextMenu);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    window.removeEventListener('gamepadconnected', this._onPadConnected);
    window.removeEventListener('gamepaddisconnected', this._onPadDisconnected);
  }

  /** @param {EventTarget|null} t */
  _isTypingTarget(t) {
    return t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  requestPointerLock() {
    if (this.pointerLocked) return;
    try {
      const p = this.element.requestPointerLock?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* pointer lock unavailable (e.g. headless); mouse look stays disabled */
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Release everything (focus lost, menus opened). */
  clearAll() {
    for (const c of this._down) this._released.add(c);
    this._down.clear();
    this.mouseDelta.x = this.mouseDelta.y = 0;
  }

  // ----------------------------------------------------------------- gamepad

  _pollGamepad() {
    this._padPrev = this._padDown;
    this._padDown = new Set();
    this._moveStick.x = this._moveStick.y = 0;
    this.lookStick.x = this.lookStick.y = 0;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = this._padIndex >= 0 ? pads[this._padIndex] : null;
    if (!pad) {
      for (const p of pads) {
        if (p && p.connected) {
          pad = p;
          this._padIndex = p.index;
          break;
        }
      }
    }
    if (!pad) return;

    let active = false;
    for (const [action, indices] of Object.entries(GAMEPAD.buttons)) {
      for (const i of indices) {
        const b = pad.buttons[i];
        if (!b) continue;
        const isDown = b.pressed || b.value > GAMEPAD.triggerThreshold;
        if (isDown) {
          this._padDown.add(action);
          active = true;
        }
      }
    }
    const dz = (v) => {
      const a = Math.abs(v);
      if (a < GAMEPAD.deadzone) return 0;
      return Math.sign(v) * ((a - GAMEPAD.deadzone) / (1 - GAMEPAD.deadzone));
    };
    const ax = GAMEPAD.axes;
    this._moveStick.x = dz(pad.axes[ax.moveX] ?? 0);
    this._moveStick.y = -dz(pad.axes[ax.moveY] ?? 0);
    this.lookStick.x = dz(pad.axes[ax.lookX] ?? 0);
    this.lookStick.y = dz(pad.axes[ax.lookY] ?? 0);
    if (active || this._moveStick.x || this._moveStick.y || this.lookStick.x || this.lookStick.y) {
      this.lastDevice = 'pad';
    }
  }

  // ------------------------------------------------------------------- frame

  /** Poll devices. Call once at the start of every rendered frame. */
  update() {
    this._pollGamepad();
  }

  /** Clear per-frame state. Call at the very end of each frame. */
  endFrame() {
    this._pressed.clear();
    this._released.clear();
    this.mouseDelta.x = this.mouseDelta.y = 0;
    this.wheelDelta = 0;
  }

  // ----------------------------------------------------------------- queries

  /** @param {string} action */
  _codes(action) {
    return this.bindings[action] ?? [];
  }

  /**
   * Is the action held? (UI actions like pause/debug ignore gameplayEnabled.)
   * @param {string} action
   */
  down(action) {
    if (!this._allowed(action)) return false;
    for (const c of this._codes(action)) if (c && this._down.has(c)) return true;
    return this._padDown.has(action);
  }

  /** @param {string} action */
  pressed(action) {
    if (!this._allowed(action)) return false;
    for (const c of this._codes(action)) if (c && this._pressed.has(c)) return true;
    return this._padDown.has(action) && !this._padPrev.has(action);
  }

  /** @param {string} action */
  released(action) {
    if (!this._allowed(action)) return false;
    for (const c of this._codes(action)) if (c && this._released.has(c)) return true;
    return !this._padDown.has(action) && this._padPrev.has(action);
  }

  /** @param {string} action */
  _allowed(action) {
    if (this._rebind) return false;
    return this.gameplayEnabled || action === 'pause' || action === 'debug';
  }

  /**
   * Movement intent: x = right, y = forward. Length ≤ 1.
   * `analog` is true when the value came from a stick (allows walk speeds).
   * @returns {{x:number, y:number, analog:boolean}}
   */
  moveAxis() {
    if (!this.gameplayEnabled) return { x: 0, y: 0, analog: false };
    let x = (this.down('moveRight') ? 1 : 0) - (this.down('moveLeft') ? 1 : 0);
    let y = (this.down('moveForward') ? 1 : 0) - (this.down('moveBack') ? 1 : 0);
    let analog = false;
    if (x === 0 && y === 0 && (this._moveStick.x || this._moveStick.y)) {
      x = this._moveStick.x;
      y = this._moveStick.y;
      analog = true;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y, analog };
  }

  /** @returns {string[]} codes currently held (debug display) */
  get heldCodes() {
    return [...this._down];
  }
}
