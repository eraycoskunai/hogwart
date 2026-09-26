/**
 * @file FlightHUD — broom overlay: speed (km/h), altitude and the boost
 * stamina bar while flying; during a race the timer, ring count, medal
 * targets, best time and an arrow / marker toward the next ring; during
 * Quidditch the scoreboard, match clock and a marker on the Golden Snitch
 * when it is in view; countdowns and result banners. Pure DOM.
 */
import * as THREE from 'three';
import { fmt } from '../gameplay/flight/RaceManager.js';
import { RACE_RULES } from '../data/flight.js';

/** m/s → km/h. */
const KMH = 3.6;
/** Banner time (s). */
const BANNER = 3.2;
/** Screen margin (px) for off-screen markers. */
const EDGE = 48;
const _v = new THREE.Vector3();
const _c = new THREE.Vector3();

export class FlightHUD {
  /**
   * @param {HTMLElement} root
   * @param {import('../core/EventBus.js').EventBus} bus
   */
  constructor(root, bus) {
    const el = document.createElement('div');
    el.className = 'flight-hud';
    el.innerHTML = `
      <div class="fl-gauge"><b class="fl-speed">0</b><small>km/sa</small><div class="fl-alt"></div><div class="fl-boost"><i></i></div><div class="fl-broom"></div></div>
      <div class="fl-race"><div class="fl-race-name"></div><div class="fl-race-time"></div><div class="fl-race-info"></div></div>
      <div class="fl-score"><span class="fl-team a"></span><b class="fl-pts"></b><span class="fl-team b"></span><small class="fl-clock"></small></div>
      <div class="fl-marker"><div class="fl-arrow"></div><span></span></div>
      <div class="fl-count"></div>
      <div class="fl-banner"></div>`;
    root.appendChild(el);
    const q = (s) => /** @type {HTMLElement} */ (el.querySelector(s));
    this.el = {
      root: el, gauge: q('.fl-gauge'), speed: q('.fl-speed'), alt: q('.fl-alt'), boost: q('.fl-boost i'), broom: q('.fl-broom'),
      race: q('.fl-race'), raceName: q('.fl-race-name'), raceTime: q('.fl-race-time'), raceInfo: q('.fl-race-info'),
      score: q('.fl-score'), teamA: q('.fl-team.a'), teamB: q('.fl-team.b'), pts: q('.fl-pts'), clock: q('.fl-clock'),
      marker: q('.fl-marker'), arrow: q('.fl-arrow'), markerText: q('.fl-marker span'), count: q('.fl-count'), banner: q('.fl-banner'),
    };
    this._banner = 0;
    this._count = 0;
    const banner = (t, kind) => this.banner(t, kind);
    this._off = [
      bus.on('race:countdown', ({ n }) => this.countdown(n)),
      bus.on('quidditch:countdown', ({ n }) => this.countdown(n)),
      bus.on('race:finish', ({ time, medal, reward, best }) => banner(`${fmt(time)} — ${medal >= 0 ? `${RACE_RULES.medalNames[medal]} madalya` : 'madalya yok'}${best === time ? ' · yeni rekor!' : ''}${reward ? ` · +${reward} G` : ''}`, medal === 0 ? 'gold' : '')),
      bus.on('race:abort', ({ reason }) => banner(reason, 'bad')),
      bus.on('quidditch:goal', ({ house }) => banner(`GOL! ${house} +10`, '')),
      bus.on('quidditch:save', () => banner('Kaleci kurtardı!', '')),
      bus.on('quidditch:snitch', () => banner('Altın Top ortaya çıktı!', 'gold')),
      bus.on('quidditch:bludger', ({ hit }) => banner(hit ? 'Bludger çarptı!' : 'Bludger\'dan kaçtın!', hit ? 'bad' : '')),
      bus.on('quidditch:end', ({ won, text, scores, teams }) => banner(`${text} ${teams[0]} ${scores[0]} – ${scores[1]} ${teams[1]} · ${won ? 'Kazandın!' : 'Kaybettin.'}`, won ? 'gold' : 'bad')),
      bus.on('flight:crash', ({ damage }) => damage > 8 && banner('Çarptın!', 'bad')),
    ];
  }

  banner(text, kind = '') {
    const b = this.el.banner;
    b.textContent = text;
    b.dataset.kind = kind;
    b.classList.add('show');
    this._banner = BANNER;
  }

