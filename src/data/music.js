/**
 * @file Music data for the generative score. Instruments are synthesis
 * recipes played at a pitch (layer `ratio` × note frequency) with an
 * ADSR-style envelope. Moods define tempo, metre, scale, chord
 * progression and the layers that play over it; the melody layer strings
 * together the original motifs below, fitted to the chord of each bar.
 *
 * Motif steps: [scale steps above the chord root (null = rest), beats].
 */

export const INSTRUMENTS = Object.freeze({
  celesta: { a: 0.004, d: 1.4, s: 0, r: 0.3, send: 0.6, layers: [
    { src: 'sine', ratio: 1, g: 0.2 }, { src: 'sine', ratio: 4, g: 0.05 }, { src: 'triangle', ratio: 2, g: 0.04 },
  ] },
  harp: { a: 0.003, d: 1.8, s: 0, r: 0.4, send: 0.5, layers: [
    { src: 'triangle', ratio: 1, g: 0.18, filter: { t: 'lowpass', ratio: 6, q: 0.7 } }, { src: 'sine', ratio: 2, g: 0.04 },
  ] },
  flute: { a: 0.08, d: 0, s: 1, r: 0.25, send: 0.5, vib: [5, 14], layers: [
    { src: 'sine', ratio: 1, g: 0.14 }, { src: 'triangle', ratio: 2, g: 0.02 },
    { src: 'pink', g: 0.02, filter: { t: 'bandpass', ratio: 2, q: 3 } },
  ] },
  pad: { a: 1.2, d: 0, s: 1, r: 1.8, send: 0.7, layers: [
    { src: 'sawtooth', ratio: 1, detune: -8, g: 0.035, filter: { t: 'lowpass', ratio: 3, q: 0.5 } },
    { src: 'sawtooth', ratio: 1, detune: 8, g: 0.035, filter: { t: 'lowpass', ratio: 3, q: 0.5 } },
  ] },
  strings: { a: 0.25, d: 0, s: 1, r: 0.6, send: 0.6, vib: [5.5, 8], layers: [
    { src: 'sawtooth', ratio: 1, detune: -6, g: 0.035, filter: { t: 'lowpass', ratio: 4, q: 0.6 } },
    { src: 'sawtooth', ratio: 1, detune: 7, g: 0.035, filter: { t: 'lowpass', ratio: 4, q: 0.6 } },
  ] },
  pizz: { a: 0.003, d: 0.35, s: 0, r: 0.1, send: 0.4, layers: [{ src: 'triangle', ratio: 1, g: 0.2, filter: { t: 'lowpass', ratio: 5, q: 1 } }] },
  brass: { a: 0.06, d: 0, s: 1, r: 0.3, send: 0.5, layers: [
    { src: 'sawtooth', ratio: 1, g: 0.06, filter: { t: 'lowpass', ratio: 5, q: 1.2 } },
    { src: 'sawtooth', ratio: 1.002, g: 0.05, filter: { t: 'lowpass', ratio: 5, q: 1.2 } },
  ] },
  choir: { a: 0.6, d: 0, s: 1, r: 1.2, send: 0.8, vib: [4.8, 10], layers: [
    { src: 'sawtooth', ratio: 1, g: 0.05, filter: { t: 'bandpass', abs: 750, q: 5 } },
    { src: 'sawtooth', ratio: 1, detune: 9, g: 0.04, filter: { t: 'bandpass', abs: 1150, q: 5 } },
  ] },
  bass: { a: 0.01, d: 1.2, s: 0.4, r: 0.3, send: 0.2, layers: [{ src: 'sine', ratio: 1, g: 0.3 }, { src: 'triangle', ratio: 2, g: 0.05 }] },
  bell: { a: 0.003, d: 3, s: 0, r: 1, send: 0.8, layers: [
    { src: 'sine', ratio: 1, g: 0.12 }, { src: 'sine', ratio: 2.76, g: 0.05 }, { src: 'sine', ratio: 5.4, g: 0.03 },
  ] },
});

