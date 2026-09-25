/**
 * @file TerrainMesh — renders the heightfield as square chunks, each with
 * several levels of detail (vertex step 1 / 2 / 4) picked by distance to
 * the camera. Chunk borders get skirts so neighbouring LODs never show
 * cracks. Normals always come from the full-resolution heights.
 */
import * as THREE from 'three';

export class TerrainMesh {
  /**
   * @param {import('./TerrainData.js').TerrainData} data
   * @param {THREE.Material} material
   * @param {{chunkCells:number, lod:{dist:number, step:number}[], skirt:number}} cfg
   */
  constructor(data, material, cfg) {
    this.data = data;
    this.cfg = cfg;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this.chunks = [];
    const per = Math.floor((data.n - 1) / cfg.chunkCells);
    for (let cz = 0; cz < per; cz++) {
      for (let cx = 0; cx < per; cx++) {
        const i0 = cx * cfg.chunkCells;
        const j0 = cz * cfg.chunkCells;
        const lods = cfg.lod.map((l) => this._chunkGeometry(i0, j0, l.step));
        const mesh = new THREE.Mesh(lods[0], material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.name = `terrain ${cx},${cz}`;
        const center = lods[0].boundingSphere.center.clone();
        this.chunks.push({ mesh, lods, level: 0, center });
        this.group.add(mesh);
      }
    }
  }

  _normal(i, j, out) {
    const d = this.data;
    const n = d.n;
    const H = d.heights;
    const cl = (v) => Math.max(0, Math.min(n - 1, v));
    const l = H[j * n + cl(i - 1)], r = H[j * n + cl(i + 1)];
    const b = H[cl(j - 1) * n + i], f = H[cl(j + 1) * n + i];
    return out.set(l - r, 2 * d.cell, b - f).normalize();
  }

  _chunkGeometry(i0, j0, step) {
    const d = this.data;
    const C = this.cfg.chunkCells;
    const cells = C / step;
    const verts = cells + 1;
    const skirt = this.cfg.skirt;
    const count = verts * verts + cells * 4 * 2 + 8;
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const idx = [];
    const nrm = new THREE.Vector3();
    let v = 0;
    const put = (i, j, drop) => {
      const x = d.x0 + i * d.cell;
      const z = d.z0 + j * d.cell;
      pos[v * 3] = x;
      pos[v * 3 + 1] = d.heights[j * d.n + i] - drop;
      pos[v * 3 + 2] = z;
      this._normal(i, j, nrm);
      nor[v * 3] = nrm.x;
      nor[v * 3 + 1] = nrm.y;
      nor[v * 3 + 2] = nrm.z;
      return v++;
    };
    const grid = [];
    for (let y = 0; y < verts; y++) {
      for (let x = 0; x < verts; x++) grid.push(put(i0 + x * step, j0 + y * step, 0));
    }
    const at = (x, y) => grid[y * verts + x];
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const a = at(x, y), b = at(x + 1, y), c = at(x, y + 1), e = at(x + 1, y + 1);
        idx.push(a, c, b, b, c, e);
      }
    }
    // Skirts: a vertical strip hanging below every border edge.
    const edge = (list) => {
      for (let k = 0; k < list.length - 1; k++) {
        const [xa, ya] = list[k];
        const [xb, yb] = list[k + 1];
        const a = at(xa, ya);
        const b = at(xb, yb);
        const a2 = put(i0 + xa * step, j0 + ya * step, skirt);
        const b2 = put(i0 + xb * step, j0 + yb * step, skirt);
        idx.push(a, b, a2, b, b2, a2, a, a2, b, b, a2, b2);
      }
    };
    const top = [], bottom = [], left = [], right = [];
    for (let k = 0; k <= cells; k++) {
      top.push([k, 0]);
      bottom.push([k, cells]);
      left.push([0, k]);
      right.push([cells, k]);
    }
    edge(top);
    edge(bottom);
    edge(left);
    edge(right);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, v * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, v * 3), 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  /** Pick each chunk's level of detail. @param {THREE.Vector3} camPos */
  update(camPos) {
    const L = this.cfg.lod;
    for (const c of this.chunks) {
      const r = c.lods[0].boundingSphere.radius;
      const dist = Math.max(0, camPos.distanceTo(c.center) - r * 0.7);
      let level = L.findIndex((l) => dist < l.dist);
      if (level < 0) level = L.length - 1;
      // Hysteresis: only step down when clearly farther.
      if (level > c.level && dist < L[c.level].dist * 1.08) level = c.level;
      if (level !== c.level) {
        c.level = level;
        c.mesh.geometry = c.lods[level];
      }
    }
  }

  get stats() {
    const counts = [0, 0, 0];
    for (const c of this.chunks) counts[c.level]++;
    return counts.join(' / ');
  }

  dispose() {
    for (const c of this.chunks) for (const g of c.lods) g.dispose();
    this.group.removeFromParent();
  }
}
