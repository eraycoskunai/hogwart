/**
 * @file Minimap — a round map in the corner (north up): a crop of the
 * baked grounds map around the player outdoors, or the current floor plan
 * inside the castle; the player arrow, friends, the quest target (pinned
 * to the rim when out of range) and N / E / S / W letters.
 */
import { MAP, MINIMAP } from '../data/ui.js';
import { toMap, bakeFloor, floorOf } from '../world/MapBaker.js';

export class Minimap {
  /** @param {HTMLElement} root */
  constructor(root) {
    const el = document.createElement('div');
    el.className = 'minimap';
    el.innerHTML = '<canvas></canvas><span class="mm-n">K</span><span class="mm-e">D</span><span class="mm-s">G</span><span class="mm-w">B</span>';
    root.appendChild(el);
    this.el = el;
    this.canvas = /** @type {HTMLCanvasElement} */ (el.querySelector('canvas'));
    const S = MINIMAP.size;
    this.canvas.width = this.canvas.height = S;
    this.g = this.canvas.getContext('2d');
    this.grounds = null;
    this.floors = new Map();
    this.visible = true;
  }

  setGrounds(canvas) {
    this.grounds = canvas;
  }

  setVisible(v) {
    this.visible = v;
    this.el.style.display = v ? '' : 'none';
  }

  /**
   * @param {{region:string, player:{x:number,y:number,z:number,yaw:number}, quest:any, friends:any[], hidden:boolean}} s
   */
  update(s) {
    if (!this.visible) return;
    const outdoor = s.region === 'grounds';
    const castle = s.region === 'castle';
    this.el.classList.toggle('show', !s.hidden && (outdoor || castle));
    if (s.hidden || !(outdoor || castle)) return;
    const g = this.g;
    const S = MINIMAP.size;
    const R = S / 2;
    const p = s.player;
    const range = outdoor ? MINIMAP.range : MINIMAP.castleRange;
    const E = outdoor ? MAP.extent : MAP.castleExtent;
    let img = outdoor ? this.grounds : null;
    if (castle) {
      const f = floorOf(p.y);
      img = this.floors.get(f.id);
      if (!img) {
        img = bakeFloor(f);
        this.floors.set(f.id, img);
      }
    }
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath();
    g.arc(R, R, R - 1, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#1a1612';
    g.fillRect(0, 0, S, S);
    // World metres → canvas pixels.
    const worldW = E[2] - E[0];
    const k = S / (2 * range);
    if (img) {
      const [u, v] = toMap(E, img.width, p.x, p.z);
      const src = (2 * range * img.width) / worldW;
      g.drawImage(img, u - src / 2, v - src / 2, src, src, 0, 0, S, S);
    }
    const W = (x, z) => [R + (x - p.x) * k, R + (z - p.z) * k];
    for (const f of s.friends) {
      if (f.region !== s.region) continue;
      const [x, y] = W(f.x, f.z);
      g.fillStyle = f.color;
      g.beginPath();
      g.arc(x, y, 3.5, 0, Math.PI * 2);
      g.fill();
    }
    // Quest target (clamped to the rim).
    const T = s.quest?.target;
    if (T && T.region === s.region) {
      let [x, y] = W(T.pos[0], T.pos[2]);
      const dx = x - R;
      const dy = y - R;
      const d = Math.hypot(dx, dy);
      if (d > R - 8) {
        x = R + (dx / d) * (R - 8);
        y = R + (dy / d) * (R - 8);
      }
      g.fillStyle = MAP.colors.quest;
      g.strokeStyle = '#000';
      g.beginPath();
      g.moveTo(x, y - 6);
      g.lineTo(x + 6, y);
      g.lineTo(x, y + 6);
      g.lineTo(x - 6, y);
      g.closePath();
      g.fill();
      g.stroke();
    }
    // Player arrow.
    g.translate(R, R);
    g.rotate(-p.yaw + Math.PI);
    g.fillStyle = MAP.colors.player;
    g.strokeStyle = '#000';
    g.beginPath();
    g.moveTo(0, 8);
    g.lineTo(5, -6);
    g.lineTo(0, -3);
    g.lineTo(-5, -6);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  dispose() {
    this.el.remove();
  }
}
