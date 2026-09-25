/**
 * @file TriggerSystem — oriented box volumes that emit `trigger:enter` /
 * `trigger:exit` on the EventBus when the player capsule enters or leaves.
 */
import * as THREE from 'three';

/**
 * @typedef {Object} TriggerZone
 * @property {string} id
 * @property {THREE.Vector3} size      full extents
 * @property {THREE.Matrix4} matrix    world transform
 * @property {THREE.Matrix4} inverse
 * @property {boolean} once            disable after first enter
 * @property {boolean} inside
 * @property {boolean} enabled
 * @property {any} data                payload forwarded with events
 */

const _local = new THREE.Vector3();

export class TriggerSystem {
  /** @param {import('../core/EventBus.js').EventBus} bus */
  constructor(bus) {
    this.bus = bus;
    /** @type {TriggerZone[]} */
    this.zones = [];
  }

  /**
   * @param {{id:string, size:THREE.Vector3, matrix:THREE.Matrix4, once?:boolean, data?:any}} o
   * @returns {TriggerZone}
   */
  add(o) {
    const zone = {
      id: o.id,
      size: o.size.clone(),
      matrix: o.matrix.clone(),
      inverse: o.matrix.clone().invert(),
      once: !!o.once,
      inside: false,
      enabled: true,
      data: o.data ?? {},
    };
    this.zones.push(zone);
    return zone;
  }

  /** @param {TriggerZone} zone */
  remove(zone) {
    const i = this.zones.indexOf(zone);
    if (i >= 0) this.zones.splice(i, 1);
  }

  /**
   * Test the player capsule against every zone (capsule approximated by
   * three sample points along its axis, inflated by its radius).
   * @param {THREE.Vector3} feet
   * @param {number} height
   * @param {number} radius
   */
  update(feet, height, radius) {
    for (const z of this.zones) {
      if (!z.enabled) continue;
      let inside = false;
      for (let i = 0; i < 3 && !inside; i++) {
        _local.set(feet.x, feet.y + radius + ((height - 2 * radius) * i) / 2, feet.z).applyMatrix4(z.inverse);
        inside =
          Math.abs(_local.x) <= z.size.x / 2 + radius &&
          Math.abs(_local.y) <= z.size.y / 2 + radius &&
          Math.abs(_local.z) <= z.size.z / 2 + radius;
      }
      if (inside && !z.inside) {
        z.inside = true;
        this.bus.emit('trigger:enter', { id: z.id, zone: z, data: z.data });
        if (z.once) z.enabled = false;
      } else if (!inside && z.inside) {
        z.inside = false;
        this.bus.emit('trigger:exit', { id: z.id, zone: z, data: z.data });
      }
    }
  }
}
