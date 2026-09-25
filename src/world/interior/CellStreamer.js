/**
 * @file CellStreamer — streams interior cells (rooms) and culls them through
 * portals. Cells within `keep` links of the player are built at once, cells
 * within `prefetch` links are built one per frame ahead of time, and cells
 * farther than `drop` links are freed after `dropDelay` seconds. Rendering
 * walks from the camera's cell through every portal (doorway) that is open
 * and inside the view frustum; rooms that cannot be seen are hidden and
 * their lights switched off.
 */
import * as THREE from 'three';

const _frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();

/**
 * @typedef {object} StreamLink
 * @property {string} a
 * @property {string|null} b
 * @property {THREE.Box3} box portal volume
 * @property {() => boolean} traversable part of the graph (hidden links become so when revealed)
 * @property {() => boolean} passable can be seen through (door open enough)
 */

export class CellStreamer {
  /**
   * @param {{cells:any[], links:StreamLink[], build:(id:string)=>void, unload:(id:string)=>void, isBuilt:(id:string)=>boolean,
   *          root:(id:string)=>THREE.Object3D|null, setLit:(id:string, lit:boolean)=>void, cfg:any}} o
   */
  constructor(o) {
    this.o = o;
    this.cfg = o.cfg;
    this.cells = o.cells;
    this.links = o.links;
    this.byId = new Map(this.cells.map((c) => [c.id, c]));
    /** @type {Map<string, {link:StreamLink, other:string}[]>} */
    this.adj = new Map(this.cells.map((c) => [c.id, []]));
    for (const l of this.links) {
      if (!l.b) continue;
      this.adj.get(l.a).push({ link: l, other: l.b });
      this.adj.get(l.b).push({ link: l, other: l.a });
    }
    this.playerCell = null;
    this.cameraCell = null;
    this.visible = new Set();
    this._idle = new Map();
    this.stats = { built: 0, visible: 0, portals: 0, queued: 0 };
  }

  /** Smallest cell containing p (with a small margin), or null. */
  cellAt(p, margin = 0.3) {
    let best = null;
    let bestVol = Infinity;
    for (const c of this.cells) {
      const [x0, y0, z0] = c.min;
      const [x1, y1, z1] = c.max;
      if (p.x < x0 - margin || p.x > x1 + margin || p.y < y0 - 1 || p.y > y1 + margin || p.z < z0 - margin || p.z > z1 + margin) continue;
      const vol = (x1 - x0) * (y1 - y0) * (z1 - z0);
      if (vol < bestVol) {
        best = c;
        bestVol = vol;
      }
    }
    return best;
  }

  /** Graph distances (in links) from a cell. */
  distances(fromId) {
    const dist = new Map([[fromId, 0]]);
    const queue = [fromId];
    while (queue.length) {
      const id = queue.shift();
      const d = dist.get(id);
      for (const { link, other } of this.adj.get(id)) {
        if (dist.has(other) || !link.traversable()) continue;
        dist.set(other, d + 1);
        queue.push(other);
      }
    }
    return dist;
  }

  /**
   * Make sure the rooms around `p` exist (used at spawn / teleport).
   * @param {THREE.Vector3} p
   */
  ensureAround(p) {
    const c = this.cellAt(p) ?? this.byId.get(this.playerCell);
    if (!c) return;
    this.playerCell = c.id;
    for (const [id, d] of this.distances(c.id)) if (d <= this.cfg.keep && !this.o.isBuilt(id)) this.o.build(id);
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} player feet
   * @param {THREE.Camera} camera
   */
  update(dt, player, camera) {
    const C = this.cfg;
    const pc = this.cellAt(player);
    if (pc) this.playerCell = pc.id;
    if (!this.playerCell) return;
    const dist = this.distances(this.playerCell);

    // Build what must exist now, prefetch one room per frame.
    let queued = 0;
    let prefetched = false;
    for (const [id, d] of dist) {
      if (this.o.isBuilt(id)) continue;
      if (d <= C.keep) this.o.build(id);
      else if (d <= C.prefetch) {
        queued++;
        if (!prefetched) {
          this.o.build(id);
          prefetched = true;
        }
      }
    }
    // Free rooms far away (after a delay, so walking back and forth is cheap).
    for (const c of this.cells) {
      if (!this.o.isBuilt(c.id)) continue;
      const d = dist.get(c.id) ?? Infinity;
      if (d < C.drop) {
        this._idle.delete(c.id);
        continue;
      }
      const t = (this._idle.get(c.id) ?? 0) + dt;
      this._idle.set(c.id, t);
      if (t > C.dropDelay) {
        this._idle.delete(c.id);
        this.o.unload(c.id);
      }
    }

    // Portal culling from the camera's room.
    const cc = this.cellAt(camera.position, 0.05) ?? this.byId.get(this.playerCell);
    this.cameraCell = cc.id;
    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv);
    const seen = new Set([cc.id]);
    const queue = [[cc.id, 0]];
    let portals = 0;
    while (queue.length) {
      const [id, depth] = queue.shift();
      if (depth >= C.maxPortalDepth) continue;
      for (const { link, other } of this.adj.get(id)) {
        if (seen.has(other) || !link.traversable() || !link.passable() || !this.o.isBuilt(other)) continue;
        if (!_frustum.intersectsBox(link.box)) continue;
        portals++;
        seen.add(other);
        queue.push([other, depth + 1]);
      }
    }
    let built = 0;
    for (const c of this.cells) {
      if (!this.o.isBuilt(c.id)) continue;
      built++;
      const vis = seen.has(c.id);
      const root = this.o.root(c.id);
      if (root && root.visible !== vis) {
        root.visible = vis;
        this.o.setLit(c.id, vis);
      }
    }
    this.visible = seen;
    this.stats = { built, visible: seen.size, portals, queued };
  }

  /** Is the room at p currently drawn? (NPC culling) */
  isVisibleAt(p) {
    const c = this.cellAt(p, 0.1);
    return c ? this.visible.has(c.id) : true;
  }
}