/** Unpitched percussion (fixed recipes). */
export const DRUMS = Object.freeze({
  timpani: { layers: [{ src: 'sine', f: [95, 62], dur: 1, a: 0.003, g: 0.5 }, { src: 'brown', dur: 0.3, a: 0.002, g: 0.2, filter: { t: 'lowpass', f: [500, 150], q: 0.7 } }] },
  kick: { layers: [{ src: 'sine', f: [140, 45], dur: 0.35, a: 0.002, g: 0.55 }] },
  snare: { layers: [{ src: 'white', dur: 0.18, a: 0.001, g: 0.18, filter: { t: 'bandpass', f: [2200, 1500], q: 0.8 } }, { src: 'triangle', f: [220, 180], dur: 0.08, a: 0.001, g: 0.1 }] },
  shaker: { layers: [{ src: 'white', dur: 0.06, a: 0.004, g: 0.06, filter: { t: 'highpass', f: [6000, 6000], q: 0.7 } }] },
  cymbal: { layers: [{ src: 'white', dur: 1.6, a: 0.002, g: 0.08, filter: { t: 'highpass', f: [5000, 7000], q: 0.5 } }] },
});

/** Mode intervals (semitones). */
export const SCALES = Object.freeze({
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
});

/** Original motifs. */
export const MOTIFS = Object.freeze({
  waltz: [[[4, 1], [5, 0.5], [4, 0.5], [2, 1], [4, 2], [null, 1]], [[0, 1], [2, 1], [4, 1], [7, 1.5], [6, 0.5], [4, 1]], [[7, 1], [6, 0.5], [4, 0.5], [5, 1], [4, 1], [2, 1], [0, 1]]],
  pastoral: [[[2, 1.5], [4, 0.5], [5, 1], [4, 1.5], [2, 0.5], [0, 1]], [[4, 1], [5, 1], [7, 1], [5, 1.5], [4, 0.5], [2, 1]], [[0, 0.5], [2, 0.5], [4, 1], [2, 1], [null, 1], [5, 2]]],
  night: [[[4, 2], [2, 1], [null, 1], [0, 3], [null, 1]], [[7, 1.5], [6, 0.5], [4, 2], [null, 2], [2, 2]], [[2, 1], [4, 1], [5, 2], [4, 3], [null, 1]]],
  mystery: [[[0, 1], [3, 1], [2, 0.5], [1, 0.5], [0, 1], [null, 2]], [[4, 1.5], [3, 0.5], [2, 1], [5, 2], [null, 1]], [[7, 1], [5, 1], [3, 1], [4, 3]]],
  heroic: [[[0, 0.5], [0, 0.5], [4, 1], [7, 1.5], [5, 0.5], [4, 1]], [[7, 1], [9, 0.5], [7, 0.5], [5, 1], [4, 1]], [[4, 1.5], [5, 0.5], [7, 1], [11, 1]]],
  battle: [[[0, 0.5], [2, 0.5], [3, 0.5], [4, 0.5], [3, 1], [0, 1]], [[7, 0.5], [6, 0.5], [4, 0.5], [3, 0.5], [4, 1], [2, 1]], [[0, 1], [4, 0.5], [3, 0.5], [2, 1], [7, 1]]],
  festive: [[[0, 0.5], [2, 0.5], [4, 0.5], [7, 0.5], [9, 1], [7, 1]], [[4, 1], [5, 0.5], [4, 0.5], [2, 1], [0, 1]], [[7, 0.5], [7, 0.5], [9, 0.5], [7, 0.5], [4, 1], [5, 1]]],
});

/**
 * Moods. root: MIDI note of the tonic; progression: scale degrees (0-based)
 * of each bar's chord; layers play in order. Perc hits: [beat, drum, gain].
 */
