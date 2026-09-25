/**
 * @file SpellHUD — magic overlay: focus bar, the selected spell (name,
 * description, cooldown sweep, mastery pips), the radial spell wheel, the
 * gesture drawing canvas with the recognizer's verdict, floating damage
 * numbers and combo / level-up banners. Pure DOM, fed by the caster each
 * frame and by EventBus events.
 */
import { SPELLS, SPELL_WHEEL, FOCUS, MASTERY } from '../data/spells.js';

export const SPELL_HUD = Object.freeze({
  wheelRadius: 150,
  gestureSize: 320,
  numberLife: 1.1,
  bannerLife: 2,
});

export class SpellHUD {
  /**
   * @param {HTMLElement} root the HUD root
   * @param {import('../core/EventBus.js').EventBus} bus
   */
  constructor(root, bus) {
    const el = document.createElement('div');
    el.className = 'spell-hud';
    el.innerHTML = `
      <div class="sp-focus"><span>Odak</span><div class="sp-focus-bar"><i></i></div></div>
      <div class="sp-current"><div class="sp-cd"></div><b></b><small></small><div class="sp-pips"></div></div>
      <div class="sp-wheel"><div class="sp-wheel-center"><b></b><small></small></div></div>
      <canvas class="sp-gesture"></canvas>
      <div class="sp-gesture-result"></div>
      <div class="sp-banner"></div>
      <div class="sp-numbers"></div>`;
    root.appendChild(el);
    const q = (s) => /** @type {HTMLElement} */ (el.querySelector(s));
    this.el = {
      root: el,
      focus: q('.sp-focus-bar i'),
      current: q('.sp-current'),
      cd: q('.sp-cd'),
      name: q('.sp-current b'),
      desc: q('.sp-current small'),
      pips: q('.sp-pips'),
      wheel: q('.sp-wheel'),
      wheelName: q('.sp-wheel-center b'),
      wheelDesc: q('.sp-wheel-center small'),
      gesture: /** @type {HTMLCanvasElement} */ (q('.sp-gesture')),
      gestureResult: q('.sp-gesture-result'),
      banner: q('.sp-banner'),
      numbers: q('.sp-numbers'),
    };
    const G = SPELL_HUD.gestureSize;
    this.el.gesture.width = G;
    this.el.gesture.height = G;
    this.g = this.el.gesture.getContext('2d');
    // Wheel slots.
    this.slots = new Map();
    SPELL_WHEEL.forEach((id, i) => {
      const a = (i / SPELL_WHEEL.length) * Math.PI * 2;
      const b = document.createElement('div');
      b.className = 'sp-slot';
      b.textContent = SPELLS[id].name.split(' ')[0];
      b.style.transform = `translate(${Math.sin(a) * SPELL_HUD.wheelRadius}px, ${-Math.cos(a) * SPELL_HUD.wheelRadius}px) translate(-50%, -50%)`;
      b.style.setProperty('--c', SPELLS[id].color);
      this.el.wheel.appendChild(b);
      this.slots.set(id, b);
    });
    this._banner = 0;
    this._gestureShow = 0;
    this._shown = '';
    this.numbers = [];
    bus.on('spell:combo', ({ name }) => this.banner(`KOMBO · ${name}`, 'combo'));
    bus.on('spell:levelUp', ({ id, level }) => this.banner(`${SPELLS[id].name} ustalığı ${level}. seviye`, 'level'));
    bus.on('spell:blocked', ({ parry }) => parry && this.banner('Savuşturma!', 'parry'));
  }

  banner(text, kind) {
    const b = this.el.banner;
    b.textContent = text;
    b.dataset.kind = kind;
    b.classList.add('show');
    this._banner = SPELL_HUD.bannerLife;
  }

  /** Floating damage number at a screen position. */
  number(x, y, text, color) {
    const d = document.createElement('div');
    d.className = 'sp-number';
    d.textContent = text;
    d.style.color = color;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    this.el.numbers.appendChild(d);
    this.numbers.push({ el: d, t: 0, x, y });
  }

