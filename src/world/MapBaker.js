/**
 * @file MapBaker — paints the map images. The grounds map samples the
 * terrain height and water level on a grid: hypsometric tint, lake depth,
 * hill shading from the height gradient, the castle's halls and towers
 * drawn on top. Castle floor plans draw every room on a floor as a
 * parchment rectangle with its name, and the doorways between them.
 */
import { MAP } from '../data/ui.js';
import { CASTLE } from '../data/castle.js';
import { INTERIOR } from '../data/interior.js';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Map a world (x, z) to canvas pixels for an extent. */
export function toMap(extent, size, x, z) {
  const [x0, z0, x1, z1] = extent;
  return [((x - x0) / (x1 - x0)) * size, ((z - z0) / (z1 - z0)) * size];
}

/**
 * @param {{heightAt:(x:number,z:number)=>number, waterLevelAt:(x:number,z:number)=>number}} region
 * @returns {HTMLCanvasElement}
 */
export function bakeGrounds(region) {
  const N = MAP.size;
  const [x0, z0, x1, z1] = MAP.extent;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const img = g.createImageData(N, N);
  const H = new Float32Array(N * N);
  const W = new Float32Array(N * N);
  const step = (x1 - x0) / N;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = x0 + (i + 0.5) * step;
      const z = z0 + (j + 0.5) * ((z1 - z0) / N);
      H[j * N + i] = region.heightAt(x, z);
      W[j * N + i] = region.waterLevelAt(x, z);
    }
  }
  const stops = MAP.heights.map(([h, col]) => [h, hex(col)]);
  const [wa, wb] = MAP.water.map(hex);
  const [lx, lz] = MAP.light;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const h = H[k];
      let r, gg, b;
      if (W[k] > h) {
        const t = Math.min(1, (W[k] - h) / 20);
        r = wa[0] + (wb[0] - wa[0]) * t;
        gg = wa[1] + (wb[1] - wa[1]) * t;
        b = wa[2] + (wb[2] - wa[2]) * t;
      } else {
        let s = 0;
        while (s < stops.length - 2 && h > stops[s + 1][0]) s++;
        const [h0, c0] = stops[s];
        const [h1, c1] = stops[s + 1];
        const t = Math.max(0, Math.min(1, (h - h0) / (h1 - h0)));
        r = c0[0] + (c1[0] - c0[0]) * t;
        gg = c0[1] + (c1[1] - c0[1]) * t;
        b = c0[2] + (c1[2] - c0[2]) * t;
        // Hill shading from the height gradient.
        const dx = H[j * N + Math.min(N - 1, i + 1)] - H[j * N + Math.max(0, i - 1)];
        const dz = H[Math.min(N - 1, j + 1) * N + i] - H[Math.max(0, j - 1) * N + i];
        const shade = 1 + Math.max(-0.6, Math.min(0.6, ((dx * lx + dz * lz) / (2 * step)) * MAP.shade * -1));
        r *= shade;
        gg *= shade;
        b *= shade;
      }
      img.data[k * 4] = r;
      img.data[k * 4 + 1] = gg;
      img.data[k * 4 + 2] = b;
      img.data[k * 4 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // Castle footprint.
  const px = (x, z) => toMap(MAP.extent, N, x, z);
  const s = N / (x1 - x0);
  g.fillStyle = MAP.castle;
  g.strokeStyle = 'rgba(240, 220, 170, 0.7)';
  g.lineWidth = 1;
  for (const hall of CASTLE.halls) {
    const [cx, cz] = px(hall.pos[0], hall.pos[1]);
    const w = hall.size[0] * s;
    const d = hall.size[1] * s;
    g.fillRect(cx - w / 2, cz - d / 2, w, d);
    g.strokeRect(cx - w / 2, cz - d / 2, w, d);
  }
  for (const t of CASTLE.towers ?? []) {
    const [cx, cz] = px(t.pos[0], t.pos[1]);
    g.beginPath();
    g.arc(cx, cz, Math.max(2, t.radius * s), 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  return c;
}

/**
 * Floor plan of the castle interior for one floor.
 * @param {{id:number, name:string, range:number[]}} floor
 */
export function bakeFloor(floor) {
  const N = MAP.size;
  const E = MAP.castleExtent;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2420';
  g.fillRect(0, 0, N, N);
  const s = N / (E[2] - E[0]);
  const [lo, hi] = floor.range;
  const cells = INTERIOR.cells.filter((cell) => cell.min[1] >= lo && cell.min[1] < hi);
  g.font = `bold ${Math.round(N / 48)}px Georgia, serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const cell of cells) {
    const [ax, az] = toMap(E, N, cell.min[0], cell.min[2]);
    const [bx, bz] = toMap(E, N, cell.max[0], cell.max[2]);
    g.fillStyle = '#e2cc9c';
    g.fillRect(ax, az, bx - ax, bz - az);
    g.strokeStyle = '#5b4430';
    g.lineWidth = 2;
    g.strokeRect(ax, az, bx - ax, bz - az);
  }
  // Doorways on this floor.
  g.fillStyle = '#c9a24a';
  for (const L of INTERIOR.links) {
    if (L.y < lo || L.y >= hi || L.secret) continue;
    const a = INTERIOR.cells.find((cc) => cc.id === L.a);
    const horiz = L.side === 'n' || L.side === 's';
    const x = horiz ? L.at : L.side === 'e' ? a.max[0] : a.min[0];
    const z = horiz ? (L.side === 'n' ? a.min[2] : a.max[2]) : L.at;
    const [mx, mz] = toMap(E, N, x, z);
    const w = L.width * s;
    if (horiz) g.fillRect(mx - w / 2, mz - 3, w, 6);
    else g.fillRect(mx - 3, mz - w / 2, 6, w);
  }
  g.fillStyle = '#2b1d12';
  for (const cell of cells) {
    const [ax, az] = toMap(E, N, cell.min[0], cell.min[2]);
    const [bx, bz] = toMap(E, N, cell.max[0], cell.max[2]);
    if (bx - ax < 26 && bz - az < 26) continue;
    g.save();
    g.translate((ax + bx) / 2, (az + bz) / 2);
    if (bz - az > (bx - ax) * 2.2) g.rotate(-Math.PI / 2);
    g.fillText(cell.name, 0, 0);
    g.restore();
  }
  return c;
}

/** Which floor a height belongs to. */
export function floorOf(y) {
  return MAP.floors.find((f) => y >= f.range[0] && y < f.range[1]) ?? MAP.floors[1];
}
