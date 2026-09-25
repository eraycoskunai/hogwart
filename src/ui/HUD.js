/**
 * @file HUD — in-game overlay: health bar with damage trail, crosshair,
 * lock-on reticle, toasts, notices, damage vignette, fade, letterbox,
 * death message and the controls help panel. Pure DOM, driven by EventBus.
 */
import { ACTIONS, describeCode } from '../data/input.js';

export const HUD_TIMING = Object.freeze({
  toastDuration: 5.5,
  /** Subtitles: base seconds + seconds per character. */
  sayBase: 2.2,
  sayPerChar: 0.055,
  noticeDuration: 2.2,
  trailDelay: 0.45,
  trailRate: 0.9,
  vignetteDecay: 1.6,
  fadeRate: 2.2,
});

const HELP_ACTIONS = [
  'moveForward', 'moveBack', 'moveLeft', 'moveRight', 'jump', 'sprint', 'walk', 'crouch',
  'cast', 'spellWheel', 'gesture', 'aim', 'lockOn', 'shoulderSwap', 'interact', 'quickSave', 'quickLoad', 'help', 'pause', 'debug',
];

export class HUD {
  /**
   * @param {HTMLElement} root
   * @param {import('../core/EventBus.js').EventBus} bus
   * @param {import('../core/Input.js').Input} input
   */
  constructor(root, bus, input) {
    this.root = root;
    this.bus = bus;
    this.input = input;
    root.innerHTML = `
      <div class="hud-vignette"></div>
      <div class="hud-letterbox top"></div><div class="hud-letterbox bottom"></div>
      <div class="hud-health">
        <div class="hud-health-label"><span>Can</span><span class="hud-health-num">100</span></div>
        <div class="hud-health-bar"><div class="hud-health-trail"></div><div class="hud-health-fill"></div></div>
      </div>
      <div class="hud-crosshair"><i></i><i></i><i></i><i></i><b></b></div>
      <div class="hud-lock"><span></span></div>
      <div class="hud-toasts"></div>
      <div class="hud-notice"></div>
      <div class="hud-prompt"></div>
      <div class="hud-say"><b></b><span></span></div>
      <div class="hud-choice"><h3></h3><p></p><div class="hud-choice-options"></div></div>
      <div class="hud-center"><h2></h2><p></p></div>
      <div class="hud-help"></div>
      <div class="hud-clock"></div>
      <div class="hud-hint">H: kontroller · F3: hata ayıklama · Esc: menü</div>
      <div class="hud-fade"></div>`;
    const q = (s) => /** @type {HTMLElement} */ (root.querySelector(s));
    this.el = {
      vignette: q('.hud-vignette'),
      lbTop: q('.hud-letterbox.top'),
      lbBottom: q('.hud-letterbox.bottom'),
      healthNum: q('.hud-health-num'),
      healthFill: q('.hud-health-fill'),
      healthTrail: q('.hud-health-trail'),
      health: q('.hud-health'),
      crosshair: q('.hud-crosshair'),
      lock: q('.hud-lock'),
      lockName: q('.hud-lock span'),
      toasts: q('.hud-toasts'),
      notice: q('.hud-notice'),
      prompt: q('.hud-prompt'),
      center: q('.hud-center'),
      centerTitle: q('.hud-center h2'),
      centerText: q('.hud-center p'),
      help: q('.hud-help'),
      clock: q('.hud-clock'),
      fade: q('.hud-fade'),
      say: q('.hud-say'),
      sayName: q('.hud-say b'),
      sayText: q('.hud-say span'),
      choice: q('.hud-choice'),
      choiceTitle: q('.hud-choice h3'),
      choiceText: q('.hud-choice p'),
      choiceOptions: q('.hud-choice-options'),
    };
    this._sayTimer = 0;

    this._health = 1;
    this._trail = 1;
    this._trailTimer = 0;
    this._vignette = 0;
    this._fade = 0;
    this._fadeTarget = 0;
    this._noticeTimer = 0;
    this._lastToast = '';
    this.helpVisible = false;

    bus.on('player:damaged', ({ amount, health, max }) => {
      this.setHealth(health, max);
      this._vignette = Math.min(1, this._vignette + 0.35 + amount / max);
    });
    bus.on('player:healed', ({ health, max }) => this.setHealth(health, max));
    bus.on('player:died', ({ cause }) => {
      const causes = { fall: 'Çok yüksekten düştün.', void: 'Boşluğa düştün.' };
      this.showCenter('Bayıldın', causes[cause] ?? 'Madam Pomfrey seni ayıltacak…');
      this._fadeTarget = 1;
    });
    bus.on('player:respawned', () => {
      this.hideCenter();
      this._fadeTarget = 0;
      this.setHealth(1, 1);
    });
    bus.on('camera:lock', ({ target }) => {
      this.el.lockName.textContent = target ? target.name : '';
    });
    bus.on('input:bindingsChanged', () => this._renderHelp());
    this._renderHelp();
  }

  // ------------------------------------------------------------- widgets

  /** @param {number} health @param {number} max */
  setHealth(health, max) {
    const t = Math.max(0, Math.min(1, health / max));
    if (t < this._health) this._trailTimer = HUD_TIMING.trailDelay;
    else this._trail = Math.max(this._trail, t);
    this._health = t;
    this.el.healthNum.textContent = String(Math.ceil(health));
    this.el.healthFill.style.transform = `scaleX(${t})`;
    this.el.health.classList.toggle('low', t < 0.3);
  }

