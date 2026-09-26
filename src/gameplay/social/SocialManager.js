/**
 * @file SocialManager — companions in the world and conversations with
 * them. Every companion follows a daily routine (GameClock hour → place);
 * those whose place is in the current region are spawned there, the rest
 * are elsewhere (or asleep). A follower travels with the player between
 * regions until dismissed or bedtime.
 *
 * Talking (E) runs a conversation script: greeting by friendship level and
 * place, then a menu — personal topics (with replies the companion likes
 * or dislikes), school rumours, gifts bought on the spot, asking them
 * along, and their favour once you are close friends. Favours are tracked
 * from game events (races, duels, fights, Quidditch).
 *
 * Events: social:talk {id}, social:follow {id|null}, social:favour {id, state}
 */
import * as THREE from 'three';
import { COMPANIONS, PLACES, AFFINITY, GIFTS, COMPANION } from '../../data/companions.js';
import { LINES, RUMOURS, COMMON, TONE } from '../../data/dialogue.js';
import { HOUSES } from '../../data/character.js';
import { Companion } from './Companion.js';
import { Relationships, FAVOUR } from './Relationships.js';

/** Day wraps at 7:00 (routines run 7 → 31). */
const DAY_START = 7;

export class SocialManager {
  /**
   * @param {{bus:any, clock:any, relationships:Relationships, inventory:any, player:any, physics:any, scene:THREE.Scene, library:any, preset:any,
   *          spells:any, combat:any, interactions:any, dialogue:import('../../ui/DialogueUI.js').DialogueUI, worldState:any,
   *          begin:(c:Companion)=>boolean, end:()=>void, ui:{say:Function, notice:Function, toast:Function}, playerName:()=>string, camera:THREE.Camera}} o
   */
  constructor(o) {
    this.o = o;
    this.bus = o.bus;
    this.rel = o.relationships;
    /** @type {Map<string, Companion>} */
    this.companions = new Map();
    this.region = null;
    this.talking = null;
    this._rumour = Math.floor(Math.random() * RUMOURS.length);
    this._provider = o.interactions.addProvider((pos, fwd) => this._talkCandidate(pos, fwd));
    this._offs = [
      this.bus.on('combat:killed', ({ enemy }) => this._progress('kills', enemy.type)),
      this.bus.on('quidditch:end', ({ won }) => won && this._progress('quidditchWin')),
      this.bus.on('race:finish', () => this._checkFavours()),
      this.bus.on('duel:result', () => this._checkFavours()),
    ];
  }

  // -------------------------------------------------------------- time

  /** Routine hour 7…31. */
  get hour() {
    const h = this.o.clock.hour;
    return h < DAY_START ? h + 24 : h;
  }

  /** Game day number (changes at 7:00). */
  get day() {
    return Math.floor(this.o.clock.days - DAY_START / 24);
  }

  /** Where companion `id` should be now: place key or null (asleep). */
  placeOf(id) {
    const h = this.hour;
    const slot = COMPANIONS[id].schedule.find(([a, b]) => h >= a && h < b);
    return slot ? slot[2] : null;
  }

  /** Until when the current slot lasts (hour, 0…24). */
  slotEnd(id) {
    const h = this.hour;
    const slot = COMPANIONS[id].schedule.find(([a, b]) => h >= a && h < b);
    return slot ? slot[1] % 24 : DAY_START;
  }

  _place(key) {
    const P = PLACES[key];
    const [x, y, z] = P.pos;
    const world = new THREE.Vector3(x, y ?? this.region.heightAt(x, z), z);
    return { key, world, yaw: P.yaw, activity: P.activity, label: P.label, region: P.region };
  }

  // ------------------------------------------------------------ region

  setRegion(region) {
    this.clear();
    this.region = region;
    this._sync(true);
  }

  clear() {
    for (const c of this.companions.values()) c.dispose();
    this.companions.clear();
  }

  _spawn(id) {
    let c = this.companions.get(id);
    if (!c) {
      const O = this.o;
      c = new Companion({ scene: O.scene, physics: O.physics, library: O.library, preset: O.preset, spells: O.spells, bus: this.bus }, id, COMPANIONS[id]);
      this.companions.set(id, c);
      this.bus.emit('room:characterAdded', { character: c.character });
    }
    return c;
  }

