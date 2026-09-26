/**
 * @file FaceAnimator — drives the facial blend shapes: automatic blinking,
 * smoothly blended expressions (smile, frown, surprise, pain…), talking
 * visemes generated from text (one mouth shape per letter, vowels open
 * the jaw, m/b/p close the lips) and small eye darts (saccades).
 */
import * as THREE from 'three';
import { EXPRESSIONS, VISEMES, FACE_ANIM } from '../data/character.js';
import { HEAD_MORPHS } from '../procgen/characters/HeadGenerator.js';

const VOWELS = new Set(['a', 'e', 'ı', 'i', 'o', 'ö', 'u', 'ü']);
const FACE_KEYS = HEAD_MORPHS.filter((k) => !k.startsWith('blink'));

export class FaceAnimator {
  /**
   * Speech hook (set by the game): (character, text, rate) → the voice synth
   * plays the line in sync with the lip movement.
   * @type {((character:any, text:string, rate:number) => void)|null}
   */
  static onSay = null;

  /** @param {import('../procgen/characters/Character.js').Character} character */
  constructor(character) {
    this.character = character;
    this.expression = 'neutral';
    this.expressionWeights = Object.fromEntries(FACE_KEYS.map((k) => [k, 0]));
    this.visemeWeights = Object.fromEntries(FACE_KEYS.map((k) => [k, 0]));
    this._blinkTimer = this._nextBlink();
    this._blinkT = -1;
    /** @type {{weights:Record<string, number>, time:number}[]} */
    this._visemes = [];
    this._visemeTime = 0;
    this.talking = false;
    this.saccade = new THREE.Vector2();
    this._saccadeTimer = 1;
    this.blinkLock = 0;
  }

  _nextBlink() {
    const [a, b] = FACE_ANIM.blinkInterval;
    return a + Math.random() * (b - a);
  }

  /** @param {string} name EXPRESSIONS key */
  setExpression(name) {
    if (name in EXPRESSIONS) this.expression = name;
  }

  blink() {
    this._blinkT = 0;
  }

  /**
   * Lip-sync a line of text and voice it (FaceAnimator.onSay).
   * @param {string} text
   * @param {number} [rate] syllable speed multiplier
   */
  say(text, rate = 1) {
    const seq = [];
    for (const ch of text.toLocaleLowerCase('tr-TR')) {
      if (ch === ' ' || ch === ',' || ch === '.') {
        seq.push({ weights: {}, time: FACE_ANIM.syllableSeconds * (ch === ' ' ? 0.6 : 1.5) / rate });
        continue;
      }
      if (!/[a-zçğıöşü]/.test(ch)) continue;
      const w = VISEMES[ch] ?? { jawOpen: 0.15 };
      seq.push({ weights: w, time: (FACE_ANIM.syllableSeconds * (VOWELS.has(ch) ? 1 : 0.45)) / rate });
    }
    seq.push({ weights: {}, time: FACE_ANIM.syllableSeconds });
    this._visemes = seq;
    this._visemeTime = 0;
    this.talking = true;
    FaceAnimator.onSay?.(this.character, text, rate);
  }

  /** @param {number} dt */
  update(dt) {
    const C = this.character;
    // Expression blend.
    const target = EXPRESSIONS[this.expression].morphs;
    const ke = 1 - Math.exp(-FACE_ANIM.expressionRate * dt);
    for (const k of FACE_KEYS) this.expressionWeights[k] += ((target[k] ?? 0) - this.expressionWeights[k]) * ke;

    // Visemes.
    let vt = null;
    if (this._visemes.length) {
      this._visemeTime -= dt;
      while (this._visemes.length && this._visemeTime <= 0) {
        const v = this._visemes.shift();
        this._visemeTime += v.time;
        this._current = v.weights;
      }
      vt = this._current;
      if (!this._visemes.length) this.talking = false;
    } else {
      this._current = null;
    }
    const kv = 1 - Math.exp(-FACE_ANIM.visemeRate * dt);
    for (const k of FACE_KEYS) this.visemeWeights[k] += (((vt && vt[k]) ?? 0) - this.visemeWeights[k]) * kv;

    for (const k of FACE_KEYS) C.setMorph(k, THREE.MathUtils.clamp(this.expressionWeights[k] + this.visemeWeights[k], 0, 1));

    // Blinks.
    this._blinkTimer -= dt;
    if (this._blinkTimer <= 0 && this._blinkT < 0) {
      this._blinkT = 0;
      this._blinkTimer = this._nextBlink();
    }
    let b = 0;
    if (this._blinkT >= 0) {
      this._blinkT += dt / FACE_ANIM.blinkDuration;
      b = Math.sin(Math.min(1, this._blinkT) * Math.PI);
      if (this._blinkT >= 1) this._blinkT = -1;
    }
    b = Math.max(b, this.blinkLock);
    C.setMorph('blinkL', b);
    C.setMorph('blinkR', b);

    // Eye darts.
    this._saccadeTimer -= dt;
    if (this._saccadeTimer <= 0) {
      const [a0, a1] = FACE_ANIM.saccadeInterval;
      this._saccadeTimer = a0 + Math.random() * (a1 - a0);
      this.saccade.set((Math.random() * 2 - 1) * FACE_ANIM.saccadeAngle, (Math.random() * 2 - 1) * FACE_ANIM.saccadeAngle * 0.5);
    }
  }
}
