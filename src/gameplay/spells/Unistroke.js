/**
 * @file Unistroke — the $1 Unistroke Recognizer (Wobbrock, Wilson & Li,
 * 2007) for wand gestures: resample → (optional) rotate → scale to a
 * square → translate to the origin → golden-section search of the best
 * angle → path distance. Wand gestures care about direction (an upward
 * stroke is Lumos, a downward one Nox), so this uses the
 * rotation-sensitive variant: no rotation to the indicative angle, only a
 * small ± search to forgive a tilted hand.
 */

const PHI = 0.5 * (-1 + Math.sqrt(5));

function pathLength(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return d;
}

/** Evenly spaced points along the stroke. */
export function resample(points, n) {
  const pts = points.map((p) => ({ x: p.x, y: p.y }));
  const I = pathLength(pts) / (n - 1);
  if (I <= 0) return Array.from({ length: n }, () => ({ ...pts[0] }));
  let D = 0;
  const out = [{ ...pts[0] }];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (D + d >= I && d > 0) {
      const t = (I - D) / d;
      const q = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
      out.push(q);
      pts.splice(i, 0, q);
      D = 0;
    } else D += d;
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1] });
  return out.slice(0, n);
}

function centroid(pts) {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

function rotateBy(pts, a) {
  const c = centroid(pts);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return pts.map((p) => ({ x: (p.x - c.x) * cos - (p.y - c.y) * sin + c.x, y: (p.x - c.x) * sin + (p.y - c.y) * cos + c.y }));
}

/** Uniform scale (keeps the aspect of thin strokes such as lines). */
function scaleTo(pts, size) {
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
  const s = Math.max(maxX - minX, maxY - minY) || 1;
  return pts.map((p) => ({ x: (p.x - minX) * (size / s), y: (p.y - minY) * (size / s) }));
}

function translateToOrigin(pts) {
  const c = centroid(pts);
  return pts.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
}

function pathDistance(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
  return d / a.length;
}

function distanceAtAngle(pts, tpl, a) {
  return pathDistance(rotateBy(pts, a), tpl);
}

function distanceAtBestAngle(pts, tpl, from, to, precision) {
  let x1 = PHI * from + (1 - PHI) * to;
  let f1 = distanceAtAngle(pts, tpl, x1);
  let x2 = (1 - PHI) * from + PHI * to;
  let f2 = distanceAtAngle(pts, tpl, x2);
  while (Math.abs(to - from) > precision) {
    if (f1 < f2) {
      to = x2;
      x2 = x1;
      f2 = f1;
      x1 = PHI * from + (1 - PHI) * to;
      f1 = distanceAtAngle(pts, tpl, x1);
    } else {
      from = x1;
      x1 = x2;
      f1 = f2;
      x2 = (1 - PHI) * from + PHI * to;
      f2 = distanceAtAngle(pts, tpl, x2);
    }
  }
  return Math.min(f1, f2);
}

/** Expand named procedural shapes into point lists (unit box, y down). */
export function shapePoints(def) {
  if (Array.isArray(def)) return def.map(([x, y]) => ({ x, y }));
  const pts = [];
  const N = 48;
  if (def === 'circleCW' || def === 'circleCCW') {
    const dir = def === 'circleCW' ? 1 : -1;
    for (let i = 0; i <= N; i++) {
      const a = -Math.PI / 2 + dir * (i / N) * Math.PI * 2;
      pts.push({ x: 0.5 + Math.cos(a) * 0.5, y: 0.5 + Math.sin(a) * 0.5 });
    }
  } else if (def === 'spiral') {
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const a = t * Math.PI * 4;
      const r = 0.5 * (1 - t * 0.85);
      pts.push({ x: 0.5 + Math.cos(a) * r, y: 0.5 + Math.sin(a) * r });
    }
  } else if (def === 'infinity') {
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      pts.push({ x: 0.5 + Math.sin(a) * 0.5, y: 0.5 + Math.sin(a) * Math.cos(a) * 0.5 });
    }
  } else throw new Error(`Bilinmeyen jest şekli: ${def}`);
  return pts;
}

export class Unistroke {
  /**
   * @param {{resample:number, size:number, angleRange:number, anglePrecision:number}} cfg
   */
  constructor(cfg) {
    this.cfg = cfg;
    this.templates = [];
    this._halfDiagonal = 0.5 * Math.sqrt(2 * cfg.size * cfg.size);
  }

  _normalize(points) {
    return translateToOrigin(scaleTo(resample(points, this.cfg.resample), this.cfg.size));
  }

  /** @param {string} name @param {{x:number, y:number}[]} points */
  add(name, points) {
    this.templates.push({ name, points: this._normalize(points) });
  }

  /**
   * @param {{x:number, y:number}[]} points
   * @returns {{name:string|null, score:number}}
   */
  recognize(points) {
    if (points.length < 2) return { name: null, score: 0 };
    const pts = this._normalize(points);
    const r = (this.cfg.angleRange * Math.PI) / 180;
    const p = (this.cfg.anglePrecision * Math.PI) / 180;
    let best = Infinity;
    let name = null;
    for (const t of this.templates) {
      const d = distanceAtBestAngle(pts, t.points, -r, r, p);
      if (d < best) {
        best = d;
        name = t.name;
      }
    }
    return { name, score: 1 - best / this._halfDiagonal };
  }
}
