/**
 * @file Voice — characters speak. Default is a synthetic "babble" that
 * follows the real Turkish text: every vowel becomes a syllable voiced by
 * a buzzy source through two formant filters tuned to that vowel (a, e,
 * ı, i, o, ö, u, ü), preceded by a short consonant hiss, with a pitch
 * that belongs to the speaker (from their name) and a gentle intonation
 * fall toward the end of the line (rising for questions). Optionally the
 * browser's own Turkish speech synthesis reads the line instead.
 *
 * Settings: speech = 'babble' | 'tts' | 'off'.
 */
import { VOICE } from '../data/music.js';

const VOWELS = new Set(Object.keys(VOICE.formants));

/** Stable 0…1 hash of a name. */
function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export class Voice {
  /**
   * @param {import('./AudioEngine.js').AudioEngine} engine
   * @param {import('../core/Settings.js').Settings} settings
   */
  constructor(engine, settings) {
    this.engine = engine;
    this.settings = settings;
    this.spoken = 0;
    this._busyUntil = new Map();
  }

  get mode() {
    return this.settings.get('speech') ?? 'babble';
  }

  /**
   * Speak a line.
   * @param {string} speaker name (sets the voice)
   * @param {string} text
   * @param {{pos?:{x:number,y:number,z:number}, rate?:number}} [o]
   */
  speak(speaker, text, o = {}) {
    const mode = this.mode;
    if (mode === 'off' || !text) return;
    if (mode === 'tts' && this._tts(speaker, text, o)) return;
    this._babble(speaker, text, o);
  }

  _tts(speaker, text, o) {
    const S = window.speechSynthesis;
    if (!S || typeof SpeechSynthesisUtterance === 'undefined') return false;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = VOICE.lang;
    const voice = S.getVoices().find((v) => v.lang?.toLowerCase().startsWith('tr'));
    if (voice) u.voice = voice;
    const k = hash01(speaker);
    u.pitch = 0.7 + k * 0.8;
    u.rate = (o.rate ?? 1) * (0.95 + k * 0.15);
    u.volume = this.settings.get('volume').voice * this.settings.get('volume').master;
    S.cancel();
    S.speak(u);
    this.spoken++;
    return true;
  }

  _babble(speaker, text, o) {
    const E = this.engine;
    if (!E.ready) return;
    const ctx = E.ctx;
    const now = ctx.currentTime;
    // One line at a time per speaker.
    const busy = this._busyUntil.get(speaker) ?? 0;
    const t0 = Math.max(now + 0.02, busy);
    const vowels = [...text.toLocaleLowerCase('tr-TR')].filter((c) => VOWELS.has(c)).slice(0, VOICE.maxSyllables);
    if (!vowels.length) return;
    const k = hash01(speaker);
    const [p0, p1] = VOICE.pitch;
    const base = p0 + k * (p1 - p0);
    const question = text.trim().endsWith('?');
    const syl = 1 / (VOICE.rate * (o.rate ?? 1) * (0.9 + k * 0.2));
    const out = E._out({ ref: 4, send: 0.25 }, { pos: o.pos, bus: 'voice', gain: VOICE.gain });
    const src = ctx.createOscillator();
    src.type = 'sawtooth';
    const f1 = ctx.createBiquadFilter();
    const f2 = ctx.createBiquadFilter();
    f1.type = f2.type = 'bandpass';
    f1.Q.value = 6;
    f2.Q.value = 9;
    const g1 = ctx.createGain();
    const g2 = ctx.createGain();
    g2.gain.value = 0.6;
    const env = ctx.createGain();
    env.gain.value = 0;
    src.connect(f1).connect(g1).connect(env);
    src.connect(f2).connect(g2).connect(env);
    env.connect(out.g);
    const hiss = ctx.createBufferSource();
    hiss.buffer = E.noise.white;
    hiss.loop = true;
    const hf = ctx.createBiquadFilter();
    hf.type = 'highpass';
    hf.frequency.value = 3500;
    const hg = ctx.createGain();
    hg.gain.value = 0;
    hiss.connect(hf).connect(hg).connect(out.g);
    let t = t0;
    vowels.forEach((v, i) => {
      const [F1, F2] = VOICE.formants[v];
      const x = i / Math.max(1, vowels.length - 1);
      // Intonation: slight arch, falling at the end (or rising for a question).
      const tune = 1 + Math.sin(x * Math.PI) * 0.08 + (question ? x * x * 0.25 : -x * x * 0.12) + (Math.random() - 0.5) * 0.06;
      const len = syl * (0.8 + Math.random() * 0.5);
      src.frequency.setTargetAtTime(base * tune, t, 0.02);
      f1.frequency.setTargetAtTime(F1, t, 0.015);
      f2.frequency.setTargetAtTime(F2, t, 0.015);
      const [cl, cg] = VOICE.consonant;
      if (Math.random() < 0.7) {
        hg.gain.setValueAtTime(cg, t);
        hg.gain.setTargetAtTime(0, t + cl * 0.4, cl * 0.3);
      }
      env.gain.setTargetAtTime(1, t + cl * 0.5, 0.015);
      env.gain.setTargetAtTime(0, t + len * 0.75, 0.02);
      t += len;
      // Pause at punctuation-free word gaps now and then.
      if (i % 4 === 3 && Math.random() < 0.3) t += syl * 0.8;
    });
    src.start(t0);
    hiss.start(t0);
    src.stop(t + 0.1);
    hiss.stop(t + 0.1);
    this._busyUntil.set(speaker, t);
    this.spoken++;
  }

  /** Stop browser speech (dialogue closed, region change). */
  hush() {
    if (this.mode === 'tts') window.speechSynthesis?.cancel();
  }
}
