/**
 * @file Balance report: `node tools/balance.mjs`
 *
 * Reads the game's data files and prints, per difficulty, how long the
 * player needs to defeat each enemy (a simulated spell rotation with focus,
 * cooldowns, mastery, poise stagger and finishers), how long the player
 * survives against the attackers allowed at once, and the economy (when
 * each broom becomes affordable along the main story). Every figure is
 * checked against the targets in src/data/balance.js; the exit code is 1
 * when something is out of range.
 */
import { SPELLS, FOCUS, MASTERY } from '../src/data/spells.js';
import { COMBAT, AI_DIFFICULTY, ENEMIES, ENEMY_SPELLS, BOSS, DUEL, ENCOUNTERS } from '../src/data/combat.js';
import { DIFFICULTIES } from '../src/data/settings.js';
import { PLAYER } from '../src/data/physics.js';
import { BROOMS, ECONOMY, RACES, QUIDDITCH } from '../src/data/flight.js';
import { QUESTS, VILLAIN } from '../src/data/story.js';
import { COMPANIONS } from '../src/data/companions.js';
import { CLIPS } from '../src/data/animations.js';
import { BALANCE_MODEL as M, BALANCE_TARGETS as T } from '../src/data/balance.js';

const DT = 0.05;
let failures = 0;
const check = (ok) => {
  if (!ok) failures++;
  return ok ? 'ok' : 'DIŞINDA';
};
const mean = (a) => (a[0] + a[1]) / 2;

/**
 * Simulated duel against a target that does not fight back.
 * @param {{health:number, poise:number, hitFactor?:number, shield?:{health:number, cooldown:number, react:number}, resist?:any, weak?:any, finisher?:number}} t
 * @param {number} level mastery level
 */
function timeToKill(t, level) {
  const L = level - 1;
  const cd = new Map();
  let focus = FOCUS.max;
  let sinceSpend = 99;
  let hp = t.health;
  let poise = 0;
  let staggered = 0;
  let shieldHp = t.shield ? t.shield.health * t.shield.react : 0;
  let shieldCd = 0;
  let time = 0;
  let busy = 0;
  let last = null;
  const hit = M.playerHitRate * (t.hitFactor ?? 1);
  while (hp > 0 && time < M.maxFight) {
    time += DT;
    sinceSpend += DT;
    if (sinceSpend > FOCUS.regenDelay) focus = Math.min(FOCUS.max, focus + FOCUS.regen * DT);
    for (const [k, v] of cd) cd.set(k, v - DT);
    staggered -= DT;
    busy -= DT;
    if (t.shield) {
      shieldCd -= DT;
      if (shieldCd <= 0 && shieldHp <= 0) {
        shieldHp = t.shield.health * t.shield.react;
        shieldCd = t.shield.cooldown;
      }
    }
    if (busy > 0) continue;
    // Finisher when the stun bar is full.
    if (staggered > 0 && staggered <= COMBAT.stagger.duration && poise >= t.poise) {
      hp -= t.maxHealth * (t.finisher ?? COMBAT.finisher.damage);
      poise = 0;
      staggered = 0;
      busy = M.finisherTime;
      continue;
    }
    for (const id of M.rotation) {
      const S = SPELLS[id];
      if (!S || (cd.get(id) ?? 0) > 0) continue;
      const cost = S.cost * (1 - MASTERY.costPerLevel * L);
      if (focus < cost) continue;
      focus -= cost;
      sinceSpend = 0;
      cd.set(id, S.cooldown * (1 - MASTERY.cooldownPerLevel * L));
      // Until the wand releases the spell nothing else can be cast; idle time
      // (moving, dodging) stretches every cast by 1 / uptime.
      const clip = CLIPS[S.clip];
      busy = ((clip.duration * clip.events.release) + (id === last ? 0 : M.switchTime)) / M.uptime;
      last = id;
      let dmg = S.damage * (1 + MASTERY.powerPerLevel * L) * hit;
      dmg *= t.resist?.[id] ?? 1;
      dmg *= t.weak?.[id] ?? 1;
      if (shieldHp > 0) {
        const mult = COMBAT.shieldBreak[id] ?? 1;
        const absorbed = Math.min(shieldHp, dmg * mult);
        shieldHp -= absorbed;
        dmg -= absorbed / mult;
      }
      if (staggered > 0) dmg *= COMBAT.stagger.vulnerability;
      hp -= dmg;
      if (staggered <= 0) {
        poise += (dmg * COMBAT.poisePerDamage + (COMBAT.poiseBonus[id] ?? 0) * hit);
        if (poise >= t.poise) staggered = COMBAT.stagger.duration;
      }
      break;
    }
  }
  return time;
}