  setVisible(v) {
    this.el.root.classList.toggle('hidden', !v);
  }

  /**
   * @param {number} dt
   * @param {import('../gameplay/spells/SpellCaster.js').SpellCaster} c
   */
  update(dt, c) {
    const E = this.el;
    E.focus.style.transform = `scaleX(${c.focus / FOCUS.max})`;
    E.focus.parentElement.classList.toggle('low', c.focus < 20);
    // Current spell.
    const id = c.selected;
    const s = SPELLS[id];
    const lv = c.level(id);
    const key = `${id}:${lv}`;
    if (key !== this._shown) {
      this._shown = key;
      E.name.textContent = s.name;
      E.desc.textContent = s.label;
      E.current.style.setProperty('--c', s.color);
      E.pips.innerHTML = MASTERY.levels.map((_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
    }
    const cd = c.cooldownFraction(id);
    E.cd.style.setProperty('--p', `${Math.round(cd * 360)}deg`);
    E.current.classList.toggle('cooling', cd > 0);
    E.current.classList.toggle('poor', c.focus < c.cost(id));
    // Wheel.
    E.wheel.classList.toggle('show', c.wheel.open);
    if (c.wheel.open) {
      const h = c.wheel.hover ?? c.selected;
      for (const [sid, b] of this.slots) {
        b.classList.toggle('hover', sid === h);
        b.classList.toggle('cooling', c.cooldownFraction(sid) > 0);
      }
      E.wheelName.textContent = SPELLS[h].name;
      E.wheelDesc.textContent = `${SPELLS[h].label} · Odak ${Math.round(c.cost(h))} · Usta ${c.level(h)}`;
    }
    // Gesture canvas.
    const g = c.gesture;
    if (g.active || g.result) {
      if (g.result && !g.active && this._gestureShow <= 0) this._gestureShow = 1.2;
      this._drawGesture(g);
    }
    if (!g.active && this._gestureShow > 0) {
      this._gestureShow -= dt;
      if (this._gestureShow <= 0) {
        g.result = null;
        E.gesture.classList.remove('show');
        E.gestureResult.classList.remove('show');
      }
    }
    // Banner.
    if (this._banner > 0) {
      this._banner -= dt;
      if (this._banner <= 0) E.banner.classList.remove('show');
    }
    // Damage numbers.
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.t += dt;
      const k = n.t / SPELL_HUD.numberLife;
      n.el.style.transform = `translate(-50%, ${-40 * k}px) scale(${1 + (1 - k) * 0.4})`;
      n.el.style.opacity = String(1 - k * k);
      if (k >= 1) {
        n.el.remove();
        this.numbers.splice(i, 1);
      }
    }
  }

  _drawGesture(g) {
    const E = this.el;
    const S = SPELL_HUD.gestureSize;
    const ctx = this.g;
    E.gesture.classList.add('show');
    ctx.clearRect(0, 0, S, S);
    const pts = g.points;
    if (pts.length > 1) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      const span = Math.max(maxX - minX, maxY - minY, 120);
      const k = (S * 0.8) / span;
      const ox = S / 2 - ((minX + maxX) / 2) * k;
      const oy = S / 2 - ((minY + maxY) / 2) * k;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const ok = g.result ? g.result.ok : null;
      ctx.strokeStyle = ok === false ? 'rgba(255,120,110,0.9)' : ok ? 'rgba(160,230,255,0.95)' : 'rgba(255,236,190,0.95)';
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 14;
      ctx.lineWidth = 5;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x * k + ox, p.y * k + oy) : ctx.moveTo(p.x * k + ox, p.y * k + oy)));
      ctx.stroke();
    }
    if (g.result) {
      E.gestureResult.textContent = g.result.text;
      E.gestureResult.classList.toggle('bad', !g.result.ok);
      E.gestureResult.classList.add('show');
    } else E.gestureResult.classList.remove('show');
  }
}
