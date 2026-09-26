/**
 * @file DuelClub — the Duelling Club in the castle: a duelling master by
 * the stage offers a ladder of five opponents. A duel: both bow at the
 * stage ends, a countdown, then fight until someone yields (health never
 * reaches zero — the player is non-lethal for the bout) or the player
 * falls off the stage. Progress is kept in worldState.duel.rank.
 *
 * Events: duel:countdown {n}, duel:start {opponent}, duel:result {won, text, rank}
 */
import * as THREE from 'three';
import { DUEL } from '../../data/combat.js';
import { FOCUS } from '../../data/spells.js';
import { Duelist } from './EnemyTypes.js';
import { Character } from '../../procgen/characters/Character.js';
import { Animator } from '../../animation/Animator.js';
import { FaceAnimator } from '../../animation/FaceAnimator.js';
import { randomAppearance, mulberry } from '../../procgen/characters/Appearance.js';

/** Where the master stands (beside the stage, by the door) and how far the offer reaches. */
const MASTER = Object.freeze({ pos: [18.2, 0, 13.4], yaw: Math.PI / 2, reach: 3.2 });
/** Seconds between a bout ending and the opponent leaving the stage. */
const OUTRO = 3;
/** Metres below the stage top that count as having fallen off. */
const FALL_MARGIN = 0.5;

const _v = new THREE.Vector3();

export class DuelClub {
  /**
   * @param {{mgr:import('./EncounterManager.js').EncounterManager, room:any, player:any, caster:any, bus:any,
   *          interactions:any, state:any, ui:{say:(n:string,t:string)=>void}, cameraRig:any}} o
   */
  constructor(o) {
    this.o = o;
    this.mgr = o.mgr;
    this.player = o.player;
    this.bus = o.bus;
    this.state = o.state;
    this.state.duel ??= { rank: 0, champion: false };
    /** idle | countdown | fight | outro */
    this.phase = 'idle';
    this.t = 0;
    this.opponent = null;

    const ctx = this.mgr.ctx;
    const rnd = mulberry(DUEL.master.seed);
    this.master = new Character({ library: ctx.library, preset: { ...ctx.preset, characterTexture: Math.min(512, ctx.preset.characterTexture) }, name: DUEL.master.name });
    this.master.build({ firstName: 'Hester', lastName: 'Kılıçgöz', house: 'none', outfit: 'uniform', appearance: randomAppearance(rnd) });
    this.masterPos = new THREE.Vector3().fromArray(MASTER.pos);
    this.master.root.position.copy(this.masterPos);
    this.master.root.rotation.y = MASTER.yaw;
    this.mgr.root.add(this.master.root);
    this.face = new FaceAnimator(this.master);
    this.animator = new Animator(this.master, this.face);
    this.animator.ikEnabled = false;
    this.item = o.interactions.add({
      id: 'duel-master',
      position: this.masterPos.clone().setY(1.2),
      radius: MASTER.reach,
      label: () => this._offerLabel(),
      enabled: () => this.phase === 'idle' && !this.player.dead,
      action: () => this.start(),
    });
    this._offs = [
      this.bus.on('duel:opponentDown', ({ enemy }) => enemy === this.opponent && this._end(true, this.rank + 1 >= DUEL.ladder.length && !this.state.duel.champion ? DUEL.lines.champion : DUEL.lines.win)),
      this.bus.on('player:yielded', () => this.phase === 'fight' && this._end(false, DUEL.lines.lose)),
      this.bus.on('player:died', () => this.phase !== 'idle' && this._end(false, DUEL.lines.lose)),
    ];
  }

  get rank() {
    return Math.min(this.state.duel.rank, DUEL.ladder.length - 1);
  }

  _offerLabel() {
    const P = DUEL.ladder[this.rank];
    return this.state.duel.champion ? `Şampiyonluk rövanşı: ${P.name}` : `Düello et: ${P.name} (${P.title}) — ${this.rank + 1}/${DUEL.ladder.length}`;
  }

