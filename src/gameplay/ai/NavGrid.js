/**
 * @file NavGrid — grid-based navigation for an encounter zone. The grid is
 * sampled from the physics world (a downward ray per cell finds the floor,
 * a capsule test checks head-room against walls, trees and furniture) in
 * small batches so building never stalls a frame. Paths come from A*
 * (8-neighbour, octile heuristic, no corner cutting) and are smoothed by
 * line-of-walk checks. It also finds cover from a threat and random
 * reachable points for patrols.
 */
import * as THREE from 'three';
import { NAV } from '../../data/combat.js';

const DOWN = new THREE.Vector3(0, -1, 0);
const SQ2 = Math.SQRT2;
const _o = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _hit = { distance: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), collider: null };
const STATIC_ONLY = { dynamic: false, kinematic: false };

/** Minimal binary heap keyed by a Float32Array of scores. */
class Heap {
  constructor(score) {
    this.items = [];
    this.score = score;
  }

  push(i) {
    const a = this.items;
    a.push(i);
    let k = a.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (this.score[a[p]] <= this.score[a[k]]) break;
      [a[p], a[k]] = [a[k], a[p]];
      k = p;
    }
  }

  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1;
        const r = l + 1;
        let m = k;
        if (l < a.length && this.score[a[l]] < this.score[a[m]]) m = l;
        if (r < a.length && this.score[a[r]] < this.score[a[m]]) m = r;
        if (m === k) break;
        [a[m], a[k]] = [a[k], a[m]];
        k = m;
      }
    }
    return top;
  }

  get size() {
    return this.items.length;
  }
}

export class NavGrid {
  /**
   * @param {any} physics
   * @param {{center:number[], half:number, cell?:number, top:number, bottom:number}} o
   */
  constructor(physics, o) {
    this.physics = physics;
    this.cell = o.cell ?? NAV.cell;
    this.n = Math.ceil((o.half * 2) / this.cell);
    this.x0 = o.center[0] - o.half;
    this.z0 = o.center[1] - o.half;
    this.top = o.top;
    this.bottom = o.bottom;
    const N = this.n * this.n;
    this.height = new Float32Array(N);
    this.walk = new Uint8Array(N);
    this.g = new Float32Array(N);
    this.f = new Float32Array(N);
    this.parent = new Int32Array(N);
    this.stamp = new Uint32Array(N);
    this.closed = new Uint32Array(N);
    this._search = 0;
    this.ready = false;
    this._next = 0;
  }

  /** Sample `count` more cells; returns true when the grid is complete. */
  buildStep(count = NAV.cellsPerFrame) {
    const N = this.n * this.n;
    const W = this.physics.collision;
    const r = NAV.clearanceRadius;
    const end = Math.min(N, this._next + count);
    for (let k = this._next; k < end; k++) {
      const i = k % this.n;
      const j = Math.floor(k / this.n);
      const x = this.x0 + (i + 0.5) * this.cell;
      const z = this.z0 + (j + 0.5) * this.cell;
      _o.set(x, this.top, z);
      const hit = this.physics.raycast(_o, DOWN, this.top - this.bottom, STATIC_ONLY, _hit);
      if (!hit || hit.normal.y < NAV.maxSlope) continue;
      const y = hit.point.y;
      this.height[k] = y;
      _a.set(x, y + r + 0.12, z);
      _b.set(x, y + NAV.clearanceHeight - r, z);
      const contacts = W.capsuleContacts(_a, _b, r, STATIC_ONLY);
      let blocked = false;
      for (const c of contacts) {
        if (c.normal.y < NAV.maxSlope) {
          blocked = true;
          break;
        }
      }
      if (!blocked) this.walk[k] = 1;
    }
    this._next = end;
    if (end >= N) this.ready = true;
    return this.ready;
  }

  // ------------------------------------------------------------ queries

  index(i, j) {
    return j * this.n + i;
  }

  cellOf(x, z) {
    return [Math.floor((x - this.x0) / this.cell), Math.floor((z - this.z0) / this.cell)];
  }

  inside(i, j) {
    return i >= 0 && j >= 0 && i < this.n && j < this.n;
  }

  walkable(i, j) {
    return this.inside(i, j) && this.walk[this.index(i, j)] === 1;
  }

  /** World point at a cell's floor. */
  point(i, j, out = new THREE.Vector3()) {
    return out.set(this.x0 + (i + 0.5) * this.cell, this.height[this.index(i, j)], this.z0 + (j + 0.5) * this.cell);
  }

