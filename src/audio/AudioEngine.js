/**
 * @file AudioEngine — the Web Audio mixer. The context is created on the
 * first user gesture (browsers block audio before that, and creating it
 * early logs warnings); until then every call is a silent no-op.
 *
 * Graph: sources → per-voice gain (→ HRTF panner) → bus (music, sfx,
 * ambience, voice, ui) → master → compressor → speakers, with a reverb
 * send per voice into a convolver whose impulse response is generated
 * for the current region (long stone halls inside, short and airy
 * outdoors). Music and ambience pass through duck gains (dialogue, pause).
 * One-shot voices are pooled and the oldest are cut past the limit.
 */
import { makeNoise, playRecipe, playNote } from './Synth.js';
import { SOUNDS, LOOPS, AUDIO } from '../data/sounds.js';
import { DRUMS } from '../data/music.js';

const BUSES = ['music', 'sfx', 'ambience', 'voice', 'ui'];

export class AudioEngine {
  /**
   * @param {import('../core/EventBus.js').EventBus} bus
   * @param {import('../core/Settings.js').Settings} settings
   */
  constructor(bus, settings) {
    this.bus = bus;
    this.settings = settings;
    /** @type {AudioContext|null} */
    this.ctx = null;
    this.voices = [];
    this.loops = new Set();
    this.region = 'default';
    this.played = 0;
    this._unlock = () => this.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, this._unlock, { capture: true });
    this._offSettings = bus.on('settings:changed', ({ key }) => key === 'volume' && this.applyVolumes());
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Create / resume the context (inside a user gesture). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.noise = makeNoise(ctx);
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(this.comp);
    this.buses = {};
    this.duck = {};
    for (const b of BUSES) {
      const g = ctx.createGain();
      if (b === 'music' || b === 'ambience') {
        const d = ctx.createGain();
        g.connect(d).connect(this.master);
        this.duck[b] = d;
      } else g.connect(this.master);
      this.buses[b] = g;
    }
    this.reverb = ctx.createConvolver();
    this.reverbIn = ctx.createGain();
    this.reverbOut = ctx.createGain();
    this.reverbIn.connect(this.reverb).connect(this.reverbOut).connect(this.master);
    this.setRegion(this.region);
    this.applyVolumes();
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(ev, this._unlock, { capture: true });
    // Resume after tab switches.
    this._vis = () => {
      if (!document.hidden && ctx.state === 'suspended') ctx.resume();
    };
    document.addEventListener('visibilitychange', this._vis);
    this.bus.emit('audio:ready', {});
  }

  applyVolumes() {
    if (!this.ctx) return;
    const v = this.settings.get('volume');
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(v.master, t, 0.05);
    this.buses.music.gain.setTargetAtTime(v.music, t, 0.05);
    this.buses.sfx.gain.setTargetAtTime(v.sfx, t, 0.05);
    this.buses.ui.gain.setTargetAtTime(v.sfx, t, 0.05);
    this.buses.ambience.gain.setTargetAtTime(v.ambience, t, 0.05);
    this.buses.voice.gain.setTargetAtTime(v.voice, t, 0.05);
  }

  /** Music / ambience ducking (0…1 multiplier). */
  setDuck(music, ambience) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.duck.music.gain.setTargetAtTime(music, t, 0.3);
    this.duck.ambience.gain.setTargetAtTime(ambience, t, 0.3);
  }

  /** Reverb for a region: a fresh decaying-noise impulse response. */
  setRegion(id) {
    this.region = id;
    if (!this.ctx) return;
    const [len, power, wet] = AUDIO.reverb[id] ?? AUDIO.reverb.default;
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * len);
    const ir = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, power);
    }
    this.reverb.buffer = ir;
    this.reverbOut.gain.setTargetAtTime(wet, ctx.currentTime, 0.2);
  }

  /** Follow the camera. @param {THREE.Camera} camera */
  setListener(camera) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const p = camera.position;
    const e = camera.matrixWorld.elements;
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(p.x, t, 0.02);
      L.positionY.setTargetAtTime(p.y, t, 0.02);
      L.positionZ.setTargetAtTime(p.z, t, 0.02);
      L.forwardX.setTargetAtTime(-e[8], t, 0.02);
      L.forwardY.setTargetAtTime(-e[9], t, 0.02);
      L.forwardZ.setTargetAtTime(-e[10], t, 0.02);
      L.upX.setTargetAtTime(e[4], t, 0.02);
      L.upY.setTargetAtTime(e[5], t, 0.02);
      L.upZ.setTargetAtTime(e[6], t, 0.02);
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6]);
    }
  }

  /** Per-voice output: gain → (panner) → bus, plus reverb send. */
  _out(recipe, o) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = o.gain ?? 1;
    let node = g;
    if (o.pos) {
      const pn = ctx.createPanner();
      pn.panningModel = 'HRTF';
      pn.distanceModel = 'inverse';
      pn.refDistance = recipe.ref ?? AUDIO.ref;
      pn.maxDistance = AUDIO.maxDistance;
      pn.rolloffFactor = AUDIO.rolloff;
      if (pn.positionX) {
        pn.positionX.value = o.pos.x;
        pn.positionY.value = o.pos.y;
        pn.positionZ.value = o.pos.z;
      } else pn.setPosition(o.pos.x, o.pos.y, o.pos.z);
      g.connect(pn);
      node = pn;
    }
    node.connect(this.buses[o.bus ?? recipe.bus ?? 'sfx']);
    const send = (recipe.send ?? 0) * (o.send ?? 1);
    if (send > 0) {
      const s = ctx.createGain();
      s.gain.value = send;
      node.connect(s).connect(this.reverbIn);
    }
    return { g, node };
  }

  /**
   * Play a one-shot effect.
   * @param {string|any} name SOUNDS key or recipe
   * @param {{pos?:{x:number,y:number,z:number}, bus?:string, gain?:number, pitch?:number, delay?:number, send?:number}} [o]
   */
  play(name, o = {}) {
    if (!this.ready) return null;
    const recipe = typeof name === 'string' ? SOUNDS[name] : name;
    if (!recipe) return null;
    const ctx = this.ctx;
    const t = ctx.currentTime + (o.delay ?? 0);
    const out = this._out(recipe, o);
    const pitch = (o.pitch ?? 1) * (1 + (Math.random() * 2 - 1) * (recipe.jitter ?? 0));
    const v = playRecipe(ctx, this.noise, recipe, t, pitch, out.g);
    const voice = { ...v, out, t };
    this.voices.push(voice);
    this.played++;
    // Voice limit: cut the oldest.
    while (this.voices.length > AUDIO.voices) this.voices.shift().stop(ctx.currentTime, 0.05);
    return voice;
  }

  /**
   * Start a looping bed; returns a handle for live control.
   * @param {string} name LOOPS key
   */
  loop(name, o = {}) {
    if (!this.ready) return null;
    const recipe = LOOPS[name];
    const ctx = this.ctx;
    const out = this._out(recipe, { ...o, gain: 0 });
    const v = playRecipe(ctx, this.noise, recipe, ctx.currentTime, o.pitch ?? 1, out.g);
    const h = {
      name,
      /** Target level 0…1 (smoothed). */
      set: (gain, tc = 0.3) => out.g.gain.setTargetAtTime(gain, ctx.currentTime, tc),
      /** Shift every layer's filter (multiplier of the recipe frequency). */
      filter: (k) => v.layers.forEach((l, i) => l.filter && l.filter.frequency.setTargetAtTime(recipe.layers[i]?.filter?.f[0] * k, ctx.currentTime, 0.1)),
      pos: (p) => {
        const pn = out.node;
        if (pn.positionX) {
          pn.positionX.setTargetAtTime(p.x, ctx.currentTime, 0.05);
          pn.positionY.setTargetAtTime(p.y, ctx.currentTime, 0.05);
          pn.positionZ.setTargetAtTime(p.z, ctx.currentTime, 0.05);
        }
      },
      stop: (fade = 0.5) => {
        out.g.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
        v.stop(ctx.currentTime + fade, 0.05);
        this.loops.delete(h);
      },
    };
    if (o.gain !== undefined) h.set(o.gain, o.fadeIn ?? 1);
    this.loops.add(h);
    return h;
  }

  /** Music: an instrument note into `out` (a music-bus node). */
  note(inst, freq, t, hold, gain, out) {
    return playNote(this.ctx, this.noise, inst, freq, t, hold, gain, out);
  }

  /** Music: a drum hit. */
  drum(name, t, gain, out) {
    const r = DRUMS[name];
    const g = this.ctx.createGain();
    g.gain.value = gain;
    g.connect(out);
    return playRecipe(this.ctx, this.noise, r, t, 1, g).end;
  }

  /** Drop finished voices (call each frame). */
  update() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.voices.length && this.voices[0].end < now) this.voices = this.voices.filter((v) => v.end >= now);
  }

  /** Stop all one-shots and loops (region change). */
  stopAll() {
    if (!this.ctx) return;
    for (const v of this.voices) v.stop(this.ctx.currentTime, 0.1);
    this.voices = [];
    for (const h of [...this.loops]) h.stop(0.3);
  }

  get stats() {
    if (!this.ctx) return { Ses: 'kapalı (ilk tıklamayı bekliyor)' };
    return {
      Ses: `${this.ctx.state} · ${this.ctx.sampleRate} Hz · gecikme ${((this.ctx.baseLatency ?? 0) * 1000).toFixed(0)} ms`,
      'Sesler (anlık / döngü / toplam)': `${this.voices.length} / ${this.loops.size} / ${this.played}`,
      Yankı: this.region,
    };
  }

  dispose() {
    this.stopAll();
    this._offSettings();
    document.removeEventListener('visibilitychange', this._vis);
    this.ctx?.close();
  }
}