  /** Begin the next bout of the ladder. */
  start() {
    if (this.phase !== 'idle') return;
    const P = DUEL.ladder[this.rank];
    const S = DUEL.start;
    const p = this.player;
    p.heal(p.maxHealth);
    p.clearCombat();
    p.nonLethal = true;
    p.teleport(new THREE.Vector3(S.player[0], S.player[1], S.player[2]), S.player[3]);
    this.o.cameraRig.snapTo(p.position, S.player[3]);
    this.o.caster.focus = FOCUS.max;
    this.opponent = new Duelist(this.mgr, new THREE.Vector3(S.opponent[0], S.opponent[1], S.opponent[2]), P, { bounds: DUEL.bounds, yaw: S.opponent[3] });
    this.opponent.yaw = S.opponent[3];
    this.mgr.register(this.opponent, null);
    this.opponent.animator.play('wave');
    this.face.say(DUEL.lines.bow, 1.4);
    this.o.ui.say(DUEL.master.name, DUEL.lines.bow);
    this.phase = 'countdown';
    this.t = 0;
    this._shown = DUEL.countdown + 1;
    this.bus.emit('duel:start', { opponent: this.opponent });
  }

  _end(won, text) {
    if (this.phase === 'idle' || this.phase === 'outro') return;
    this.phase = 'outro';
    this.t = 0;
    const p = this.player;
    p.nonLethal = false;
    if (this.opponent) {
      this.opponent.fighting = false;
      this.opponent.cancelAction();
    }
    const D = this.state.duel;
    if (won) {
      if (D.rank + 1 >= DUEL.ladder.length) D.champion = true;
      D.rank = Math.min(DUEL.ladder.length - 1, D.rank + 1);
    }
    this.o.ui.say(DUEL.master.name, text);
    this.face.say(text, 1.4);
    this.bus.emit('duel:result', { won, text, rank: D.rank });
  }

  /** @param {number} dt fixed step */
  fixedUpdate(dt) {
    if (this.phase === 'idle') return;
    this.t += dt;
    const p = this.player;
    if (this.phase === 'countdown') {
      const left = Math.ceil(DUEL.countdown - this.t);
      if (left < this._shown) {
        this._shown = left;
        this.bus.emit('duel:countdown', { n: Math.max(0, left) });
      }
      if (this.t >= DUEL.countdown) {
        this.phase = 'fight';
        this.opponent.fighting = true;
        this.opponent.engaged = true;
        this.opponent.awareness = 1;
      }
    }
    if (this.phase === 'fight' || this.phase === 'countdown') {
      const B = DUEL.bounds;
      const q = p.position;
      if (q.y < B.y - FALL_MARGIN || q.x < B.minX - 1 || q.x > B.maxX + 1 || q.z < B.minZ - 1 || q.z > B.maxZ + 1) this._end(false, DUEL.lines.out);
    }
    if (this.phase === 'outro' && this.t > OUTRO) {
      this._clearOpponent();
      this.phase = 'idle';
      p.heal(p.maxHealth);
    }
  }

  _clearOpponent() {
    if (!this.opponent) return;
    this.mgr.remove(this.opponent);
    this.opponent = null;
  }

  /** The opponent shown on the big bar. */
  get focus() {
    return this.phase === 'idle' ? null : this.opponent;
  }

  /**
   * @param {number} dt
   * @param {{camera:THREE.Camera, wind:THREE.Vector3, playerHead:THREE.Vector3}} env
   */
  render(dt, env) {
    const visible = this.o.room.streamer.isVisibleAt(this.masterPos);
    this.master.root.visible = visible;
    if (!visible) return;
    const near = _v.copy(this.player.position).distanceTo(this.masterPos) < 8;
    this.face.setExpression(this.phase === 'fight' ? 'frown' : 'neutral');
    this.face.update(dt);
    this.animator.update(dt, {
      speed: 0, grounded: true, vy: 0, crouching: false, aiming: false, turnRate: 0, accel: 0, climb: 0, sliding: false,
      lookTarget: this.phase === 'fight' && this.opponent ? this.opponent.headPoint(_v) : near ? env.playerHead : null, aimTarget: null, ground: null,
    });
    this.master.update(dt, { camera: env.camera, wind: env.wind, groundY: this.masterPos.y });
  }

  get stats() {
    const D = this.state.duel;
    return { 'Düello': `${this.phase} · sıra ${D.rank + 1}/${DUEL.ladder.length}${D.champion ? ' · şampiyon' : ''}` };
  }

  dispose() {
    for (const off of this._offs) off();
    this._clearOpponent();
    this.player.nonLethal = false;
    this.o.interactions.remove(this.item);
    this.master.dispose();
    this.master.root.removeFromParent();
  }
}
