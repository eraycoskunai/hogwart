/**
 * @file StoryDirector — the story's set pieces around the quest system:
 *   - new game: the acceptance letter, then the opening flyover over the
 *     lake with timed narration, ending before the castle's great doors;
 *   - the finale: in the Room of Requirement shaped as "Mühürlü Kule",
 *     Morvek Kalgan appears and duels the player (companions help);
 *   - the ending: closing narration and the House Cup standings;
 *   - curfew: caught in the castle corridors late at night costs points;
 *   - rival houses' daily points.
 *
 * Events: story:opening, story:villain {defeated}, story:ending
 */
import * as THREE from 'three';
import { LETTER, OPENING, VILLAIN, ENDING, HOUSE_CUP } from '../../data/story.js';
import { HOUSES } from '../../data/character.js';
import { Duelist } from '../combat/EnemyTypes.js';

export class StoryDirector {
  /**
   * @param {{bus:any, game:any, quests:import('./QuestSystem.js').QuestSystem, housePoints:import('./HousePoints.js').HousePoints,
   *          parchment:any, ui:{say:Function, toast:Function, notice:Function}, voice:any}} o
   */
  constructor(o) {
    this.o = o;
    this.bus = o.bus;
    this.villain = null;
    this._narr = null;
    this._curfewDay = null;
    this._offs = [
      o.bus.on('cinematic:end', ({ id }) => id === 'opening' && this._afterOpening()),
      o.bus.on('combat:killed', ({ enemy }) => enemy === this.villain && this._villainDown()),
    ];
  }

  _fill(t) {
    const d = this.o.game.characterData;
    return t.replaceAll('{ad}', d.firstName).replaceAll('{soyad}', d.lastName).replaceAll('{bina}', HOUSES[d.house]?.label ?? 'Seçilmedi');
  }

  // --------------------------------------------------------------- opening

  /** New game: letter → flyover → the great doors, chapter 1. */
  async newGame() {
    const G = this.o.game;
    G.caster.locked = new Set(['patronus']);
    await this.o.parchment.show({ title: LETTER.title, lines: LETTER.lines.map((l) => this._fill(l)), signature: LETTER.signature, button: LETTER.button });
    if (G.room.id !== OPENING.spawn.region) await G.switchRegion(OPENING.spawn.region);
    if (!G.fsm.is('play')) G.fsm.change('play');
    G.clock.setHour(OPENING.hour);
    this._narr = { i: 0, t: 0 };
    this.bus.emit('story:opening', {});
    G.fsm.change('cinematic', OPENING.shot);
  }

  _afterOpening() {
    const G = this.o.game;
    this._narr = null;
    const S = OPENING.spawn;
    const pos = new THREE.Vector3(...S.pos);
    G.player.setSpawn(pos, S.yaw);
    G.player.teleport(pos, S.yaw);
    G.cameraRig.snapTo(pos, S.yaw);
    if (!Object.keys(this.o.quests.quests).length) this.o.quests.begin();
  }

  // --------------------------------------------------------------- finale

  _spawnVillain() {
    const G = this.o.game;
    const V = VILLAIN;
    const [x, y, z, yaw] = V.spawn;
    const e = new Duelist(G.combat, new THREE.Vector3(x, y, z), { name: V.name, title: V.title, seed: V.seed, health: V.health, accuracy: V.accuracy, castEvery: V.castEvery, shield: V.shield, dodge: V.dodge, spells: V.spells }, { bounds: V.arena, yaw });
    e.name = `${V.name}, ${V.title}`;
    e.faction = 'dark';
    e.yaw = yaw;
    e.boss = true;
    e.fighting = true;
    e.engaged = true;
    e.awareness = 1;
    G.combat.register(e, null);
    this.villain = e;
    this._half = false;
    this.o.ui.say(V.name, V.lines.intro);
    e.face.say(V.lines.intro, 1.1);
    this.bus.emit('combat:bossPhase', { enemy: e, phase: 1, label: 'Mühürlü Kule' });
  }

  _villainDown() {
    const V = VILLAIN;
    this.o.ui.say(V.name, V.lines.defeat);
    this.bus.emit('story:villain', { defeated: true });
    setTimeout(() => this.ending(), 4000);
  }

  /** Closing narration and the House Cup. */
  async ending() {
    const G = this.o.game;
    if (!G.fsm.is('play')) return;
    const HP = this.o.housePoints;
    const standings = HP.standings;
    const cup = standings[0];
    const lines = [...ENDING.lines.map((l) => this._fill(l)), ENDING.cup, ...standings.map((s, i) => `${i + 1}. ${s.label} — ${s.points} puan${s.mine ? ' (senin binan)' : ''}`), cup.mine ? `Bina Kupası ${cup.label}\'ın! Salon alkıştan inliyor.` : `Bina Kupası bu yıl ${cup.label}\'ın. Gelecek yıl sıra sizde!`];
    this.bus.emit('story:ending', { cup: cup.id });
    G.fsm.change('letter');
    await this.o.parchment.show({ title: 'Son', lines, signature: 'Hogwarts: Mühürlü Kule', button: 'Oyuna devam et' });
    if (G.fsm.is('letter')) G.fsm.change('play');
  }

  // --------------------------------------------------------------- update

  /** @param {number} dt fixed step */
  update(dt) {
    const G = this.o.game;
    // Narration during the opening flyover.
    if (this._narr && G.fsm.is('cinematic')) {
      const n = this._narr;
      n.t += dt;
      const next = OPENING.narration[n.i];
      if (next && n.t >= next[0]) {
        const text = this._fill(next[1]);
        this.o.ui.say('Anlatıcı', text);
        this.o.voice.speak('Anlatıcı', text, { rate: 0.85 });
        n.i++;
      }
    }
    const q = this.o.quests;
    const room = G.room;
    // Finale: Kalgan waits in the sealed room.
    // (A region change disposes him; he waits again next time.)
    if (this.villain && !G.combat.enemies.includes(this.villain)) this.villain = null;
    if (!this.villain && q.step('main8')?.kind === 'villain' && room?.id === 'castle' && room.streamer?.playerCell === 'requirement') this._spawnVillain();
    if (this.villain && !this._half && this.villain.health < this.villain.maxHealth / 2) {
      this._half = true;
      this.o.ui.say(VILLAIN.name, VILLAIN.lines.half);
    }
    // House Cup rivals and curfew.
    const day = Math.floor(G.clock.days);
    this.o.housePoints.newDay(day);
    const h = G.clock.hour;
    const C = HOUSE_CUP.curfew;
    const late = h >= C.from || h < C.to;
    const night = h < C.to ? day - 1 : day;
    if (late && room?.id === 'castle' && C.cells.includes(room.streamer?.playerCell) && this._curfewDay !== night && G.fsm.is('play')) {
      this._curfewDay = night;
      this.o.housePoints.award(-C.penalty, 'Gece koridorda yakalandın');
      this.o.ui.toast('Bir sınıf başkanı fenerini sana çeviriyor: "Yatma saati çoktan geçti! Binandan puan kırıyorum."', 6);
    }
  }

  get stats() {
    return { Hikâye: `${this.o.quests.mainQuest ?? 'bitti'} · Kalgan ${this.villain ? `${Math.ceil(this.villain.health)}/${this.villain.maxHealth}` : '—'}` };
  }

  dispose() {
    for (const off of this._offs) off();
  }
}