  /**
   * @param {string} text
   * @param {number} [duration]
   */
  toast(text, duration = HUD_TIMING.toastDuration) {
    if (!text || text === this._lastToast) return;
    this._lastToast = text;
    const div = document.createElement('div');
    div.className = 'hud-toast';
    div.textContent = text;
    this.el.toasts.appendChild(div);
    requestAnimationFrame(() => div.classList.add('show'));
    setTimeout(() => {
      div.classList.remove('show');
      setTimeout(() => div.remove(), 500);
      if (this._lastToast === text) this._lastToast = '';
    }, duration * 1000);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstElementChild.remove();
  }

  /** Small bottom-right notice (saves, settings). @param {string} text */
  notice(text) {
    this.el.notice.textContent = text;
    this.el.notice.classList.add('show');
    this._noticeTimer = HUD_TIMING.noticeDuration;
  }

  /** Date · time · weather line (top right). @param {string} text */
  setClock(text) {
    if (text !== this._clockText) {
      this._clockText = text;
      this.el.clock.textContent = text;
    }
  }

  /** @param {string} text empty hides */
  prompt(text) {
    this.el.prompt.textContent = text;
    this.el.prompt.classList.toggle('show', !!text);
  }

  /**
   * Subtitle line spoken by a character (portraits, ghosts).
   * @param {string} speaker
   * @param {string} text
   */
  say(speaker, text) {
    this.el.sayName.textContent = speaker;
    this.el.sayText.textContent = text;
    this.el.say.classList.add('show');
    this._sayTimer = HUD_TIMING.sayBase + text.length * HUD_TIMING.sayPerChar;
  }

  /**
   * Show a choice panel.
   * @param {string} title
   * @param {string} text
   * @param {{id:string, label:string}[]} options
   * @param {(id:string|null) => void} onPick
   */
  showChoice(title, text, options, onPick) {
    this.el.choiceTitle.textContent = title;
    this.el.choiceText.textContent = text;
    const box = this.el.choiceOptions;
    box.innerHTML = '';
    options.forEach((o, i) => {
      const b = document.createElement('button');
      b.textContent = `${i + 1}. ${o.label}`;
      b.addEventListener('click', () => onPick(o.id));
      box.appendChild(b);
    });
    const cancel = document.createElement('button');
    cancel.textContent = 'Vazgeç (Esc)';
    cancel.addEventListener('click', () => onPick(null));
    box.appendChild(cancel);
    this.el.choice.classList.add('show');
  }

  hideChoice() {
    this.el.choice.classList.remove('show');
  }

  showCenter(title, text) {
    this.el.centerTitle.textContent = title;
    this.el.centerText.textContent = text;
    this.el.center.classList.add('show');
  }

  hideCenter() {
    this.el.center.classList.remove('show');
  }

  /** @param {number} target 0 transparent … 1 black */
  fadeTo(target) {
    this._fadeTarget = target;
  }

  toggleHelp(force) {
    this.helpVisible = force ?? !this.helpVisible;
    this.el.help.classList.toggle('show', this.helpVisible);
  }

  _renderHelp() {
    const rows = HELP_ACTIONS.map((a) => {
      const keys = (this.input.bindings[a] ?? []).filter(Boolean).map(describeCode).join(' / ') || '—';
      return `<tr><td>${ACTIONS[a].label}</td><td><kbd>${keys}</kbd></td></tr>`;
    }).join('');
    this.el.help.innerHTML = `<h3>Kontroller</h3><table>${rows}</table>
      <p class="pad">Gamepad: sol çubuk hareket · sağ çubuk kamera · A zıpla · B çömel · RT büyü · LB tekerlek · RB jest · LT nişan · R3 kilitlen · L3 depar</p>`;
  }

  setVisible(v) {
    this.root.classList.toggle('hidden', !v);
  }

  // ---------------------------------------------------------------- frame

  /**
   * @param {number} dt real seconds
   * @param {{aiming:boolean, lockScreen:{x:number,y:number}|null, letterbox:number, showHealth:boolean}} s
   */
  update(dt, s) {
    if (this._trailTimer > 0) this._trailTimer -= dt;
    else if (this._trail > this._health) this._trail = Math.max(this._health, this._trail - HUD_TIMING.trailRate * dt);
    this.el.healthTrail.style.transform = `scaleX(${this._trail})`;

    this._vignette = Math.max(0, this._vignette - HUD_TIMING.vignetteDecay * dt);
    const lowPulse = this._health < 0.3 && this._health > 0 ? 0.25 + Math.sin(performance.now() / 260) * 0.1 : 0;
    this.el.vignette.style.opacity = String(Math.min(1, this._vignette + lowPulse));

    const fd = this._fadeTarget - this._fade;
    this._fade += Math.sign(fd) * Math.min(Math.abs(fd), HUD_TIMING.fadeRate * dt);
    this.el.fade.style.opacity = String(this._fade);

    this.el.crosshair.classList.toggle('show', s.aiming);
    if (s.lockScreen) {
      this.el.lock.classList.add('show');
      this.el.lock.style.transform = `translate(${s.lockScreen.x}px, ${s.lockScreen.y}px)`;
    } else this.el.lock.classList.remove('show');

    const lb = `${(s.letterbox * 100).toFixed(2)}vh`;
    this.el.lbTop.style.height = lb;
    this.el.lbBottom.style.height = lb;
    this.el.health.classList.toggle('hidden', !s.showHealth);

    if (this._sayTimer > 0) {
      this._sayTimer -= dt;
      if (this._sayTimer <= 0) this.el.say.classList.remove('show');
    }
    if (this._noticeTimer > 0) {
      this._noticeTimer -= dt;
      if (this._noticeTimer <= 0) this.el.notice.classList.remove('show');
    }
  }
}