export const MOODS = Object.freeze({
  menu: { tempo: 84, beats: 3, root: 62, scale: 'harmonic', progression: [0, 5, 3, 4, 0, 3, 1, 4], gain: 0.9, layers: [
    { kind: 'pad', inst: 'strings', octave: -1, gain: 0.8 },
    { kind: 'arp', inst: 'harp', octave: 0, steps: [0, 1, 2, 1, 2, 1], every: 0.5, gain: 0.7 },
    { kind: 'melody', inst: 'celesta', octave: 1, motifs: 'waltz', gain: 1 },
    { kind: 'bass', inst: 'bass', octave: -2, hits: [0], gain: 0.8 },
  ] },
  day: { tempo: 76, beats: 3, root: 67, scale: 'major', progression: [0, 3, 4, 0, 5, 3, 1, 4], gain: 0.8, layers: [
    { kind: 'pad', inst: 'pad', octave: -1, gain: 0.7 },
    { kind: 'arp', inst: 'harp', octave: 0, steps: [0, 2, 1, 2, 0, 2], every: 0.5, gain: 0.6 },
    { kind: 'melody', inst: 'flute', octave: 1, motifs: 'pastoral', gain: 0.8, rest: 0.3 },
    { kind: 'bass', inst: 'bass', octave: -2, hits: [0], gain: 0.6 },
  ] },
  night: { tempo: 60, beats: 4, root: 64, scale: 'minor', progression: [0, 5, 2, 6], gain: 0.7, layers: [
    { kind: 'pad', inst: 'pad', octave: -1, gain: 0.8 },
    { kind: 'melody', inst: 'celesta', octave: 1, motifs: 'night', gain: 0.7, rest: 0.45 },
    { kind: 'bass', inst: 'bass', octave: -2, hits: [0], gain: 0.5 },
  ] },
  castle: { tempo: 72, beats: 3, root: 57, scale: 'dorian', progression: [0, 3, 0, 6, 5, 3, 4, 4], gain: 0.8, layers: [
    { kind: 'pad', inst: 'strings', octave: 0, gain: 0.6 },
    { kind: 'arp', inst: 'pizz', octave: 0, steps: [0, 2, 1], every: 1, gain: 0.6 },
    { kind: 'melody', inst: 'celesta', octave: 1, motifs: 'mystery', gain: 0.9, rest: 0.25 },
    { kind: 'bass', inst: 'bass', octave: -1, hits: [0], gain: 0.6 },
  ] },
  calm: { tempo: 64, beats: 4, root: 60, scale: 'lydian', progression: [0, 1, 0, 4], gain: 0.6, layers: [
    { kind: 'pad', inst: 'pad', octave: 0, gain: 0.7 },
    { kind: 'arp', inst: 'harp', octave: 0, steps: [0, 1, 2, 1], every: 1, gain: 0.5 },
  ] },
  combat: { tempo: 128, beats: 4, root: 62, scale: 'harmonic', progression: [0, 0, 5, 4, 0, 3, 5, 4], gain: 1, layers: [
    { kind: 'ostinato', inst: 'strings', octave: -1, steps: [0, 0, 2, 0, 0, 1, 0, 2], every: 0.5, gain: 0.8 },
    { kind: 'pad', inst: 'brass', octave: 0, gain: 0.5 },
    { kind: 'melody', inst: 'brass', octave: 1, motifs: 'battle', gain: 0.7, rest: 0.35 },
    { kind: 'bass', inst: 'bass', octave: -2, hits: [0, 1.5, 2, 3.5], gain: 0.8 },
    { kind: 'perc', hits: [[0, 'timpani', 1], [1, 'snare', 0.6], [1.5, 'timpani', 0.6], [3, 'snare', 0.7], [3.5, 'snare', 0.4]], gain: 1 },
  ] },
  boss: { tempo: 140, beats: 4, root: 60, scale: 'harmonic', progression: [0, 0, 5, 5, 3, 3, 4, 4], gain: 1.05, layers: [
    { kind: 'ostinato', inst: 'strings', octave: -1, steps: [0, 0, 1, 0, 2, 0, 1, 2], every: 0.5, gain: 0.8 },
    { kind: 'pad', inst: 'choir', octave: 0, gain: 0.9 },
    { kind: 'melody', inst: 'brass', octave: 0, motifs: 'battle', gain: 0.8, rest: 0.2 },
    { kind: 'bass', inst: 'bass', octave: -2, hits: [0, 0.5, 2, 2.5], gain: 0.9 },
    { kind: 'perc', hits: [[0, 'timpani', 1], [0.75, 'kick', 0.6], [1, 'snare', 0.7], [2, 'timpani', 0.9], [3, 'snare', 0.7], [3.5, 'cymbal', 0.5]], gain: 1 },
  ] },
  duel: { tempo: 108, beats: 4, root: 64, scale: 'minor', progression: [0, 6, 5, 4], gain: 0.9, layers: [
    { kind: 'ostinato', inst: 'pizz', octave: 0, steps: [0, 2, 1, 2, 0, 2, 1, 2], every: 0.5, gain: 0.8 },
    { kind: 'pad', inst: 'strings', octave: -1, gain: 0.5 },
    { kind: 'perc', hits: [[0, 'kick', 0.7], [1, 'snare', 0.5], [2, 'kick', 0.6], [3, 'snare', 0.6], [3.5, 'shaker', 0.8]], gain: 0.8 },
    { kind: 'bass', inst: 'bass', octave: -2, hits: [0, 2], gain: 0.7 },
  ] },
  flight: { tempo: 112, beats: 4, root: 65, scale: 'major', progression: [0, 4, 5, 3, 0, 4, 3, 4], gain: 0.9, layers: [
    { kind: 'arp', inst: 'harp', octave: 0, steps: [0, 1, 2, 3, 2, 1, 0, 1], every: 0.5, gain: 0.6 },
    { kind: 'pad', inst: 'strings', octave: -1, gain: 0.6 },
    { kind: 'melody', inst: 'flute', octave: 1, motifs: 'heroic', gain: 0.8, rest: 0.2 },
    { kind: 'perc', hits: [[0, 'kick', 0.5], [2, 'kick', 0.4], [0.5, 'shaker', 0.6], [1.5, 'shaker', 0.6], [2.5, 'shaker', 0.6], [3.5, 'shaker', 0.6]], gain: 0.7 },
    { kind: 'bass', inst: 'bass', octave: -2, hits: [0, 2.5], gain: 0.6 },
  ] },
  quidditch: { tempo: 124, beats: 4, root: 58, scale: 'major', progression: [0, 3, 4, 0, 5, 3, 4, 4], gain: 1, layers: [
    { kind: 'pad', inst: 'brass', octave: 0, gain: 0.5 },
    { kind: 'melody', inst: 'brass', octave: 1, motifs: 'festive', gain: 0.8, rest: 0.15 },
    { kind: 'ostinato', inst: 'pizz', octave: 0, steps: [0, 2, 0, 1], every: 0.5, gain: 0.6 },
    { kind: 'perc', hits: [[0, 'kick', 0.7], [1, 'snare', 0.6], [2, 'kick', 0.6], [2.5, 'kick', 0.4], [3, 'snare', 0.6]], gain: 0.8 },
    { kind: 'bass', inst: 'bass', octave: -2, hits: [0, 1.5, 2], gain: 0.7 },
  ] },
});

export const MUSIC = Object.freeze({
  /** Schedule this far ahead (s); crossfade time between moods (s). */
  lookahead: 0.25,
  fade: 3,
  /** Mood hold time before switching away from combat (s). */
  combatHold: 6,
  /** Engaged enemies within this range start battle music (m). */
  combatRange: 40,
  masterGain: 0.5,
});

/** Speech: Turkish vowel formants (F1, F2 Hz) and syllable timing. */
export const VOICE = Object.freeze({
  formants: { a: [800, 1250], e: [520, 1900], ı: [420, 1500], i: [300, 2300], o: [520, 900], ö: [420, 1650], u: [350, 850], ü: [300, 1750] },
  /** Syllables per second at rate 1; pitch range (Hz) of voices; loudness. */
  rate: 9,
  pitch: [105, 260],
  gain: 0.12,
  /** Consonant noise burst length (s) and gain. */
  consonant: [0.025, 0.08],
  /** Longest line voiced (syllables) — longer lines are voiced partly. */
  maxSyllables: 40,
  /** Browser speech (tts) language. */
  lang: 'tr-TR',
});