/** Enemy damage per second against the player (before difficulty damage scaling). */
function enemyDps(type, D) {
  const E = ENEMIES[type];
  const spellDps = (spells, every, acc) => {
    const avg = spells.reduce((s, [id, w]) => s + ENEMY_SPELLS[id].damage * w, 0) / spells.reduce((s, [, w]) => s + w, 0);
    return (avg / mean(every)) * acc;
  };
  const melee = (a, hits = 1) => ((a.damage * hits) / (a.cooldown + a.windup)) * M.meleeHitRate;
  switch (type) {
    case 'darkWizard':
      return spellDps(E.spells, E.castEvery, D.accuracy);
    case 'spider':
    case 'spiderling':
      return melee(E.bite) * D.aggression;
    case 'troll':
      return ((melee(E.slam) + melee(E.sweep)) / 2) * D.aggression;
    case 'werewolf':
      return melee(E.claw, E.claw.hits) * D.aggression;
    case 'armor':
      return melee(E.slash) * D.aggression;
    case 'pixie':
      return (E.pinch.damage / E.pinch.cooldown) * M.meleeHitRate * E.flock;
    default:
      return 0;
  }
}

function bossDps(D) {
  const B = BOSS.spiderQueen;
  return (((B.bite.damage / (B.bite.cooldown + B.bite.windup)) + (B.sweep.damage / (B.sweep.cooldown + B.sweep.windup))) / 2) * M.meleeHitRate * D.aggression;
}

/** Largest group of each enemy type in any encounter. */
const groupSize = {};
for (const list of Object.values(ENCOUNTERS)) {
  for (const z of list) {
    const c = {};
    for (const [type] of z.spawns) c[type] = (c[type] ?? 0) + 1;
    for (const [type, n] of Object.entries(c)) groupSize[type] = Math.max(groupSize[type] ?? 1, n);
  }
}

/**
 * Health spendable over a fight of `time` seconds vs damage taken.
 * Enemies of a group attack together (at most `attackers`) and fall one by one.
 */
function fightMargin(ttk, group, attackers, dps) {
  let taken = 0;
  for (let alive = group; alive > 0; alive--) taken += dps * Math.min(alive, attackers) * ttk;
  const time = ttk * group;
  const E = SPELLS.episkey;
  const heals = Math.floor((time / E.cooldown) * M.healUse) * E.heal;
  return taken > 0 ? (PLAYER.maxHealth + heals) / taken : Infinity;
}

const pad = (s, n) => String(s).padEnd(n);
const f1 = (x) => (x >= M.maxFight ? '∞' : x.toFixed(1));

// ------------------------------------------------------------------ combat
for (const [diffId, diff] of Object.entries(DIFFICULTIES)) {
  const D = AI_DIFFICULTY[diffId];
  console.log(`\n=== Zorluk: ${diff.label} (hasar ×${diff.damageTaken}, düşman canı ×${D.health}, aynı anda ${D.attackers} saldıran) ===`);
  console.log(pad('Düşman', 26) + pad('Can', 7) + M.masteryLevels.map((l) => pad(`TTK Ust.${l}`, 11)).join('') + pad('DPS→oyuncu', 12) + pad('Dayanma', 9) + pad('Pay', 7) + 'Durum');
  const rows = [];
  for (const [type, E] of Object.entries(ENEMIES)) {
    if (E.immune) continue;
    const hitFactor = 1 - (E.dodge?.chance ?? 0) * 0.5;
    rows.push({ id: type, name: E.name, t: { health: Math.round(E.health * D.health), maxHealth: Math.round(E.health * D.health), poise: E.poise, shield: E.shield, resist: E.resist, weak: E.weak, hitFactor }, dps: enemyDps(type, D), group: type === 'pixie' ? 1 : groupSize[type] ?? 1 });
  }
  const B = BOSS.spiderQueen;
  rows.push({ id: 'spiderQueen', name: B.name.split(',')[0], t: { health: Math.round(B.health * D.health), maxHealth: Math.round(B.health * D.health), poise: B.poise, finisher: COMBAT.finisher.bossDamage }, dps: bossDps(D), group: 1 });
  const V = VILLAIN;
  const vAvg = V.spells.reduce((s, [id, w]) => s + ENEMY_SPELLS[id].damage * w, 0);
  const vHealth = Math.round(V.health * D.health);
  rows.push({ id: 'villain', name: V.name, t: { health: vHealth, maxHealth: vHealth, poise: V.poise, finisher: COMBAT.finisher.bossDamage, shield: { ...ENEMIES.darkWizard.shield, cooldown: 4, react: V.shield }, hitFactor: 1 - V.dodge * 0.5 }, dps: (vAvg / mean(V.castEvery)) * V.accuracy, group: 1 });
  for (const r of rows) {
    const ttks = M.masteryLevels.map((l) => timeToKill(r.t, l));
    const mid = ttks[Math.floor(ttks.length / 2)];
    const tier = T.tiers[r.id] ?? 'standard';
    const [lo, hi] = T.ttk[tier] ?? [0, Infinity];
    const incoming = r.dps * diff.damageTaken * (1 - M.playerAvoid);
    const survive = incoming > 0 ? PLAYER.maxHealth / (incoming * Math.min(r.group, D.attackers)) : Infinity;
    const margin = fightMargin(mid, r.group, D.attackers, incoming);
    const fodder = tier === 'fodder';
    const [mlo, mhi] = T.margin[diffId];
    const okT = fodder || diffId !== 'normal' || (mid >= lo && mid <= hi);
    const okM = fodder || (margin >= mlo && (margin <= mhi || !Number.isFinite(margin)));
    console.log(pad(`${r.name}${r.group > 1 ? ` ×${r.group}` : ''}`, 26) + pad(r.t.health, 7) + ttks.map((x) => pad(f1(x) + ' s', 11)).join('') + pad(r.dps.toFixed(1), 12) + pad(Number.isFinite(survive) ? survive.toFixed(0) + ' s' : '∞', 9) + pad(Number.isFinite(margin) ? margin.toFixed(2) : '∞', 7) + (fodder ? 'sürü' : `${check(okT)} / ${check(okM)}`));
  }
}

