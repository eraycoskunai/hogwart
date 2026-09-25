/**
 * @file RoomBuilder — builds enclosed rooms from data for a host world
 * (walls with a doorway, roof, optional enchanted ceiling, long tables,
 * benches, carpet runner, tapestries, floating candles, wall torches, pooled
 * light sources and a colour-grading zone). Used by the test hall now and by
 * the castle interiors later.
 *
 * The host provides: ctx {physics, library, lights, flames, grading, sky},
 * root (Object3D), materials (name → Material), staticBox(matrix, size, matKey),
 * libraryMaterials (array of borrowed materials), animated (array of fns).
 */
import * as THREE from 'three';

export const ROOM = Object.freeze({
  tableTopHeight: 0.82,
  tableThickness: 0.1,
  tableWidth: 1.2,
  benchHeight: 0.46,
  benchWidth: 0.42,
  benchGap: 1.05,
  legSize: 0.12,
  candleHeight: 0.26,
  candleRadius: 0.035,
  candleBob: 0.12,
  torchHeight: 2.1,
  ceilingInset: 0.03,
});

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();

/**
 * @param {any} host
 * @param {any} spec room data
 * @returns {{update:(time:number)=>void, sources:any[]}}
 */
export function buildRoom(host, spec) {
  const { ctx } = host;
  const [cx, cy, cz] = spec.pos;
  const [w, h, d] = spec.size;
  const t = spec.wall;
  const wallMat = spec.wallMat;
  const box = (x, y, z, sx, sy, sz, mat = wallMat) => {
    _m.makeTranslation(cx + x, cy + y, cz + z);
    host.staticBox(_m.clone(), new THREE.Vector3(sx, sy, sz), mat);
  };

  // --- Walls with a doorway on one side.
  const door = spec.door;
  const wallSeg = (side) => {
    const alongX = side === 'north' || side === 'south';
    const len = alongX ? w : d - 2 * t;
    const off = side === 'north' ? -d / 2 + t / 2 : side === 'south' ? d / 2 - t / 2 : side === 'west' ? -w / 2 + t / 2 : w / 2 - t / 2;
    const place = (a0, a1, y0, y1) => {
      const mid = (a0 + a1) / 2;
      const size = a1 - a0;
      if (size <= 0.01) return;
      if (alongX) box(mid, (y0 + y1) / 2, off, size, y1 - y0, t);
      else box(off, (y0 + y1) / 2, mid, t, y1 - y0, size);
    };
    if (door?.side === side) {
      const hw = door.width / 2;
      const c = door.offset ?? 0;
      place(-len / 2, c - hw, 0, h);
      place(c + hw, len / 2, 0, h);
      place(c - hw, c + hw, door.height, h);
    } else {
      place(-len / 2, len / 2, 0, h);
    }
  };
  for (const side of ['north', 'south', 'east', 'west']) wallSeg(side);
  box(0, h + t / 2, 0, w, t, d, spec.roofMat ?? wallMat);
  if (spec.floorMat) box(0, 0.025, 0, w - 2 * t, 0.05, d - 2 * t, spec.floorMat);

  const inner = { w: w - 2 * t, d: d - 2 * t };

  // --- Enchanted ceiling (shows the real sky).
  if (spec.ceiling === 'enchanted' && ctx.sky) {
    const center = new THREE.Vector3(cx, cy + h - ROOM.ceilingInset, cz);
    const mat = ctx.sky.createCeilingMaterial(center, inner.d * 0.45);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(inner.w, inner.d), mat);
    plane.rotation.x = Math.PI / 2;
    plane.position.copy(center);
    host.root.add(plane);
  }

  // --- Carpet runner down the middle.
  if (spec.carpet) {
    const mat = ctx.library.get(spec.carpet.key, { triplanar: false });
    host.libraryMaterials.push(mat);
    const [cw, cl] = spec.carpet.size;
    const geo = new THREE.PlaneGeometry(cl, cw);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * cl) / spec.carpet.tile, (uv.getY(i) * cw) / spec.carpet.tile);
    const carpet = new THREE.Mesh(geo, mat);
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(cx, cy + 0.012, cz);
    carpet.receiveShadow = true;
    host.root.add(carpet);
  }

  // --- Long tables with benches (colliders included).
  for (const tb of spec.tables ?? []) {
    const [tx, tz] = tb.pos;
    const L = tb.length;
    const top = ROOM.tableTopHeight;
    box(tx, top - ROOM.tableThickness / 2, tz, L, ROOM.tableThickness, ROOM.tableWidth, tb.mat);
    for (const lx of [-L / 2 + 0.3, 0, L / 2 - 0.3]) {
      for (const lz of [-ROOM.tableWidth / 2 + 0.15, ROOM.tableWidth / 2 - 0.15]) {
        box(tx + lx, (top - ROOM.tableThickness) / 2, tz + lz, ROOM.legSize, top - ROOM.tableThickness, ROOM.legSize, tb.mat);
      }
    }
    for (const side of [-1, 1]) {
      const bz = tz + side * ROOM.benchGap;
      box(tx, ROOM.benchHeight - 0.04, bz, L - 0.4, 0.08, ROOM.benchWidth, tb.mat);
      for (const lx of [-L / 2 + 0.5, L / 2 - 0.5]) box(tx + lx, (ROOM.benchHeight - 0.08) / 2, bz, 0.1, ROOM.benchHeight - 0.08, ROOM.benchWidth - 0.08, tb.mat);
    }
  }

  // --- Tapestries on the inner walls.
  for (const tp of spec.tapestries ?? []) {
    const mat = ctx.library.get(tp.key);
    host.libraryMaterials.push(mat);
    const [tw, th] = tp.size;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(tw, th), mat);
    const inset = tp.wall === 'north' ? -inner.d / 2 + 0.03 : inner.d / 2 - 0.03;
    cloth.position.set(cx + tp.x, cy + tp.y, cz + inset);
    if (tp.wall === 'south') cloth.rotation.y = Math.PI;
    cloth.castShadow = cloth.receiveShadow = true;
    host.root.add(cloth);
  }

  // --- Light sources (pooled by the LightManager).
  const sources = [];
  for (const l of spec.lights ?? []) {
    sources.push(ctx.lights.add({ position: [cx + l.pos[0], cy + l.pos[1], cz + l.pos[2]], color: l.color, intensity: l.intensity, distance: l.distance, flicker: l.flicker }));
  }

  // --- Wall torches: iron bracket + flame + flickering light.
  const torchMats = host.materials.iron;
  for (const tr of spec.torches ?? []) {
    const [lx, lz, face] = tr; // face: +1 / -1 along x (east/west wall) facing inward
    const x = cx + lx;
    const z = cz + lz;
    const y = cy + ROOM.torchHeight;
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.06), torchMats);
    bracket.position.set(x - face * 0.15, y - 0.25, z);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.5, 8), host.materials.wood);
    handle.position.set(x, y - 0.12, z);
    handle.rotation.z = face * 0.35;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.045, 0.12, 10, 1, true), torchMats);
    cup.position.set(x + face * 0.05, y + 0.12, z);
    for (const m of [bracket, handle, cup]) {
      m.castShadow = true;
      host.root.add(m);
    }
    const src = ctx.lights.add({ position: [x + face * 0.3, y + 0.35, z], color: spec.torchColor, intensity: spec.torchIntensity, distance: spec.torchDistance, flicker: 'torch' });
    sources.push(src);
    ctx.flames?.add([x + face * 0.05, y + 0.14, z], { width: 0.26, height: 0.58, brightness: 1.8, source: src });
  }

  // --- Floating candles (instanced) with flames.
  const candles = [];
  let candleMesh = null;
  if (spec.candles) {
    const n = spec.candles.count;
    const geo = new THREE.CylinderGeometry(ROOM.candleRadius * 0.9, ROOM.candleRadius, ROOM.candleHeight, 10);
    const mat = new THREE.MeshStandardMaterial({ color: 0xf1e8cf, roughness: 0.55, emissive: 0x3a2a10, emissiveIntensity: 0.4 });
    host.ownedMaterials.push(mat);
    candleMesh = new THREE.InstancedMesh(geo, mat, n);
    candleMesh.castShadow = false;
    const [y0, y1] = spec.candles.height;
    for (let i = 0; i < n; i++) {
      const px = cx + (Math.random() - 0.5) * (inner.w - 2);
      const pz = cz + (Math.random() - 0.5) * (inner.d - 2);
      const py = cy + y0 + Math.random() * (y1 - y0);
      const flame = ctx.flames ? ctx.flames.add([px, py + ROOM.candleHeight / 2, pz], { width: 0.09, height: 0.2, brightness: 1.8 }) : -1;
      candles.push({ x: px, y: py, z: pz, phase: Math.random() * Math.PI * 2, speed: 0.6 + Math.random() * 0.5, flame });
    }
    host.root.add(candleMesh);
  }

  // --- Colour grading zone for the interior.
  if (spec.grade && ctx.grading) {
    ctx.grading.addZone({
      name: spec.name,
      grade: spec.grade,
      min: [cx - inner.w / 2, cy - 1, cz - inner.d / 2],
      max: [cx + inner.w / 2, cy + h, cz + inner.d / 2],
      indoor: true,
      ambient: spec.ambient,
    });
  }

  return {
    sources,
    /** Animate floating candles. @param {number} time */
    update(time) {
      if (!candleMesh) return;
      for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        const y = c.y + Math.sin(time * c.speed + c.phase) * ROOM.candleBob;
        _p.set(c.x, y, c.z);
        _m.compose(_p, _q, _s);
        candleMesh.setMatrixAt(i, _m);
        if (c.flame >= 0) ctx.flames.setPosition(c.flame, c.x, y + ROOM.candleHeight / 2, c.z);
      }
      candleMesh.instanceMatrix.needsUpdate = true;
    },
  };
}