  /** Bring companions in line with their routines (or the follow order). */
  _sync(instant = false) {
    if (!this.region) return;
    const rid = this.region.id;
    for (const id of Object.keys(COMPANIONS)) {
      if (this.rel.following === id) {
        const c = this._spawn(id);
        if (c.mode !== 'follow') {
          if (instant) c._behind(this.o.player);
          c.follow(this.o.player);
        }
        continue;
      }
      const key = this.placeOf(id);
      const here = key && PLACES[key].region === rid;
      const c = this.companions.get(id);
      if (here) {
        const cc = c ?? this._spawn(id);
        if (cc.placeKey !== key || cc.mode === 'follow') cc.goTo(key, this._place(key), instant || !c);
      } else if (c && c.mode !== 'away') c.leave();
    }
  }

  // ------------------------------------------------------------- update

  /** @param {number} dt fixed step */
  fixedUpdate(dt) {
    if (!this.region) return;
    this._syncT = (this._syncT ?? 0) - dt;
    if (this._syncT <= 0) {
      this._syncT = 1;
      this._bedtime();
      this._sync(false);
    }
    const env = {
      player: this.o.player,
      camera: this.o.camera,
      enemies: this.o.combat.enemies,
      bark: (who, text) => {
        const id = [...this.companions.keys()].find((k) => COMPANIONS[k].first === who);
        const list = LINES[id]?.combat ?? [];
        this.o.ui.say(COMPANIONS[id]?.name ?? who, text ?? list[Math.floor(Math.random() * list.length)]);
      },
    };
    for (const c of this.companions.values()) c.fixedUpdate(dt, env);
  }

  /** Followers head to bed late at night. */
  _bedtime() {
    const id = this.rel.following;
    if (!id || this.placeOf(id) !== null) return;
    this.rel.following = null;
    this.o.ui.say(COMPANIONS[id].name, 'Çok geç oldu, yatakhaneye dönüyorum. Yarın görüşürüz!');
    this.bus.emit('social:follow', { id: null });
  }

  /**
   * @param {number} dt
   * @param {{camera:THREE.Camera, playerHead:THREE.Vector3, player:THREE.Vector3, wind:THREE.Vector3}} env
   */
  render(dt, env) {
    const streamer = this.region?.streamer;
    const visible = (p) => (streamer ? streamer.isVisibleAt(p) : true);
    const player = env.player ?? this.o.player.visualPosition;
    for (const c of this.companions.values()) c.render(dt, { ...env, player, visible });
  }

  // ------------------------------------------------------- interaction

