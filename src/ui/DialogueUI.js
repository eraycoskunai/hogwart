/**
 * @file DialogueUI — the conversation panel: speaker name and house
 * colour, friendship level with a progress bar, typewriter text, and
 * numbered reply buttons. Promise based: `say()` resolves when the player
 * continues (click, Space, Enter, E), `ask()` resolves with the chosen id
 * (keys 1–9 or click) or null (Esc). Esc during `say()` resolves 'end'.
 */

/** Characters typed per second, and the typing sound-free "tick". */
const TYPE_RATE = 55;

export class DialogueUI {
  /** @param {HTMLElement} root */
  constructor(root) {
    const el = document.createElement('div');
    el.className = 'dialogue';
    el.innerHTML = `
      <div class="dl-head"><b class="dl-name"></b><span class="dl-level"></span><div class="dl-meter"><i></i></div></div>
      <div class="dl-text"></div>
      <div class="dl-choices"></div>
      <div class="dl-hint">Boşluk / tık: devam · Esc: ayrıl</div>`;
    root.appendChild(el);
    const q = (s) => /** @type {HTMLElement} */ (el.querySelector(s));
    this.el = { root: el, name: q('.dl-name'), level: q('.dl-level'), meter: q('.dl-meter i'), text: q('.dl-text'), choices: q('.dl-choices'), hint: q('.dl-hint') };
    this.isOpen = false;
    this._full = '';
    this._shown = 0;
    this._resolve = null;
    this._options = null;
    this._onKey = (e) => this._key(e);
    el.addEventListener('click', (e) => {
      if (/** @type {HTMLElement} */ (e.target).closest('button')) return;
      this._advance();
    });
  }

  /**
   * @param {{name:string, color:string, level:string, progress:number}} who
   */
  open(who) {
    this.isOpen = true;
    this.el.root.classList.add('show');
    this.el.root.style.setProperty('--house', who.color);
    this.setSpeaker(who);
    window.addEventListener('keydown', this._onKey);
  }

  setSpeaker(who) {
    this.el.name.textContent = who.name;
    this.el.level.textContent = who.level ?? '';
    this.el.meter.parentElement.style.display = who.level ? '' : 'none';
    this.el.meter.style.transform = `scaleX(${who.progress ?? 0})`;
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.root.classList.remove('show');
    window.removeEventListener('keydown', this._onKey);
    const r = this._resolve;
    this._resolve = null;
    r?.(null);
  }

  /** Show a line; resolves true when continued, 'end' on Esc. */
  say(text) {
    this._setText(text);
    this._options = null;
    this.el.choices.innerHTML = '';
    this.el.hint.style.display = '';
    return new Promise((r) => (this._resolve = r));
  }

  /**
   * Ask with reply options.
   * @param {string} text
   * @param {{id:string, label:string, disabled?:boolean, note?:string}[]} options
   * @returns {Promise<string|null>}
   */
  ask(text, options) {
    this._setText(text);
    this._options = options;
    this.el.hint.style.display = 'none';
    const box = this.el.choices;
    box.innerHTML = '';
    options.forEach((o, i) => {
      const b = document.createElement('button');
      b.textContent = `${i + 1}. ${o.label}${o.note ? ` — ${o.note}` : ''}`;
      b.disabled = !!o.disabled;
      b.addEventListener('click', () => this._pick(o));
      box.appendChild(b);
    });
    return new Promise((r) => (this._resolve = r));
  }

  _setText(text) {
    this._full = text;
    this._shown = 0;
    this.el.text.textContent = '';
  }

  _pick(o) {
    if (!o || o.disabled) return;
    const r = this._resolve;
    this._resolve = null;
    this._options = null;
    this.el.choices.innerHTML = '';
    r?.(o.id);
  }

  _advance() {
    if (this._shown < this._full.length) {
      this._shown = this._full.length;
      this.el.text.textContent = this._full;
      return;
    }
    if (this._options) return;
    const r = this._resolve;
    this._resolve = null;
    r?.(true);
  }

  _key(e) {
    if (!this.isOpen) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      const r = this._resolve;
      this._resolve = null;
      r?.(this._options ? null : 'end');
      return;
    }
    if (this._options) {
      const n = Number(e.key);
      if (n >= 1 && n <= this._options.length) {
        // Finish typing first so the question is readable.
        this._shown = this._full.length;
        this.el.text.textContent = this._full;
        this._pick(this._options[n - 1]);
      }
      return;
    }
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') {
      e.preventDefault();
      this._advance();
    }
  }

  /** Typewriter. @param {number} dt */
  update(dt) {
    if (!this.isOpen || this._shown >= this._full.length) return;
    this._shown = Math.min(this._full.length, this._shown + TYPE_RATE * dt);
    this.el.text.textContent = this._full.slice(0, Math.floor(this._shown));
  }

  /** Is the line still being typed? */
  get typing() {
    return this._shown < this._full.length;
  }

  dispose() {
    this.close();
    this.el.root.remove();
  }
}
