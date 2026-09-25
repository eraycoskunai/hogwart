/**
 * @file ColorGrading — picks the grade for where the camera is (zone
 * volumes such as dungeons, the Great Hall, the forest) and blends it with
 * time of day (night) and weather (overcast) outdoors. Results change
 * smoothly over time.
 */
import * as THREE from 'three';
import { GRADES, POSTFX } from '../data/atmosphere.js';

const FIELDS = ['exposure', 'contrast', 'saturation', 'vignette'];
const VEC = ['lift', 'gain'];

function copyGrade(g) {
  return { exposure: g.exposure, contrast: g.contrast, saturation: g.saturation, vignette: g.vignette, lift: [...g.lift], gain: [...g.gain] };
}

function mixInto(out, a, b, t) {
  for (const f of FIELDS) out[f] = a[f] + (b[f] - a[f]) * t;
  for (const f of VEC) for (let i = 0; i < 3; i++) out[f][i] = a[f][i] + (b[f][i] - a[f][i]) * t;
  return out;
}

export class ColorGrading {
  constructor() {
    /** @type {{name:string, grade:string, min:THREE.Vector3, max:THREE.Vector3, indoor:boolean, ambient:any}[]} */
    this.zones = [];
    this.current = copyGrade(GRADES.outdoor);
    this._target = copyGrade(GRADES.outdoor);
    this._tmp = copyGrade(GRADES.outdoor);
    this.zone = null;
  }

  /**
   * @param {{name:string, grade:string, min:number[], max:number[], indoor?:boolean,
   *          ambient?:{sky:number, ground:number, intensity:number}}} z
   */
  addZone(z) {
    this.zones.push({
      name: z.name,
      grade: z.grade,
      min: new THREE.Vector3().fromArray(z.min),
      max: new THREE.Vector3().fromArray(z.max),
      indoor: z.indoor ?? true,
      ambient: z.ambient ? { sky: new THREE.Color(z.ambient.sky), ground: new THREE.Color(z.ambient.ground), intensity: z.ambient.intensity } : null,
    });
  }

  clearZones() {
    this.zones.length = 0;
  }

  /** @param {THREE.Vector3} p */
  zoneAt(p) {
    for (const z of this.zones) {
      if (p.x >= z.min.x && p.x <= z.max.x && p.y >= z.min.y && p.y <= z.max.y && p.z >= z.min.z && p.z <= z.max.z) return z;
    }
    return null;
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} pos grading reference point (the player's head)
   * @param {{night:number, overcast:number, extraExposure:number}} env
   */
  update(dt, pos, env) {
    const z = this.zoneAt(pos);
    this.zone = z;
    const base = GRADES[z?.grade] ?? GRADES.outdoor;
    const t = this._target;
    mixInto(t, base, base, 0);
    if (!z || !z.indoor) {
      mixInto(t, t, GRADES.night, env.night * 0.85);
      mixInto(t, t, GRADES.overcast, env.overcast * (1 - env.night) * 0.8);
    }
    t.exposure *= env.extraExposure;
    const k = 1 - Math.exp(-POSTFX.gradeBlend * dt);
    mixInto(this.current, this.current, t, k);
    return this.current;
  }
}