  countdown(n) {
    const c = this.el.count;
    c.textContent = n > 0 ? String(n) : 'Uç!';
    c.classList.remove('show');
    void c.offsetWidth;
    c.classList.add('show');
    this._count = 0.9;
  }

  /** Place the marker at a world point (clamped to the screen edge when off-screen). */
  _mark(point, label, s, color) {
    const m = this.el.marker;
    _v.copy(point).project(s.camera);
    const behind = _v.z > 1;
    let x = _v.x;
    let y = _v.y;
    if (behind) {
      x = -x;
      y = -y;
    }
    const off = behind || Math.abs(x) > 1 || Math.abs(y) > 1;
    const hw = s.width / 2;
    const hh = s.height / 2;
    let px = hw + x * hw;
    let py = hh - y * hh;
    if (off) {
      // Push to the edge along the direction from the centre.
      const dx = px - hw;
      const dy = py - hh;
      const k = Math.min((hw - EDGE) / Math.max(1e-3, Math.abs(dx)), (hh - EDGE) / Math.max(1e-3, Math.abs(dy)));
      px = hw + dx * k;
      py = hh + dy * k;
    }
    m.style.display = 'block';
    m.style.transform = `translate(${px}px, ${py}px)`;
    m.style.setProperty('--c', color);
    m.classList.toggle('off', off);
    this.el.arrow.style.transform = off ? `rotate(${Math.atan2(py - hh, px - hw)}rad)` : '';
    this.el.markerText.textContent = label;
  }

  /**
   * @param {number} dt
   * @param {{flight:any, race:any, match:any, camera:THREE.Camera, width:number, height:number, player:any}} s
   */
  update(dt, s) {
    if (this._banner > 0 && (this._banner -= dt) <= 0) this.el.banner.classList.remove('show');
    if (this._count > 0 && (this._count -= dt) <= 0) this.el.count.classList.remove('show');
    const f = s.flight;
    const flying = f.active;
    this.el.gauge.classList.toggle('show', flying);
    if (flying) {
      const v = f.velocity.length();
      this.el.speed.textContent = String(Math.round(v * KMH));
      this.el.alt.textContent = `irtifa ${Math.round(s.player.position.y)} m`;
      this.el.boost.style.transform = `scaleX(${f.stamina / 100})`;
      this.el.boost.parentElement.classList.toggle('on', f.boosting);
      this.el.broom.textContent = f.spec.name;
    }
    let marked = false;
    const r = s.race;
    this.el.race.classList.toggle('show', !!r);
    if (r) {
      this.el.raceName.textContent = r.name;
      this.el.raceTime.textContent = fmt(r.time);
      const medal = r.medals.findIndex((m) => r.time <= m);
      const target = medal >= 0 ? `${RACE_RULES.medalNames[medal]} için ${fmt(r.medals[medal])}` : 'madalya süresi geçti';
      this.el.raceInfo.textContent = `Halka ${r.ring}/${r.rings} · ${target}${r.best ? ` · rekor ${fmt(r.best)}` : ''}`;
      if (r.next && !r.countdown) {
        this._mark(r.next, `${Math.round(_c.copy(r.next).distanceTo(s.player.position))} m`, s, '#ffd35a');
        marked = true;
      }
    }
    const m = s.match;
    this.el.score.classList.toggle('show', !!m);
    if (m) {
      this.el.teamA.textContent = m.teams[0];
      this.el.teamB.textContent = m.teams[1];
      this.el.teamA.style.background = m.colors[0];
      this.el.teamB.style.background = m.colors[1];
      this.el.pts.textContent = `${m.scores[0]} – ${m.scores[1]}`;
      this.el.clock.textContent = fmt(m.time);
      if (m.snitch && m.phase === 'play') {
        const d = _c.copy(m.snitch).distanceTo(s.player.position);
        // Only when roughly in view or close: the Snitch has to be found.
        _v.copy(m.snitch).project(s.camera);
        if (d < 90 && (d < 25 || (_v.z < 1 && Math.abs(_v.x) < 1 && Math.abs(_v.y) < 1))) {
          this._mark(m.snitch, `Altın Top · ${Math.round(d)} m`, s, '#ffe28a');
          marked = true;
        }
      }
    }
    if (!marked) this.el.marker.style.display = 'none';
  }

  dispose() {
    for (const off of this._off) off();
    this.el.root.remove();
  }
}
