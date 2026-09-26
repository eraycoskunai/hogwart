/**
 * @file MusicDirector — adaptive, generative score. Each mood (data/music.js)
 * is played bar by bar with a small look-ahead on the audio clock: the
 * bar's chord comes from the mood's progression (diatonic triads of its
 * scale); pads hold it, arpeggios and ostinatos walk its tones, the bass
 * marks the root, percussion follows its pattern and the melody strings
 * together original motifs placed on the chord, with rests for air.
 * Changing mood crossfades: the new mood starts at once, the old one
 * fades out and is dropped.
 */
import { MOODS, INSTRUMENTS, SCALES, MOTIFS, MUSIC } from '../data/music.js';

const A4 = 440;
const A4_MIDI = 69;
const midiHz = (m) => A4 * Math.pow(2, (m - A4_MIDI) / 12);

export class MusicDirector {
  /** @param {import('./AudioEngine.js').AudioEngine} engine */
  constructor(engine) {
    this.engine = engine;
    this.mood = null;
    /** Active players (the current mood and ones fading out). */
    this.players = [];
    this.notes = 0;
  }

  /** Switch to a mood (null = silence). */
  setMood(name) {
    if (name === this.mood) return;
    this.mood = name;
    const E = this.engine;
    if (!E.ready) return;
    const ctx = E.ctx;
    const now = ctx.currentTime;
    for (const p of this.players) {
      if (p.fading) continue;
      p.fading = true;
      p.gain.gain.setTargetAtTime(0, now, MUSIC.fade / 3);
      p.until = now + MUSIC.fade * 1.5;
    }
    if (!name) return;
    const M = MOODS[name];
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(M.gain * MUSIC.masterGain, now + MUSIC.fade * 0.6);
    gain.connect(E.buses.music);
    const send = ctx.createGain();
    send.gain.value = 0.35;
    gain.connect(send).connect(E.reverbIn);
    this.players.push({ name, M, gain, next: now + 0.1, bar: 0, melT: now + 0.1, queue: [], base: 0, fading: false, until: Infinity });
  }

  /** Called every frame: schedule ahead, drop faded players. */
  update() {
    const E = this.engine;
    if (!E.ready) return;
    // A mood chosen before audio unlocked starts now.
    if (this.mood && !this.players.some((p) => p.name === this.mood && !p.fading)) {
      const m = this.mood;
      this.mood = null;
      this.setMood(m);
    }
    const now = E.ctx.currentTime;
    for (const p of this.players) {
      if (p.fading) continue;
      // Catch up after a stall (background tab) without a burst of notes.
      if (p.next < now - 1) {
        p.next = now + 0.05;
        p.melT = p.next;
      }
      while (p.next < now + MUSIC.lookahead) this._bar(p);
    }
    this.players = this.players.filter((p) => {
      if (p.until > now) return true;
      p.gain.disconnect();
      return false;
    });
  }

  /** Note frequency for a scale degree (can exceed an octave) and octave shift. */
  _freq(M, deg, octave) {
    const S = SCALES[M.scale];
    const o = Math.floor(deg / S.length);
    const d = ((deg % S.length) + S.length) % S.length;
    return midiHz(M.root + S[d] + 12 * (o + octave));
  }

  _bar(p) {
    const M = p.M;
    const E = this.engine;
    const spb = 60 / M.tempo;
    const barLen = M.beats * spb;
    const t = p.next;
    const deg = M.progression[p.bar % M.progression.length];
    const chord = [deg, deg + 2, deg + 4, deg + 7];
    for (const L of M.layers) {
      const inst = INSTRUMENTS[L.inst];
      const g = L.gain;
      switch (L.kind) {
        case 'pad':
          for (let i = 0; i < 3; i++) this._note(inst, this._freq(M, chord[i], L.octave), t, barLen * 0.96, g * 0.5, p);
          break;
        case 'arp':
        case 'ostinato': {
          const step = L.every * spb;
          for (let i = 0; t + i * step < t + barLen - 1e-4; i++) {
            const tone = chord[L.steps[i % L.steps.length] % chord.length];
            this._note(inst, this._freq(M, tone, L.octave), t + i * step, step * 0.9, g * (i % M.beats === 0 ? 1 : 0.8), p);
          }
          break;
        }
        case 'bass':
          for (const b of L.hits) this._note(inst, this._freq(M, deg, L.octave), t + b * spb, spb * 0.9, g, p);
          break;
        case 'perc':
          for (const [b, drum, v] of L.hits) {
            E.drum(drum, t + b * spb, g * v, p.gain);
            this.notes++;
          }
          break;
        case 'melody':
          this._melody(p, L, inst, t + barLen, deg, spb);
          break;
        default:
          break;
      }
    }
    p.next = t + barLen;
    p.bar++;
  }

  /** Continue the melody up to `until`, starting new motifs on the current chord. */
  _melody(p, L, inst, until, deg, spb) {
    const M = p.M;
    const set = MOTIFS[L.motifs];
    while (p.melT < until) {
      if (!p.queue.length) {
        if (Math.random() < (L.rest ?? 0)) {
          p.melT += M.beats * spb;
          continue;
        }
        p.queue = [...set[Math.floor(Math.random() * set.length)]];
        p.base = deg;
        // Occasional variation: lift the phrase by a third.
        if (Math.random() < 0.25) p.base += 2;
      }
      const [steps, beats] = p.queue.shift();
      const dur = beats * spb;
      if (steps !== null) this._note(inst, this._freq(M, p.base + steps, L.octave), p.melT, dur * 0.92, L.gain * 0.9, p);
      p.melT += dur;
    }
  }

  _note(inst, freq, t, hold, gain, p) {
    this.engine.note(inst, freq, t, hold, gain, p.gain);
    this.notes++;
  }

  get stats() {
    const p = this.players.find((x) => !x.fading);
    return { Müzik: p ? `${p.name} · ölçü ${p.bar} · ${p.M.tempo} bpm · nota ${this.notes}` : this.mood ? `${this.mood} (ses bekleniyor)` : 'sessiz' };
  }

  stop() {
    this.setMood(null);
  }
}