  _talkCandidate(pos, fwd) {
    if (this.talking) return null;
    let best = null;
    let bd = COMPANION.talkRange + 0.8;
    for (const c of this.companions.values()) {
      if (c.mode === 'away' || !c.character.root.visible) continue;
      const d = c.position.distanceTo(pos);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    if (!best) return null;
    const lvl = this.rel.get(best.id).met ? ` (${this.rel.levelName(best.id)})` : '';
    return { id: `talk:${best.id}`, position: best.headPoint(new THREE.Vector3()).setY(best.position.y + 1.2), radius: COMPANION.talkRange + 0.8, label: `Konuş: ${best.name}${lvl}`, action: () => this.talk(best.id) };
  }

  // ------------------------------------------------------ conversation

  _fill(text, id) {
    const S = COMPANIONS[id];
    const F = S.favour;
    return text.replaceAll('{ad}', this.o.playerName()).replaceAll('{name}', S.name).replaceAll('{favour}', F?.text ?? '');
  }

  _who(id) {
    return { name: COMPANIONS[id].name, color: HOUSES[COMPANIONS[id].house].primary, level: this.rel.levelName(id), progress: this.rel.progress(id) };
  }

  /** Line spoken by the companion (with lip-sync). */
  async _say(id, text) {
    const t = this._fill(text, id);
    this.companions.get(id)?.face.say(t, 1.2);
    this.o.dialogue.setSpeaker(this._who(id));
    return this.o.dialogue.say(t);
  }

  async _ask(id, text, options) {
    const t = this._fill(text, id);
    this.companions.get(id)?.face.say(t, 1.2);
    this.o.dialogue.setSpeaker(this._who(id));
    return this.o.dialogue.ask(t, options);
  }

  /** Talk to a companion (async script). */
  async talk(id) {
    const c = this.companions.get(id);
    if (!c || this.talking) return;
    if (!this.o.begin(c)) return;
    this.talking = id;
    const D = this.o.dialogue;
    const R = this.rel;
    const P = R.get(id);
    const L = LINES[id];
    D.open(this._who(id));
    this.bus.emit('social:talk', { id });
    try {
      P.met = true;
      if (P.talkDay !== this.day) {
        P.talkDay = this.day;
        R.add(id, AFFINITY.dailyTalk);
      }
      c.face.setExpression('smile');
      if (c.place?.activity !== 'sit') c.animator.play('wave');
      if ((await this._say(id, L.greet[R.level(id)])) === 'end') return;
      const act = c.mode === 'place' ? L.place[c.place.activity] : null;
      if (act && Math.random() < 0.6 && (await this._say(id, act)) === 'end') return;
      for (;;) {
        const pick = await this._ask(id, 'Ne konuşalım?', this._menu(id));
        if (!pick || pick === 'bye') break;
        const r = await this._topic(id, pick);
        if (r === 'end') break;
      }
      await this._say(id, L.bye);
    } finally {
      D.close();
      this.talking = null;
      this.o.end();
    }
  }

  _menu(id) {
    const R = this.rel;
    const P = R.get(id);
    const L = LINES[id];
    const S = COMPANIONS[id];
    const lvl = R.level(id);
    const opts = [];
    const next = L.topics.findIndex((t, i) => !P.topics.includes(i));
    if (next >= 0) {
      const t = L.topics[next];
      opts.push({ id: `topic:${next}`, label: t.label, disabled: lvl < t.level, note: lvl < t.level ? `${AFFINITY.levels[t.level].name} olunca` : '' });
    }
    opts.push({ id: 'rumour', label: 'Okulda neler oluyor?' });
    opts.push({ id: 'gift', label: 'Sana bir hediyem var', disabled: P.giftDay === this.day, note: P.giftDay === this.day ? 'bugün verdin' : '' });
    if (R.following === id) opts.push({ id: 'part', label: 'Burada ayrılalım' });
    else opts.push({ id: 'follow', label: 'Benimle gelir misin?' });
    if (S.favour && P.favour === FAVOUR.none && lvl >= AFFINITY.favourLevel) opts.push({ id: 'favour', label: 'Bir derdin var mı? Yardım edebilirim.' });
    if (P.favour === FAVOUR.active) opts.push({ id: 'favourCheck', label: `Rican hakkında: ${S.favour.text}` });
    opts.push({ id: 'bye', label: 'Görüşürüz' });
    return opts;
  }

  async _topic(id, pick) {
    const R = this.rel;
    const P = R.get(id);
    const L = LINES[id];
    const S = COMPANIONS[id];
    if (pick.startsWith('topic:')) {
      const i = Number(pick.slice(6));
      const t = L.topics[i];
      if ((await this._say(id, t.text)) === 'end') return 'end';
      const reply = await this._ask(id, '…', t.replies.map((r, k) => ({ id: String(k), label: r.label })));
      if (reply === null) return 'end';
      const r = t.replies[Number(reply)];
      P.topics.push(i);
      const tone = r.tone === S.values ? TONE.good : TONE.clash[S.values] === r.tone ? TONE.bad : TONE.other;
      R.add(id, AFFINITY.topic + tone);
      return this._say(id, r.answer);
    }
    if (pick === 'rumour') {
      this._rumour = (this._rumour + 1) % RUMOURS.length;
      return this._say(id, RUMOURS[this._rumour]);
    }
    if (pick === 'gift') return this._gift(id);
    if (pick === 'follow') {
      if (R.level(id) < AFFINITY.followLevel) return this._say(id, L.follow.no);
      const prev = R.following;
      if (prev && prev !== id) {
        this.companions.get(prev)?.leave();
        this.o.ui.notice(`${COMPANIONS[prev].first} kendi yoluna gitti.`);
      }
      R.following = id;
      this.companions.get(id).follow(this.o.player);
      this.bus.emit('social:follow', { id });
      return this._say(id, L.follow.yes);
    }
    if (pick === 'part') {
      R.following = null;
      this.bus.emit('social:follow', { id: null });
      const c = this.companions.get(id);
      c.placeKey = null;
      this._sync(false);
      return this._say(id, L.follow.part);
    }
    if (pick === 'favour') {
      const ans = await this._ask(id, L.favour.offer, [{ id: 'yes', label: L.favour.accept }, { id: 'no', label: L.favour.decline }]);
      if (ans === 'yes') {
        P.favour = FAVOUR.active;
        P.progress = 0;
        this.bus.emit('social:favour', { id, state: 'active' });
        this.o.ui.notice(`Rica: ${S.favour.text} (${S.first})`);
        return this._say(id, 'Harika! Sana güveniyorum.');
      }
      return ans === null ? 'end' : this._say(id, 'Anlıyorum. Fikrini değiştirirsen söyle.');
    }
    if (pick === 'favourCheck') {
      if (this.favourMet(id)) {
        P.favour = FAVOUR.done;
        R.add(id, AFFINITY.favour);
        this.o.inventory.earn(S.favour.reward, `${S.first}'in ricası`);
        this.bus.emit('social:favour', { id, state: 'done' });
        return this._say(id, L.favour.thanks);
      }
      return this._say(id, COMMON.favourReminder);
    }
    return true;
  }

  async _gift(id) {
    const P = this.rel.get(id);
    const inv = this.o.inventory;
    const opts = Object.entries(GIFTS).map(([g, G]) => ({ id: g, label: G.name, note: `${G.price} G`, disabled: G.price > inv.galleons }));
    opts.push({ id: 'cancel', label: 'Vazgeç' });
    const g = await this._ask(id, `Kesende ${inv.galleons} Galleon var. Ne hediye edeceksin?`, opts);
    if (!g || g === 'cancel') return g === null ? 'end' : true;
    if (!inv.spend(GIFTS[g].price, GIFTS[g].name)) return this._say(id, COMMON.giftPoor);
    P.giftDay = this.day;
    const S = COMPANIONS[id];
    const kind = S.likes[g] ?? S.dislikes[g] ?? 'neutral';
    this.rel.add(id, AFFINITY.gift[kind]);
    const c = this.companions.get(id);
    c?.face.setExpression(kind === 'disliked' ? 'frown' : 'smile');
    return this._say(id, LINES[id].gift[kind]);
  }

  // ----------------------------------------------------------- favours

  /** Is the favour's goal reached? */
  favourMet(id) {
    const F = COMPANIONS[id].favour;
    const P = this.rel.get(id);
    switch (F.kind) {
      case 'raceGold':
        return Object.values(this.o.inventory.races).some((r) => r.medal === 0);
      case 'duelRank':
        return (this.o.worldState.duel?.rank ?? 0) >= F.rank;
      case 'kills':
        return P.progress >= F.count;
      case 'quidditchWin':
        return P.progress >= 1;
      default:
        return false;
    }
  }

  _progress(kind, arg) {
    for (const [id, S] of Object.entries(COMPANIONS)) {
      const P = this.rel.get(id);
      if (P.favour !== FAVOUR.active || S.favour.kind !== kind) continue;
      if (kind === 'kills' && S.favour.enemy !== arg) continue;
      P.progress++;
    }
    this._checkFavours();
  }

  /** Tell the player when a favour is ready to hand in. */
  _checkFavours() {
    for (const [id, S] of Object.entries(COMPANIONS)) {
      const P = this.rel.get(id);
      if (P.favour !== FAVOUR.active || P.notified || !this.favourMet(id)) continue;
      P.notified = true;
      this.o.ui.notice(`${S.first}'in ricasını yerine getirdin — gidip haber ver!`);
    }
  }

  // ------------------------------------------------------------- info

  /** Summary for the friends panel. */
  get summary() {
    return Object.entries(COMPANIONS).map(([id, S]) => {
      const P = this.rel.get(id);
      const key = this.rel.following === id ? 'follow' : this.placeOf(id);
      const where = key === 'follow' ? 'Seninle birlikte' : key ? `${PLACES[key].label} (${PLACES[key].region === 'castle' ? 'şato' : 'arazi'}) · ${fmtHour(this.slotEnd(id))}'e kadar` : 'Yatakhanede uyuyor';
      const favour = P.favour === FAVOUR.active ? `Rica: ${S.favour.text}${this.favourMet(id) ? ' ✓' : ''}` : P.favour === FAVOUR.done ? 'Rica tamamlandı' : '';
      return { id, name: S.name, house: HOUSES[S.house].label, color: HOUSES[S.house].primary, traits: S.traits, met: P.met, level: this.rel.levelName(id), affinity: P.affinity, progress: this.rel.progress(id), where, favour };
    });
  }

  get stats() {
    return {
      Dostlar: [...this.companions.values()].map((c) => `${c.spec.first}: ${c.debugState}`).join(' · ') || '—',
      Yakınlık: Object.keys(COMPANIONS).map((id) => `${COMPANIONS[id].first} ${this.rel.get(id).affinity}`).join(' · '),
      'Takip eden': this.rel.following ?? '—',
    };
  }

  get debugEntities() {
    return [...this.companions.values()].map((c) => ({ name: c.name, state: c.debugState }));
  }

  /** Debug: bring a companion right in front of the player. */
  summon(id) {
    const c = this._spawn(id);
    const p = this.o.player;
    const at = p.position.clone().add(new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)).multiplyScalar(2));
    c._settle({ key: 'debug', world: at, yaw: p.yaw + Math.PI, activity: 'idle', label: 'Çağrıldı' });
    c.placeKey = this.placeOf(id);
  }

  dispose() {
    this.clear();
    for (const off of this._offs) off();
    this.o.interactions.removeProvider(this._provider);
  }
}

function fmtHour(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
