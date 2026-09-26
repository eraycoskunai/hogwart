/**
 * @file MapState — what the player has found: fast-travel points (the
 * named places of each region) are discovered by walking near them, and
 * danger zones (enemy camps, the lair) by coming close. Knows whether
 * fast travel is allowed right now. Saved as its own section.
 *
 * Events: map:discovered {name, region, kind}
 */
import { GROUND_TELEPORTS } from '../data/grounds.js';
import { CASTLE_TELEPORTS } from '../data/interior.js';
import { ENCOUNTERS } from '../data/combat.js';
import { TRAVEL } from '../data/ui.js';

/** Travel points per region (data; y may be null = terrain). */
export const TRAVEL_POINTS = Object.freeze({
  grounds: GROUND_TELEPORTS.map((t) => ({ name: t.name, pos: t.pos, yaw: t.yaw })),
  castle: CASTLE_TELEPORTS.map((t) => ({ name: t.name, pos: t.pos, yaw: t.yaw })),
});

/** Known from the start. */
const STARTING = ['grounds:Şato kapısı', 'castle:Giriş Holü'];

export class MapState {
  /** @param {import('../core/EventBus.js').EventBus} bus */
  constructor(bus) {
    this.bus = bus;
    this.reset();
  }

  reset() {
    this.places = new Set(STARTING);
    this.zones = new Set();
  }

  isKnown(region, name) {
    return this.places.has(`${region}:${name}`);
  }

  /** Discover what is near the player. @param {any} region @param {THREE.Vector3} p */
  update(region, p) {
    if (!region) return;
    for (const t of TRAVEL_POINTS[region.id] ?? []) {
      const key = `${region.id}:${t.name}`;
      if (this.places.has(key)) continue;
      const y = t.pos[1] ?? p.y;
      if (Math.hypot(p.x - t.pos[0], p.z - t.pos[2]) < TRAVEL.discover && Math.abs(p.y - y) < 8) {
        this.places.add(key);
        this.bus.emit('map:discovered', { name: t.name, region: region.id, kind: 'place' });
      }
    }
    for (const z of ENCOUNTERS[region.id] ?? []) {
      const key = `${region.id}:${z.id}`;
      if (this.zones.has(key)) continue;
      if (Math.hypot(p.x - z.center[0], p.z - z.center[1]) < z.activate * 0.8) {
        this.zones.add(key);
        this.bus.emit('map:discovered', { name: z.name, region: region.id, kind: 'danger' });
      }
    }
  }

  /** Travel points of a region with their discovered flag. */
  points(regionId) {
    return (TRAVEL_POINTS[regionId] ?? []).map((t) => ({ ...t, region: regionId, known: this.isKnown(regionId, t.name) }));
  }

  /** Discovered danger zones of a region. */
  dangers(regionId) {
    return (ENCOUNTERS[regionId] ?? []).filter((z) => this.zones.has(`${regionId}:${z.id}`));
  }

  /**
   * Why fast travel is not possible now (or null).
   * @param {any} game
   */
  travelBlock(game) {
    if (game.flight.active) return 'Süpürgedeyken hızlı yolculuk yapılamaz.';
    if (game.races.race || game.match?.active || (game.duel && game.duel.phase !== 'idle') || game.lessons.active) return 'Bir etkinliğin ortasındasın.';
    const pp = game.player.position;
    if (game.combat.enemies.some((e) => !e.dead && e.engaged && e.position.distanceTo(pp) < TRAVEL.dangerRange)) return 'Yakında düşman varken hızlı yolculuk yapılamaz.';
    if (game.player.dead) return 'Önce ayağa kalk.';
    return null;
  }

  serialize() {
    return { places: [...this.places], zones: [...this.zones] };
  }

  deserialize(d) {
    this.reset();
    if (!d) return;
    for (const k of d.places ?? []) if (typeof k === 'string') this.places.add(k);
    for (const k of d.zones ?? []) if (typeof k === 'string') this.zones.add(k);
  }
}
