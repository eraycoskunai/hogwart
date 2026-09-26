/**
 * @file Sound recipes — every effect is synthesised from these (no audio
 * files). A recipe is a list of layers; each layer is one source shaped
 * by an envelope and an optional filter:
 *
 *   src     'sine' | 'square' | 'sawtooth' | 'triangle' | 'white' | 'pink' | 'brown'
 *   f       [start, end] Hz (oscillators; exponential glide over `dur`)
 *   dur     seconds (Infinity for loops, which run until stopped)
 *   a       attack seconds; the layer then decays exponentially to silence at `dur`
 *   g       peak gain
 *   delay   start offset (s)
 *   filter  { t: 'lowpass'|'highpass'|'bandpass'|'peaking', f: [start, end], q }
 *   vib     [rate Hz, depth cents]   (vibrato)
 *   am      [rate Hz, depth 0…1]     (tremolo)
 *   burst   { n, every: [min, max], pitch: [min, max] } — repeat the layer n
 *           times with random gaps and pitch (chitter, clinks, crackle)
 *
 * Recipe options: jitter (± fraction of pitch per play), send (reverb 0…1),
 * bus ('sfx' | 'ambience' | 'ui'), ref (distance at full volume, m).
 */

export const SOUNDS = Object.freeze({
  // ------------------------------------------------------------ movement
  stepStone: { jitter: 0.12, send: 0.35, layers: [
    { src: 'white', dur: 0.07, a: 0.002, g: 0.22, filter: { t: 'bandpass', f: [2600, 1800], q: 1.4 } },
    { src: 'sine', f: [180, 90], dur: 0.06, a: 0.002, g: 0.18 },
  ] },
  stepGrass: { jitter: 0.15, send: 0.1, layers: [
    { src: 'pink', dur: 0.14, a: 0.01, g: 0.2, filter: { t: 'bandpass', f: [1400, 900], q: 0.8 } },
  ] },
  stepWood: { jitter: 0.12, send: 0.3, layers: [
    { src: 'sine', f: [240, 120], dur: 0.09, a: 0.002, g: 0.25 },
    { src: 'white', dur: 0.05, a: 0.002, g: 0.1, filter: { t: 'bandpass', f: [1200, 800], q: 2 } },
  ] },
  stepMetal: { jitter: 0.1, send: 0.4, layers: [
    { src: 'triangle', f: [1250, 1180], dur: 0.18, a: 0.001, g: 0.08 },
    { src: 'white', dur: 0.05, a: 0.001, g: 0.12, filter: { t: 'highpass', f: [3000, 3000], q: 0.7 } },
  ] },
  stepWater: { jitter: 0.2, send: 0.15, layers: [
    { src: 'pink', dur: 0.22, a: 0.01, g: 0.25, filter: { t: 'bandpass', f: [900, 2400], q: 1.2 } },
    { src: 'sine', f: [500, 1100], dur: 0.08, a: 0.005, g: 0.06, delay: 0.03 },
  ] },
  jump: { jitter: 0.1, layers: [{ src: 'pink', dur: 0.2, a: 0.03, g: 0.14, filter: { t: 'bandpass', f: [600, 1600], q: 0.9 } }] },
  land: { jitter: 0.1, send: 0.2, layers: [
    { src: 'sine', f: [120, 45], dur: 0.25, a: 0.003, g: 0.45 },
    { src: 'brown', dur: 0.2, a: 0.004, g: 0.3, filter: { t: 'lowpass', f: [900, 200], q: 0.7 } },
  ] },
  roll: { jitter: 0.08, layers: [
    { src: 'pink', dur: 0.45, a: 0.08, g: 0.18, filter: { t: 'bandpass', f: [500, 1500], q: 0.8 } },
    { src: 'sine', f: [110, 60], dur: 0.2, a: 0.004, g: 0.3, delay: 0.3 },
  ] },
  splash: { jitter: 0.15, send: 0.2, layers: [
    { src: 'white', dur: 0.6, a: 0.005, g: 0.35, filter: { t: 'bandpass', f: [3000, 700], q: 0.7 } },
    { src: 'sine', f: [300, 900], dur: 0.12, a: 0.004, g: 0.08, burst: { n: 5, every: [0.03, 0.09], pitch: [0.7, 1.6] } },
  ] },
  swim: { jitter: 0.2, layers: [{ src: 'pink', dur: 0.4, a: 0.1, g: 0.14, filter: { t: 'bandpass', f: [700, 1500], q: 1 } }] },
  hurt: { jitter: 0.08, layers: [
    { src: 'sawtooth', f: [220, 150], dur: 0.22, a: 0.01, g: 0.14, filter: { t: 'bandpass', f: [700, 500], q: 3 } },
    { src: 'brown', dur: 0.15, a: 0.002, g: 0.3, filter: { t: 'lowpass', f: [700, 200], q: 0.7 } },
  ] },
  heal: { send: 0.5, layers: [{ src: 'sine', f: [660, 1320], dur: 0.8, a: 0.05, g: 0.12, burst: { n: 4, every: [0.08, 0.1], pitch: [1, 1.5] } }] },
  death: { send: 0.6, layers: [
    { src: 'sawtooth', f: [180, 40], dur: 2, a: 0.02, g: 0.14, filter: { t: 'lowpass', f: [900, 150], q: 1 } },
    { src: 'sine', f: [220, 110], dur: 2.4, a: 0.3, g: 0.1 },
  ] },

  // --------------------------------------------------------------- magic
  cast: { jitter: 0.08, send: 0.35, layers: [
    { src: 'pink', dur: 0.35, a: 0.03, g: 0.18, filter: { t: 'bandpass', f: [800, 4000], q: 1.1 } },
    { src: 'sine', f: [900, 1800], dur: 0.25, a: 0.01, g: 0.05, burst: { n: 3, every: [0.03, 0.06], pitch: [1, 1.8] } },
  ] },
  castFire: { jitter: 0.08, send: 0.3, layers: [
    { src: 'brown', dur: 0.6, a: 0.04, g: 0.4, filter: { t: 'lowpass', f: [400, 2600], q: 1.2 } },
    { src: 'white', dur: 0.05, a: 0.001, g: 0.08, filter: { t: 'highpass', f: [2500, 2500], q: 0.7 }, burst: { n: 8, every: [0.02, 0.07], pitch: [1, 1] } },
  ] },
  castIce: { jitter: 0.05, send: 0.55, layers: [
    { src: 'sine', f: [2200, 2600], dur: 0.5, a: 0.002, g: 0.07, burst: { n: 6, every: [0.03, 0.07], pitch: [0.8, 1.6] } },
    { src: 'white', dur: 0.4, a: 0.02, g: 0.1, filter: { t: 'highpass', f: [5000, 3000], q: 0.8 } },
  ] },
  castStun: { jitter: 0.06, send: 0.3, layers: [
    { src: 'square', f: [1400, 220], dur: 0.25, a: 0.002, g: 0.07, filter: { t: 'lowpass', f: [5000, 1500], q: 2 } },
    { src: 'pink', dur: 0.25, a: 0.01, g: 0.12, filter: { t: 'bandpass', f: [1500, 3000], q: 1 } },
  ] },
  castForce: { jitter: 0.06, send: 0.3, layers: [
    { src: 'sine', f: [160, 60], dur: 0.35, a: 0.004, g: 0.5 },
    { src: 'pink', dur: 0.35, a: 0.02, g: 0.2, filter: { t: 'bandpass', f: [2500, 500], q: 0.8 } },
  ] },
  castLight: { send: 0.6, layers: [
    { src: 'sine', f: [1320, 1320], dur: 0.9, a: 0.04, g: 0.07 },
    { src: 'sine', f: [1980, 1980], dur: 0.7, a: 0.08, g: 0.04 },
  ] },
  castPatronus: { send: 0.8, layers: [
    { src: 'sawtooth', f: [220, 220], dur: 3, a: 0.6, g: 0.05, filter: { t: 'bandpass', f: [700, 1000], q: 4 }, vib: [5, 12] },
    { src: 'sawtooth', f: [277, 277], dur: 3, a: 0.7, g: 0.04, filter: { t: 'bandpass', f: [1200, 900], q: 4 }, vib: [5.3, 12] },
    { src: 'sawtooth', f: [330, 330], dur: 3, a: 0.8, g: 0.04, filter: { t: 'bandpass', f: [900, 1300], q: 4 }, vib: [4.8, 12] },
    { src: 'sine', f: [1760, 1760], dur: 2, a: 0.02, g: 0.03, burst: { n: 8, every: [0.1, 0.25], pitch: [0.75, 1.5] } },
  ] },
  shieldUp: { send: 0.4, layers: [{ src: 'sine', f: [180, 360], dur: 0.5, a: 0.05, g: 0.14, am: [18, 0.4] }] },
  shieldHit: { jitter: 0.05, send: 0.5, layers: [
    { src: 'triangle', f: [880, 860], dur: 0.6, a: 0.001, g: 0.14 },
    { src: 'sine', f: [1320, 1300], dur: 0.4, a: 0.001, g: 0.07 },
  ] },
  parry: { send: 0.6, layers: [
    { src: 'triangle', f: [1760, 1740], dur: 0.9, a: 0.001, g: 0.14 },
    { src: 'sine', f: [2640, 2600], dur: 0.6, a: 0.001, g: 0.08 },
    { src: 'pink', dur: 0.3, a: 0.01, g: 0.14, filter: { t: 'bandpass', f: [3000, 800], q: 1 } },
  ] },
  impact: { jitter: 0.12, send: 0.3, layers: [
    { src: 'white', dur: 0.2, a: 0.001, g: 0.22, filter: { t: 'bandpass', f: [3000, 1200], q: 0.9 } },
    { src: 'sine', f: [300, 120], dur: 0.12, a: 0.002, g: 0.2 },
  ] },
  impactIce: { jitter: 0.1, send: 0.5, layers: [
    { src: 'triangle', f: [3000, 2800], dur: 0.35, a: 0.001, g: 0.06, burst: { n: 9, every: [0.01, 0.04], pitch: [0.6, 1.8] } },
    { src: 'white', dur: 0.25, a: 0.001, g: 0.15, filter: { t: 'highpass', f: [4000, 2000], q: 0.7 } },
  ] },
  explosion: { jitter: 0.1, send: 0.6, ref: 6, layers: [
    { src: 'brown', dur: 1.8, a: 0.004, g: 0.9, filter: { t: 'lowpass', f: [2400, 120], q: 0.8 } },
    { src: 'sine', f: [110, 30], dur: 1, a: 0.002, g: 0.7 },
    { src: 'white', dur: 0.08, a: 0.001, g: 0.08, filter: { t: 'highpass', f: [2000, 2000], q: 0.7 }, burst: { n: 12, every: [0.03, 0.12], pitch: [1, 1] }, delay: 0.1 },
  ] },
  fizzle: { jitter: 0.15, layers: [{ src: 'white', dur: 0.3, a: 0.01, g: 0.08, filter: { t: 'highpass', f: [3000, 7000], q: 0.7 } }] },
  breakWood: { jitter: 0.15, send: 0.3, layers: [
    { src: 'white', dur: 0.05, a: 0.001, g: 0.3, filter: { t: 'bandpass', f: [1800, 900], q: 1.5 }, burst: { n: 6, every: [0.01, 0.05], pitch: [0.7, 1.3] } },
    { src: 'sine', f: [200, 70], dur: 0.3, a: 0.002, g: 0.35 },
  ] },
  repair: { send: 0.6, layers: [{ src: 'sine', f: [440, 1760], dur: 1.1, a: 0.4, g: 0.08, burst: { n: 5, every: [0.12, 0.18], pitch: [1, 1.5] } }] },
  combo: { send: 0.6, layers: [{ src: 'triangle', f: [660, 660], dur: 0.5, a: 0.005, g: 0.1, burst: { n: 3, every: [0.07, 0.07], pitch: [1, 1.5] } }] },
  levelUp: { bus: 'ui', send: 0.5, layers: [{ src: 'triangle', f: [523, 523], dur: 0.7, a: 0.005, g: 0.12, burst: { n: 4, every: [0.09, 0.09], pitch: [1, 2] } }] },

  // ------------------------------------------------------------- combat
  telegraph: { send: 0.3, layers: [{ src: 'sawtooth', f: [110, 330], dur: 0.8, a: 0.4, g: 0.06, filter: { t: 'lowpass', f: [400, 1800], q: 5 } }] },
  enemyHurt: { jitter: 0.15, layers: [{ src: 'brown', dur: 0.18, a: 0.002, g: 0.35, filter: { t: 'lowpass', f: [900, 200], q: 1 } }] },
  enemyDie: { jitter: 0.1, send: 0.5, layers: [{ src: 'sawtooth', f: [200, 50], dur: 0.9, a: 0.01, g: 0.12, filter: { t: 'lowpass', f: [1200, 200], q: 2 } }] },
  stagger: { send: 0.6, layers: [{ src: 'sine', f: [1568, 1568], dur: 0.5, a: 0.002, g: 0.06, burst: { n: 5, every: [0.08, 0.14], pitch: [0.8, 1.3] } }] },
  finisher: { send: 0.8, ref: 8, layers: [
    { src: 'sawtooth', f: [110, 110], dur: 2, a: 0.02, g: 0.12, filter: { t: 'lowpass', f: [3000, 300], q: 1 } },
    { src: 'sawtooth', f: [165, 165], dur: 2, a: 0.02, g: 0.1, filter: { t: 'lowpass', f: [3000, 300], q: 1 } },
    { src: 'brown', dur: 1.5, a: 0.003, g: 0.7, filter: { t: 'lowpass', f: [1800, 100], q: 0.7 } },
  ] },
  trollRoar: { jitter: 0.08, send: 0.4, ref: 8, layers: [
    { src: 'sawtooth', f: [90, 70], dur: 1.4, a: 0.1, g: 0.25, filter: { t: 'bandpass', f: [500, 350], q: 2 }, vib: [7, 40] },
    { src: 'brown', dur: 1.2, a: 0.1, g: 0.3, filter: { t: 'lowpass', f: [600, 300], q: 1 } },
  ] },
  slam: { jitter: 0.08, send: 0.5, ref: 8, layers: [
    { src: 'sine', f: [80, 28], dur: 0.9, a: 0.003, g: 0.9 },
    { src: 'brown', dur: 0.7, a: 0.003, g: 0.6, filter: { t: 'lowpass', f: [1200, 150], q: 0.8 } },
  ] },
  spiderChitter: { jitter: 0.2, send: 0.2, layers: [{ src: 'square', f: [2400, 1800], dur: 0.025, a: 0.001, g: 0.05, filter: { t: 'bandpass', f: [3000, 2500], q: 3 }, burst: { n: 9, every: [0.02, 0.05], pitch: [0.7, 1.4] } }] },
  bite: { jitter: 0.1, layers: [{ src: 'white', dur: 0.06, a: 0.001, g: 0.3, filter: { t: 'bandpass', f: [2000, 900], q: 2 }, burst: { n: 2, every: [0.05, 0.07], pitch: [0.9, 1.1] } }] },
  howl: { send: 0.8, ref: 20, layers: [
    { src: 'sawtooth', f: [260, 520], dur: 2.8, a: 0.4, g: 0.12, filter: { t: 'bandpass', f: [900, 1300], q: 5 }, vib: [5, 30] },
    { src: 'sine', f: [520, 480], dur: 2.8, a: 0.5, g: 0.08, vib: [5, 20] },
  ] },
  growl: { jitter: 0.1, send: 0.3, layers: [{ src: 'sawtooth', f: [70, 60], dur: 0.8, a: 0.05, g: 0.18, filter: { t: 'lowpass', f: [500, 300], q: 2 }, am: [22, 0.6] }] },
  wraith: { send: 0.8, ref: 6, layers: [
    { src: 'pink', dur: 2.5, a: 0.8, g: 0.15, filter: { t: 'bandpass', f: [600, 1400], q: 6 }, am: [0.7, 0.6] },
    { src: 'sine', f: [110, 104], dur: 2.5, a: 1, g: 0.08 },
  ] },
  armorClank: { jitter: 0.1, send: 0.5, layers: [{ src: 'triangle', f: [640, 620], dur: 0.3, a: 0.001, g: 0.1, burst: { n: 3, every: [0.03, 0.08], pitch: [0.8, 1.4] } }] },
  pixie: { jitter: 0.2, layers: [{ src: 'sine', f: [2000, 3000], dur: 0.06, a: 0.002, g: 0.05, burst: { n: 6, every: [0.04, 0.08], pitch: [0.8, 1.5] } }] },
  darkCast: { jitter: 0.08, send: 0.4, layers: [
    { src: 'sawtooth', f: [220, 110], dur: 0.4, a: 0.02, g: 0.08, filter: { t: 'lowpass', f: [1500, 400], q: 4 } },
    { src: 'pink', dur: 0.35, a: 0.03, g: 0.14, filter: { t: 'bandpass', f: [500, 2000], q: 1 } },
  ] },
  bossRoar: { send: 0.7, ref: 14, layers: [
    { src: 'sawtooth', f: [60, 45], dur: 2.2, a: 0.2, g: 0.28, filter: { t: 'bandpass', f: [400, 250], q: 2 }, vib: [9, 50] },
    { src: 'square', f: [1800, 1200], dur: 0.03, a: 0.001, g: 0.03, burst: { n: 20, every: [0.02, 0.06], pitch: [0.6, 1.4] } },
  ] },

  // ---------------------------------------------------------------- flight
  mount: { send: 0.3, layers: [{ src: 'sine', f: [880, 1760], dur: 0.6, a: 0.02, g: 0.06, burst: { n: 5, every: [0.05, 0.08], pitch: [1, 1.5] } }] },
  boost: { layers: [{ src: 'pink', dur: 0.8, a: 0.1, g: 0.25, filter: { t: 'bandpass', f: [400, 2500], q: 1.2 } }] },
  crash: { jitter: 0.1, send: 0.3, layers: [
    { src: 'sine', f: [100, 35], dur: 0.6, a: 0.002, g: 0.7 },
    { src: 'white', dur: 0.4, a: 0.002, g: 0.3, filter: { t: 'lowpass', f: [4000, 300], q: 0.8 } },
  ] },
  ring: { bus: 'ui', send: 0.4, layers: [{ src: 'triangle', f: [988, 988], dur: 0.45, a: 0.004, g: 0.1, burst: { n: 2, every: [0.08, 0.08], pitch: [1, 1.5] } }] },
  bludger: { jitter: 0.1, send: 0.3, layers: [
    { src: 'sine', f: [180, 60], dur: 0.25, a: 0.001, g: 0.6 },
    { src: 'white', dur: 0.08, a: 0.001, g: 0.25, filter: { t: 'bandpass', f: [2500, 1200], q: 1 } },
  ] },
  whistle: { bus: 'ui', send: 0.5, layers: [{ src: 'sine', f: [2900, 2900], dur: 0.9, a: 0.02, g: 0.09, vib: [28, 60] }] },
  cheer: { bus: 'ambience', send: 0.5, layers: [
    { src: 'pink', dur: 3, a: 0.3, g: 0.3, filter: { t: 'bandpass', f: [900, 1400], q: 0.8 }, am: [5, 0.3] },
    { src: 'sawtooth', f: [400, 420], dur: 0.25, a: 0.02, g: 0.02, filter: { t: 'bandpass', f: [1000, 1200], q: 6 }, burst: { n: 14, every: [0.08, 0.2], pitch: [0.7, 1.6] } },
  ] },

  // ------------------------------------------------------------ world / UI
  doorOpen: { jitter: 0.1, send: 0.5, layers: [
    { src: 'sawtooth', f: [120, 190], dur: 1.1, a: 0.1, g: 0.06, filter: { t: 'bandpass', f: [700, 1100], q: 8 }, am: [11, 0.5] },
    { src: 'sine', f: [90, 60], dur: 0.3, a: 0.003, g: 0.25, delay: 0.9 },
  ] },
  stairs: { bus: 'ambience', send: 0.7, ref: 12, layers: [{ src: 'brown', dur: 4.5, a: 0.6, g: 0.4, filter: { t: 'lowpass', f: [220, 160], q: 1.5 }, am: [3, 0.4] }] },
  chime: { bus: 'ambience', send: 0.8, ref: 60, layers: [
    { src: 'sine', f: [392, 392], dur: 3.5, a: 0.003, g: 0.12 },
    { src: 'sine', f: [985, 985], dur: 2.5, a: 0.003, g: 0.05 },
    { src: 'sine', f: [1568, 1568], dur: 1.6, a: 0.003, g: 0.03 },
  ] },
  thunder: { bus: 'ambience', send: 0.5, layers: [
    { src: 'brown', dur: 4, a: 0.05, g: 0.8, filter: { t: 'lowpass', f: [600, 80], q: 0.7 }, am: [2.5, 0.5] },
    { src: 'white', dur: 0.3, a: 0.002, g: 0.2, filter: { t: 'lowpass', f: [5000, 800], q: 0.7 } },
  ] },
  bird: { bus: 'ambience', jitter: 0.25, send: 0.3, ref: 20, layers: [{ src: 'sine', f: [3200, 4200], dur: 0.09, a: 0.005, g: 0.05, vib: [30, 80], burst: { n: 4, every: [0.08, 0.16], pitch: [0.8, 1.25] } }] },
  owl: { bus: 'ambience', send: 0.6, ref: 30, layers: [{ src: 'sine', f: [420, 380], dur: 0.45, a: 0.05, g: 0.08, burst: { n: 2, every: [0.5, 0.6], pitch: [0.95, 1] } }] },
  coin: { bus: 'ui', send: 0.3, layers: [{ src: 'triangle', f: [2600, 2550], dur: 0.25, a: 0.001, g: 0.08, burst: { n: 3, every: [0.05, 0.09], pitch: [0.9, 1.3] } }] },
  notice: { bus: 'ui', send: 0.3, layers: [{ src: 'sine', f: [880, 880], dur: 0.35, a: 0.005, g: 0.06, burst: { n: 2, every: [0.09, 0.09], pitch: [1, 1.25] } }] },
  uiClick: { bus: 'ui', layers: [{ src: 'sine', f: [1200, 900], dur: 0.05, a: 0.001, g: 0.06 }] },
  uiOpen: { bus: 'ui', send: 0.3, layers: [{ src: 'triangle', f: [440, 660], dur: 0.18, a: 0.005, g: 0.07 }] },
  beep: { bus: 'ui', layers: [{ src: 'square', f: [660, 660], dur: 0.15, a: 0.003, g: 0.05, filter: { t: 'lowpass', f: [2000, 2000], q: 0.7 } }] },
  go: { bus: 'ui', layers: [{ src: 'square', f: [1320, 1320], dur: 0.4, a: 0.003, g: 0.06, filter: { t: 'lowpass', f: [3000, 3000], q: 0.7 } }] },
  fanfare: { bus: 'ui', send: 0.5, layers: [
    { src: 'sawtooth', f: [392, 392], dur: 0.9, a: 0.02, g: 0.05, filter: { t: 'lowpass', f: [2500, 1200], q: 1 }, burst: { n: 3, every: [0.14, 0.14], pitch: [1, 1.5] } },
    { src: 'sawtooth', f: [523, 523], dur: 1.2, a: 0.03, g: 0.05, filter: { t: 'lowpass', f: [2500, 1200], q: 1 }, delay: 0.45 },
  ] },
  heartbeat: { bus: 'sfx', layers: [
    { src: 'sine', f: [60, 40], dur: 0.14, a: 0.005, g: 0.4 },
    { src: 'sine', f: [55, 38], dur: 0.14, a: 0.005, g: 0.3, delay: 0.22 },
  ] },
});