  /** Nearest walkable cell to (x, z) within `maxR` cells. */
  nearest(x, z, maxR = 6) {
    const [ci, cj] = this.cellOf(x, z);
    if (this.walkable(ci, cj)) return [ci, cj];
    for (let r = 1; r <= maxR; r++) {
      let best = null;
      let bestD = Infinity;
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          if (!this.walkable(ci + di, cj + dj)) continue;
          const d = di * di + dj * dj;
          if (d < bestD) {
            bestD = d;
            best = [ci + di, cj + dj];
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  _canStep(a, b) {
    return Math.abs(this.height[a] - this.height[b]) <= NAV.stepHeight;
  }

  /**
   * A* from world point to world point.
   * @returns {THREE.Vector3[]|null} smoothed waypoints (floor height)
   */
  findPath(from, to) {
    if (!this.ready) return null;
    const s = this.nearest(from.x, from.z);
    const t = this.nearest(to.x, to.z);
    if (!s || !t) return null;
    const n = this.n;
    const start = this.index(s[0], s[1]);
    const goal = this.index(t[0], t[1]);
    const stamp = ++this._search;
    const g = this.g;
    const f = this.f;
    const h = (k) => {
      const dx = Math.abs((k % n) - t[0]);
      const dz = Math.abs(Math.floor(k / n) - t[1]);
      return (dx + dz + (SQ2 - 2) * Math.min(dx, dz)) * this.cell;
    };
    const heap = new Heap(f);
    this.stamp[start] = stamp;
    g[start] = 0;
    f[start] = h(start);
    this.parent[start] = -1;
    heap.push(start);
    let iterations = 0;
    let found = false;
    while (heap.size && iterations++ < NAV.maxIterations) {
      const cur = heap.pop();
      if (this.closed[cur] === stamp) continue;
      this.closed[cur] = stamp;
      if (cur === goal) {
        found = true;
        break;
      }
      const ci = cur % n;
      const cj = Math.floor(cur / n);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di;
          const nj = cj + dj;
          if (!this.walkable(ni, nj)) continue;
          const nk = this.index(ni, nj);
          if (this.closed[nk] === stamp || !this._canStep(cur, nk)) continue;
          // No corner cutting.
          if (di && dj && (!this.walkable(ci + di, cj) || !this.walkable(ci, cj + dj))) continue;
          const cost = g[cur] + (di && dj ? SQ2 : 1) * this.cell;
          if (this.stamp[nk] === stamp && cost >= g[nk]) continue;
          this.stamp[nk] = stamp;
          g[nk] = cost;
          f[nk] = cost + h(nk);
          this.parent[nk] = cur;
          heap.push(nk);
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = goal; k !== -1; k = this.parent[k]) cells.push(k);
    cells.reverse();
    return this._smooth(cells);
  }

  /** Straight walkable line between two cells (grid DDA). */
  lineWalkable(a, b) {
    const n = this.n;
    let x0 = a % n;
    let y0 = Math.floor(a / n);
    const x1 = b % n;
    const y1 = Math.floor(b / n);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let prev = a;
    for (;;) {
      const k = this.index(x0, y0);
      if (!this.walk[k] || !this._canStep(prev, k)) return false;
      prev = k;
      if (x0 === x1 && y0 === y1) return true;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  _smooth(cells) {
    const out = [];
    let anchor = 0;
    const n = this.n;
    out.push(this.point(cells[0] % n, Math.floor(cells[0] / n)));
    for (let k = 2; k < cells.length; k++) {
      if (!this.lineWalkable(cells[anchor], cells[k])) {
        anchor = k - 1;
        out.push(this.point(cells[anchor] % n, Math.floor(cells[anchor] / n)));
      }
    }
    const last = cells[cells.length - 1];
    out.push(this.point(last % n, Math.floor(last / n)));
    return out;
  }

  /**
   * A reachable-looking cell hidden from `threat` (eye height), near `from`.
   * @returns {THREE.Vector3|null}
   */
  cover(from, threat, radius) {
    const [ci, cj] = this.cellOf(from.x, from.z);
    const R = Math.ceil(radius / this.cell);
    let best = null;
    let bestD = Infinity;
    const eye = _a.copy(threat).setY(threat.y + 1.5);
    for (let dj = -R; dj <= R; dj += 2) {
      for (let di = -R; di <= R; di += 2) {
        const i = ci + di;
        const j = cj + dj;
        if (!this.walkable(i, j)) continue;
        const p = this.point(i, j, _b);
        const d = p.distanceTo(from);
        if (d > radius || d >= bestD) continue;
        // Must be at least a little away from the threat.
        if (p.distanceTo(threat) < 5) continue;
        const target = _o.copy(p).setY(p.y + 1.2);
        _d.subVectors(target, eye);
        const len = _d.length();
        _d.divideScalar(len);
        const hit = this.physics.raycast(eye, _d, len, STATIC_ONLY, _hit);
        if (!hit) continue;
        best = p.clone();
        bestD = d;
      }
    }
    return best;
  }

  /** Random walkable point within `radius` of `center`. */
  randomPoint(center, radius, rnd = Math.random) {
    for (let k = 0; k < 20; k++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * radius;
      const c = this.nearest(center.x + Math.cos(a) * r, center.z + Math.sin(a) * r, 2);
      if (c) return this.point(c[0], c[1]);
    }
    return null;
  }

  get stats() {
    let w = 0;
    for (let k = 0; k < this.walk.length; k++) w += this.walk[k];
    return `${this.n}×${this.n} (${w} yürünebilir)`;
  }
}
