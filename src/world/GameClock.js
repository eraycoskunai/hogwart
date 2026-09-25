/**
 * @file GameClock — in-game time and calendar. One game day lasts
 * CLOCK.dayLengthSeconds real seconds. Provides hour, date, season, moon
 * phase and astronomical sun / moon directions for the Scottish latitude.
 *
 * Emits `clock:hour` (whole hour changes) and `clock:day`.
 */
import * as THREE from 'three';
import { CLOCK, MONTH_NAMES, SEASONS } from '../data/atmosphere.js';

const HOURS_PER_DAY = 24;
const DAYS_PER_YEAR = 365;
const MS_PER_DAY = 86400000;

export class GameClock {
  /** @param {import('../core/EventBus.js').EventBus} bus */
  constructor(bus) {
    this.bus = bus;
    /** Total elapsed game days since the school year started (fractional). */
    this.days = CLOCK.startHour / HOURS_PER_DAY;
    /** Multiplier on the normal passage of time (debug / sleeping). */
    this.speed = 1;
    this.paused = false;
    this._lastHour = Math.floor(this.hour);
    this._lastDay = Math.floor(this.days);
    this.sunDirection = new THREE.Vector3();
    this.moonDirection = new THREE.Vector3();
    this._start = Date.UTC(CLOCK.year, CLOCK.startMonth, CLOCK.startDayOfMonth);
    this._updateCelestial();
  }

  /** Hour of day, 0..24. */
  get hour() {
    return (this.days - Math.floor(this.days)) * HOURS_PER_DAY;
  }

  /** @param {number} h */
  setHour(h) {
    this.days = Math.floor(this.days) + (((h % 24) + 24) % 24) / HOURS_PER_DAY;
    this._updateCelestial();
  }

  /** Calendar date for the current game day. */
  get date() {
    return new Date(this._start + Math.floor(this.days) * MS_PER_DAY);
  }

  get month() {
    return this.date.getUTCMonth();
  }

  get season() {
    return SEASONS[this.month];
  }

  /** Day of the (calendar) year, 0..364. */
  get dayOfYear() {
    const d = this.date;
    return Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / MS_PER_DAY);
  }

  /** 0 = new moon, 0.5 = full moon. */
  get moonPhase() {
    const p = CLOCK.moonPhaseAtStart + this.days / CLOCK.synodicMonth;
    return p - Math.floor(p);
  }

  /** "3 Eylül · 09:30" */
  format() {
    const d = this.date;
    const h = this.hour;
    const hh = String(Math.floor(h)).padStart(2, '0');
    const mm = String(Math.floor((h % 1) * 60)).padStart(2, '0');
    return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} · ${hh}:${mm}`;
  }

  /** Game hours that pass per real second at speed 1. */
  get hoursPerSecond() {
    return HOURS_PER_DAY / CLOCK.dayLengthSeconds;
  }

  /**
   * Advance by real seconds.
   * @param {number} dt
   * @returns {number} game hours advanced
   */
  update(dt) {
    if (this.paused) return 0;
    const dh = dt * this.hoursPerSecond * this.speed;
    this.days += dh / HOURS_PER_DAY;
    const hour = Math.floor(this.hour);
    if (hour !== this._lastHour) {
      this._lastHour = hour;
      this.bus.emit('clock:hour', { hour, clock: this });
    }
    const day = Math.floor(this.days);
    if (day !== this._lastDay) {
      this._lastDay = day;
      this.bus.emit('clock:day', { day, clock: this });
    }
    this._updateCelestial();
    return dh;
  }

  /**
   * Sun and moon directions (unit vectors toward them). World axes:
   * +X east, +Y up, -Z north.
   */
  _updateCelestial() {
    const lat = CLOCK.latitude;
    const decl = CLOCK.axialTilt * Math.sin((2 * Math.PI * (284 + this.dayOfYear)) / DAYS_PER_YEAR);
    const H = ((this.hour - CLOCK.solarNoon) / 24) * Math.PI * 2;
    setSky(this.sunDirection, lat, decl, H);
    // The moon trails the sun by its phase angle and sits on the opposite declination at full moon.
    const phaseAngle = this.moonPhase * Math.PI * 2;
    setSky(this.moonDirection, lat, decl * Math.cos(phaseAngle), H - phaseAngle);
  }

  /** Sun elevation in degrees. */
  get sunElevation() {
    return THREE.MathUtils.radToDeg(Math.asin(this.sunDirection.y));
  }

  serialize() {
    return { days: this.days };
  }

  /** @param {{days:number}} d */
  deserialize(d) {
    if (d && Number.isFinite(d.days)) {
      this.days = d.days;
      this._lastHour = Math.floor(this.hour);
      this._lastDay = Math.floor(this.days);
      this._updateCelestial();
    }
  }
}

/** Direction to a body with declination `decl` at hour angle `H`. */
function setSky(out, lat, decl, H) {
  const east = -Math.cos(decl) * Math.sin(H);
  const north = Math.sin(decl) * Math.cos(lat) - Math.cos(decl) * Math.cos(H) * Math.sin(lat);
  const up = Math.sin(decl) * Math.sin(lat) + Math.cos(decl) * Math.cos(H) * Math.cos(lat);
  out.set(east, up, -north).normalize();
}