/** Looping ambience beds: recipes with an Infinity layer; gains are set live. */
export const LOOPS = Object.freeze({
  wind: { bus: 'ambience', layers: [{ src: 'pink', dur: Infinity, a: 1.5, g: 0.25, filter: { t: 'bandpass', f: [500, 500], q: 0.6 }, am: [0.15, 0.5] }] },
  rain: { bus: 'ambience', layers: [
    { src: 'white', dur: Infinity, a: 2, g: 0.2, filter: { t: 'highpass', f: [1800, 1800], q: 0.5 } },
    { src: 'pink', dur: Infinity, a: 2, g: 0.18, filter: { t: 'lowpass', f: [900, 900], q: 0.5 } },
  ] },
  crickets: { bus: 'ambience', layers: [{ src: 'sine', f: [4400, 4400], dur: Infinity, a: 2, g: 0.02, am: [24, 1] }] },
  water: { bus: 'ambience', layers: [{ src: 'brown', dur: Infinity, a: 2, g: 0.3, filter: { t: 'lowpass', f: [500, 500], q: 0.7 }, am: [0.35, 0.6] }] },
  room: { bus: 'ambience', layers: [{ src: 'brown', dur: Infinity, a: 2, g: 0.1, filter: { t: 'lowpass', f: [180, 180], q: 0.7 } }] },
  crowd: { bus: 'ambience', layers: [
    { src: 'pink', dur: Infinity, a: 2, g: 0.12, filter: { t: 'bandpass', f: [700, 700], q: 1.5 }, am: [3.1, 0.35] },
    { src: 'pink', dur: Infinity, a: 2, g: 0.08, filter: { t: 'bandpass', f: [1700, 1700], q: 2 }, am: [4.3, 0.4] },
  ] },
  fire: { bus: 'ambience', layers: [{ src: 'brown', dur: Infinity, a: 1, g: 0.14, filter: { t: 'lowpass', f: [1200, 1200], q: 0.7 }, am: [7, 0.7] }] },
  broom: { bus: 'sfx', layers: [
    { src: 'pink', dur: Infinity, a: 0.4, g: 0.3, filter: { t: 'bandpass', f: [400, 400], q: 0.9 } },
    { src: 'white', dur: Infinity, a: 0.4, g: 0.05, filter: { t: 'highpass', f: [4000, 4000], q: 0.5 } },
  ] },
  snitch: { bus: 'sfx', layers: [{ src: 'pink', dur: Infinity, a: 0.2, g: 0.35, filter: { t: 'bandpass', f: [2600, 2600], q: 3 }, am: [42, 0.9] }] },
  aura: { bus: 'sfx', layers: [{ src: 'sine', f: [98, 98], dur: Infinity, a: 1.5, g: 0.2, am: [0.5, 0.6] }, { src: 'pink', dur: Infinity, a: 1.5, g: 0.06, filter: { t: 'bandpass', f: [1100, 1100], q: 8 }, am: [0.9, 0.7] }] },
});

/** Mixer, space and ambience tuning. */
export const AUDIO = Object.freeze({
  /** Max simultaneous one-shot voices (oldest are cut). */
  voices: 48,
  /** Spatial: reference / max distance (m), rolloff. */
  ref: 3,
  maxDistance: 90,
  rolloff: 1.1,
  /** Reverb per region: impulse length (s), decay power, wet level. */
  reverb: { grounds: [1.4, 3.5, 0.18], castle: [3.4, 2.4, 0.42], testRoom: [2.2, 2.8, 0.3], default: [1.8, 3, 0.25] },
  /** Footstep surfaces by collider surface name. */
  steps: { stone: 'stepStone', metal: 'stepMetal', wood: 'stepWood', grass: 'stepGrass', cloth: 'stepGrass', flesh: 'stepGrass', leather: 'stepWood' },
  /** Ambience: bird / owl call rates (per second, day / night), hour bell region. */
  birds: 0.35,
  owls: 0.04,
  /** Music / ambience ducking while talking or paused. */
  duck: { dialogue: 0.45, pause: 0.35, rate: 2.5 },
  /** Low-health heartbeat below this share of health. */
  heartbeat: 0.3,
});
