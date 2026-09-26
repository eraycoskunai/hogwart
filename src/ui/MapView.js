/**
 * @file MapView — the full-screen map (M). Tabs switch between the
 * grounds (baked terrain map) and the castle's floor plans. Markers: the
 * player (arrow), the current quest target, friends, the broom shop, race
 * starts, the pitch, discovered danger zones and fast-travel points
 * (discovered ones glow). The side list offers fast travel to discovered
 * places — the game checks it is allowed. Wheel zooms, drag pans.
 */
import { MAP } from '../data/ui.js';
import { toMap, bakeFloor, floorOf } from '../world/MapBaker.js';
import { RACES, SHOP } from '../data/flight.js';
import { PITCH } from '../data/grounds.js';

/** Zoom limits and wheel step. */
const ZOOM = Object.freeze({ min: 1, max: 6, step: 1.15 });
/** Redraw interval while open (s). */
const REDRAW = 0.25;

export class MapView {
  /**
   * @param {HTMLElement} root
   * @param {{onTravel:(region:string, name:string)=>void, onClose:()=>void}} o
   */
  constructor(root, o) {
    this.o = o;
    const el = document.createElement('div');
    el.className = 'mapview';
    el.innerHTML = `
      <div class="mv-panel parchment">
        <header><h2>Harita</h2><nav class="mv-tabs"></nav><button class="mv-close" data-mv="close">Kapat (M / Esc)</button></header>
        <div class="mv-body">
          <div class="mv-canvas-wrap"><canvas class="mv-canvas"></canvas><div class="mv-legend">Tekerlek: yakınlaş · sürükle: kaydır · keşfettiğin yerlere hızlı yolculuk yapabilirsin</div></div>
          <aside class="mv-side"><h3>Hızlı yolculuk</h3><div class="mv-list"></div><div class="mv-msg"></div></aside>
        </div>
      </div>`;
    root.appendChild(el);
    this.el = el;
    this.canvas = /** @type {HTMLCanvasElement} */ (el.querySelector('.mv-canvas'));
    this.g = this.canvas.getContext('2d');
    this.tabs = el.querySelector('.mv-tabs');
    this.list = el.querySelector('.mv-list');
    this.msg = el.querySelector('.mv-msg');
    this.open = false;
    this.view = 'grounds';
    this.floor = 0;
    this.zoom = 1;
    this.pan = [0.5, 0.5];
    this.floors = new Map();
    this.grounds = null;
    this._t = 0;
    el.addEventListener('click', (e) => this._click(e));
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = Math.min(ZOOM.max, Math.max(ZOOM.min, this.zoom * (e.deltaY < 0 ? ZOOM.step : 1 / ZOOM.step)));
      this._draw();
    }, { passive: false });
    let drag = null;
    this.canvas.addEventListener('pointerdown', (e) => (drag = [e.clientX, e.clientY]));
    window.addEventListener('pointerup', () => (drag = null));
    this.canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const r = this.canvas.getBoundingClientRect();
      this.pan[0] -= (e.clientX - drag[0]) / r.width / this.zoom;
      this.pan[1] -= (e.clientY - drag[1]) / r.height / this.zoom;
      drag = [e.clientX, e.clientY];
      this._draw();
    });
  }

  /** Set the baked grounds image (when the grounds load). */
  setGrounds(canvas) {
    this.grounds = canvas;
  }

  /**
   * @param {any} s snapshot: {region, player:{x,y,z,yaw}, quest, friends, points, dangers, block}
   */
  show(s) {
    this.open = true;
    this.s = s;
    this.view = s.region === 'castle' ? 'castle' : 'grounds';
    if (this.view === 'castle') this.floor = floorOf(s.player.y).id;
    this.zoom = this.view === 'castle' ? 1.3 : 2.2;
    this._centerOn(s.player);
    this.el.classList.add('show');
    this._render();
  }

  close() {
    this.open = false;
    this.el.classList.remove('show');
  }

  /** Live update while open. */
  update(dt, s) {
    if (!this.open) return;
    this.s = s;
    this._t -= dt;
    if (this._t <= 0) {
      this._t = REDRAW;
      this._draw();
    }
  }

  _extent() {
    return this.view === 'castle' ? MAP.castleExtent : MAP.extent;
  }

  _centerOn(p) {
    const [u, v] = toMap(this._extent(), 1, p.x, p.z);
    this.pan = [u, v];
  }

  _render() {
    const tabs = [['grounds', 'Arazi'], ...MAP.floors.map((f) => [`floor:${f.id}`, `Şato · ${f.name}`])];
    const cur = this.view === 'castle' ? `floor:${this.floor}` : 'grounds';
    this.tabs.innerHTML = tabs.map(([id, l]) => `<button class="${cur === id ? 'active' : ''}" data-mv="tab" data-id="${id}">${l}</button>`).join('');
    const region = this.view;
    const pts = this.s.points[region] ?? [];
    const floorPts = region === 'castle' ? pts.filter((p) => floorOf(p.pos[1]).id === this.floor) : pts;
    this.list.innerHTML = floorPts.map((p) => `<button data-mv="travel" data-region="${region}" data-name="${p.name}" ${p.known ? '' : 'disabled'}>${p.known ? p.name : '??? (keşfedilmedi)'}</button>`).join('');
    this.msg.textContent = this.s.block ?? '';
    this._draw();
  }

  _click(e) {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-mv]');
    if (!b) return;
    const k = b.dataset.mv;
    if (k === 'close') this.o.onClose();
    else if (k === 'tab') {
      const id = b.dataset.id;
      const was = this.view;
      if (id === 'grounds') this.view = 'grounds';
      else {
        this.view = 'castle';
        this.floor = Number(id.split(':')[1]);
      }
      if (was !== this.view) {
        this.zoom = this.view === 'castle' ? 1.3 : 2.2;
        this.pan = [0.5, 0.5];
        if (this.s.region === this.view) this._centerOn(this.s.player);
      }
      this._render();
    } else if (k === 'travel') {
      if (this.s.block) {
        this.msg.textContent = this.s.block;
        return;
      }
      this.o.onTravel(b.dataset.region, b.dataset.name);
    }
  }

  // --------------------------------------------------------------- draw

  _draw() {
    const c = this.canvas;
    const r = c.getBoundingClientRect();
    const W = Math.max(64, Math.round(r.width));
    const H = Math.max(64, Math.round(r.height));
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const g = this.g;
    g.fillStyle = '#1a1612';
    g.fillRect(0, 0, W, H);
    const img = this.view === 'castle' ? this._floorImage(this.floor) : this.grounds;
    const S = Math.max(W, H) * this.zoom;
    const ox = W / 2 - this.pan[0] * S;
    const oy = H / 2 - this.pan[1] * S;
    if (img) {
      g.imageSmoothingEnabled = true;
      g.drawImage(img, ox, oy, S, S);
    }
    const E = this._extent();
    const P = (x, z) => {
      const [u, v] = toMap(E, 1, x, z);
      return [ox + u * S, oy + v * S];
    };
    const s = this.s;
    const here = s.region === this.view;
    const onFloor = (y) => this.view !== 'castle' || y == null || floorOf(y).id === this.floor;
    const C = MAP.colors;
    const dot = (x, z, color, r2, label, shape = 'circle') => {
      const [px, py] = P(x, z);
      g.fillStyle = color;
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      g.lineWidth = 1.5;
      g.beginPath();
      if (shape === 'diamond') {
        g.moveTo(px, py - r2);
        g.lineTo(px + r2, py);
        g.lineTo(px, py + r2);
        g.lineTo(px - r2, py);
        g.closePath();
      } else g.arc(px, py, r2, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      if (label) {
        g.font = '12px Georgia, serif';
        g.textAlign = 'left';
        g.fillStyle = '#f4ecd8';
        g.strokeStyle = 'rgba(0,0,0,0.8)';
        g.lineWidth = 3;
        g.strokeText(label, px + r2 + 3, py + 4);
        g.fillText(label, px + r2 + 3, py + 4);
      }
    };
    // Region features.
    if (this.view === 'grounds') {
      for (const d of s.dangers.grounds ?? []) dot(d.center[0], d.center[1], C.danger, 7, d.name);
      for (const R of RACES) dot(R.start[0], R.start[1], C.race, 4);
      dot(SHOP.pos[0], SHOP.pos[1], C.shop, 6, SHOP.name);
      dot(PITCH.center[0], PITCH.center[1], C.race, 5, 'Quidditch sahası');
    } else {
      for (const d of s.dangers.castle ?? []) if (onFloor(d.y)) dot(d.center[0], d.center[1], C.danger, 6, d.name);
    }
    for (const p of s.points[this.view] ?? []) {
      if (!onFloor(p.pos[1])) continue;
      dot(p.pos[0], p.pos[2], p.known ? C.travel : C.travelLocked, p.known ? 5 : 3, p.known && this.zoom > 1.6 ? p.name : '');
    }
    for (const f of s.friends) if (f.region === this.view && onFloor(f.y)) dot(f.x, f.z, f.color, 4, f.name);
    const q = s.quest;
    if (q?.target && q.target.region === this.view && onFloor(q.target.pos[1])) dot(q.target.pos[0], q.target.pos[2], C.quest, 8, q.text, 'diamond');
    // The player: an arrow pointing where they face.
    if (here && onFloor(s.player.y)) {
      const [px, py] = P(s.player.x, s.player.z);
      g.save();
      g.translate(px, py);
      g.rotate(-s.player.yaw + Math.PI);
      g.fillStyle = C.player;
      g.strokeStyle = '#000';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, 10);
      g.lineTo(6, -7);
      g.lineTo(0, -3);
      g.lineTo(-6, -7);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
  }

  _floorImage(id) {
    let img = this.floors.get(id);
    if (!img) {
      img = bakeFloor(MAP.floors.find((f) => f.id === id));
      this.floors.set(id, img);
    }
    return img;
  }

  dispose() {
    this.el.remove();
  }
}
