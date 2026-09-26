/**
 * @file Squad — group coordination for an encounter: alerting allies
 * ("calling for help"), attack tokens so only a few enemies strike at the
 * same time (the rest circle and wait), and flanking slots spread around
 * the player so a group surrounds instead of queuing.
 */
import * as THREE from 'three';
import { PERCEPTION } from '../../data/combat.js';

export class Squad {
  /**
   * @param {string} id
   * @param {{attackers:number}} difficulty
   */
  constructor(id, difficulty) {
    this.id = id;
    this.members = new Set();
    this.attackers = new Set();
    this.maxAttackers = difficulty.attackers;
    this.lastKnown = null;
  }

  add(e) {
    this.members.add(e);
    e.squad = this;
  }

  remove(e) {
    this.members.delete(e);
    this.attackers.delete(e);
  }

  /** One member saw the target: everyone near hears the call. */
  alert(from, targetPos) {
    this.lastKnown = targetPos.clone();
    for (const m of this.members) {
      if (m === from || m.dead) continue;
      if (m.position.distanceTo(from.position) <= PERCEPTION.helpRadius) m.hearAlly(targetPos);
    }
  }

  /** Ask for an attack token (true = may attack now). */
  requestAttack(e) {
    if (this.attackers.has(e)) return true;
    for (const a of this.attackers) if (a.dead || !a.engaged) this.attackers.delete(a);
    if (this.attackers.size >= this.maxAttackers) return false;
    this.attackers.add(e);
    return true;
  }

  releaseAttack(e) {
    this.attackers.delete(e);
  }

  /**
   * Standing point around the target for member `e` at `range`.
   * @param {THREE.Vector3} target
   * @param {number} range
   */
  slot(e, target, range, out = new THREE.Vector3()) {
    const list = [...this.members].filter((m) => !m.dead);
    const k = Math.max(0, list.indexOf(e));
    const n = Math.max(1, list.length);
    // Fan the group out on the side they came from.
    const base = Math.atan2(e.home.x - target.x, e.home.z - target.z);
    const a = base + (k - (n - 1) / 2) * (Math.PI / Math.max(3, n + 1)) * 1.4;
    return out.set(target.x + Math.sin(a) * range, target.y, target.z + Math.cos(a) * range);
  }

  get alive() {
    let n = 0;
    for (const m of this.members) if (!m.dead) n++;
    return n;
  }
}