// ------------------------------------------------------------------ duels
console.log('\n=== Düello Kulübü (canı sıfırlanınca pes eder) ===');
for (const p of DUEL.ladder) {
  const t = { health: p.health, maxHealth: p.health, poise: ENEMIES.darkWizard.poise, shield: { ...ENEMIES.darkWizard.shield, cooldown: 4, react: p.shield }, hitFactor: 1 - p.dodge * 0.5 };
  const avg = p.spells.reduce((s, [id, w]) => s + ENEMY_SPELLS[id].damage * w, 0);
  const dps = (avg / mean(p.castEvery)) * p.accuracy * (1 - M.playerAvoid);
  console.log(`${pad(`${p.name} (${p.title})`, 34)} TTK ${M.masteryLevels.map((l) => f1(timeToKill(t, l))).join(' / ')} s · oyuncu ${(PLAYER.maxHealth / dps).toFixed(0)} s dayanır`);
}

// ------------------------------------------------------------------ economy
console.log('\n=== Ekonomi (Galleon) ===');
const main = QUESTS.filter((q) => q.id.startsWith('main'));
const side = QUESTS.filter((q) => !q.id.startsWith('main'));
let money = ECONOMY.start;
const byQuest = [money];
for (const q of main) byQuest.push((money += q.reward?.galleons ?? 0));
const sideTotal = side.reduce((s, q) => s + (q.reward?.galleons ?? 0), 0);
const favours = Object.values(COMPANIONS).reduce((s, c) => s + (c.favour?.reward ?? 0), 0);
const races = RACES.reduce((s, r) => s + r.reward[0], 0);
const endTotal = money + sideTotal + favours + races + QUIDDITCH.reward.win;
console.log(`Başlangıç ${ECONOMY.start} · ana hikâye sonrası ${money} · yan görevler ${sideTotal} · dost ricaları ${favours} · yarış altınları ${races} · bir Quidditch galibiyeti ${QUIDDITCH.reward.win}`);
console.log(`Ana görevlere göre birikim: ${byQuest.join(' → ')}`);
console.log(`Hikâye + tüm yan içerik (düşman ödülleri hariç): ${endTotal}`);
const bought = Object.values(BROOMS).filter((b) => b.price > 0).sort((a, b) => a.price - b.price);
const first = bought[0];
const firstAt = byQuest.findIndex((m) => m >= first.price);
console.log(`İlk süpürge (${first.name}, ${first.price}): ${firstAt >= 0 ? `${firstAt}. ana görevden sonra` : 'ana hikâyede alınamıyor'} — ${check(firstAt >= 0 && firstAt <= T.firstBroomAfterQuests)}`);
const best = bought[bought.length - 1];
console.log(`En iyi süpürge (${best.name}, ${best.price}): hikâye + yan içerikle ${endTotal >= best.price ? 'alınabilir' : 'alınamaz'} — ${check(!T.bestBroomByEnd || endTotal >= best.price)}`);
const bounty = Object.entries(ECONOMY.bounty).map(([k, v]) => `${ENEMIES[k]?.name ?? BOSS[k]?.name.split(',')[0] ?? k} ${v}`).join(' · ');
console.log(`Düşman ödülleri: ${bounty}`);

console.log(failures ? `\n${failures} değer hedef aralığın dışında.` : '\nTüm değerler hedef aralıkta.');
process.exitCode = failures ? 1 : 0;
