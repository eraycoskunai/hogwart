/**
 * @file Balance model: the assumptions `tools/balance.mjs` uses to turn the
 * combat and economy data into time-to-kill, time-to-die and affordability
 * figures, and the target ranges those figures should stay inside. The game
 * itself does not read this file; it documents what "balanced" means so a
 * data change can be checked with one command (`node tools/balance.mjs`).
 */

export const BALANCE_MODEL = Object.freeze({
  /** Share of player bolts that land (moving targets, cover, enemy dodges). */
  playerHitRate: 0.75,
  /** Share of incoming damage the player avoids (Protego, dodge rolls, cover). */
  playerAvoid: 0.35,
  /** Share of melee attacks that connect (their wind-ups are telegraphed). */
  meleeHitRate: 0.6,
  /** Share of the fight spent attacking (the rest: moving, dodging, shielding). */
  uptime: 0.75,
  /** Seconds lost when switching the active spell (spell wheel or quick slot). */
  switchTime: 0.25,
  /** Share of Episkey's cooldown windows the player actually uses to heal in a long fight. */
  healUse: 0.5,
  /** Seconds the player spends on each finisher. */
  finisherTime: 0.9,
  /** Simulated fight length cap (s). */
  maxFight: 400,
  /** Damage spells the rotation may use, in the order it prefers them when ready. */
  rotation: ['confringo', 'stupefy', 'descendo', 'incendio', 'expelliarmus', 'glacius', 'depulso'],
  /** Mastery levels compared (1 = new student, 5 = mastered). */
  masteryLevels: [1, 3, 5],
});

/**
 * Targets. ttk (Normal difficulty): seconds to defeat one enemy at mastery 3.
 * margin (per difficulty): the health the player can spend in a fight
 * (full health plus the Episkey heals the fight's length allows) divided
 * by the damage taken while defeating a whole group, the attackers allowed
 * at once fighting together (above 1 = the player wins).
 */
export const BALANCE_TARGETS = Object.freeze({
  ttk: {
    /** Pack enemies (spiders come in threes) sit at the low end. */
    standard: [2.5, 16],
    heavy: [12, 35],
    boss: [45, 160],
  },
  /** Which enemies count as heavy / boss / fodder (fodder has no targets: swarms that die in a hit). */
  tiers: { troll: 'heavy', spiderQueen: 'boss', villain: 'boss', spiderling: 'fodder', pixie: 'fodder' },
  margin: {
    story: [2, 40],
    normal: [1.1, 12],
    hard: [0.6, 6],
  },
  /** Galleons: the first bought broom must be affordable after this many main quests… */
  firstBroomAfterQuests: 3,
  /** …and the best broom by the end of the main story plus side content. */
  bestBroomByEnd: true,
});
