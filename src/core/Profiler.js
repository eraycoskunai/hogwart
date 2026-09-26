/**
 * @file Profiler — lightweight CPU timing of named frame sections
 * (begin / end pairs around each system). Keeps a smoothed average and the
 * last value per section; the debug panel lists the most expensive ones.
 * Costs two performance.now() calls per section.
 */
import { PROFILER } from '../data/perf.js';

export class Profiler {
  constructor() {
    /** @type {Map<string, {avg:number, last:number, t0:number}>} */
    this.sections = new Map();
    this.enabled = true;
  }

  /** @param {string} name */
  begin(name) {
    if (!this.enabled) return;
    let s = this.sections.get(name);
    if (!s) {
      s = { avg: 0, last: 0, t0: 0 };
      this.sections.set(name, s);
    }
    s.t0 = performance.now();
  }

  /** @param {string} name */
  end(name) {
    if (!this.enabled) return;
    const s = this.sections.get(name);
    if (!s) return;
    s.last = performance.now() - s.t0;
    s.avg += (s.last - s.avg) * PROFILER.smoothing;
  }

  /** Most expensive sections by average ms. @returns {[string, number][]} */
  top(n = PROFILER.topSections) {
    return [...this.sections].map(([k, s]) => /** @type {[string, number]} */ ([k, s.avg])).sort((a, b) => b[1] - a[1]).slice(0, n);
  }

  /** Average ms of one section (0 when unknown). */
  avg(name) {
    return this.sections.get(name)?.avg ?? 0;
  }

  reset() {
    this.sections.clear();
  }
}
