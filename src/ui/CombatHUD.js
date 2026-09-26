/**
 * @file CombatHUD — combat overlay: health / stun / shield bars floating
 * over nearby foes, the big bar for a boss or duel opponent (with the boss
 * phase), the duel countdown, banners (staggered → finisher, parry, shield
 * broken, boss phases, victory), the player's status (stunned, webbed) and
 * the frost vignette of the Solgun's aura. Pure DOM.
 */
import * as THREE from 'three';

export const COMBAT_HUD = Object.freeze({
  /** Floating bars: max distance (m) and pool size. */
  barRange: 32,
  maxBars: 10,
  bannerLife: 2.2,
});

const _p = new THREE.Vector3();

export class CombatHUD {
  /**
   * @param {HTMLElement} root the HUD root
   * @param {import('../core/EventBus.js').EventBus} bus
   */
  constructor(root, bus) {
    const el = document.createElement('div');
    el.className = 'combat-hud';
    el.innerHTML = `
      <div class="cb-frost"></div>
      <div class="cb-bars"></div>
      <div class="cb-boss"><div class="cb-boss-name"><b></b><small></small></div><div class="cb-boss-bar"><i class="hp"></i></div><div class="cb-boss-poise"><i></i></div></div>
      <div class="cb-count"></div>
      <div class="cb-banner"></div>
      <div class="cb-status"></div>`;
    root.appendChild(el);
    const q = (s) => /** @type {HTMLElement} */ (el.querySelector(s));
    this.el = {
      root: el,
      frost: q('.cb-frost'),
      bars: q('.cb-bars'),
      boss: q('.cb-boss'),
      bossName: q('.cb-boss-name b'),
      bossPhase: q('.cb-boss-name small'),
      bossHp: q('.cb-boss-bar i'),
      bossPoise: q('.cb-boss-poise i'),
      count: q('.cb-count'),
      banner: q('.cb-banner'),
      status: q('.cb-status'),
    };
    this.pool = [];
    for (let i = 0; i < COMBAT_HUD.maxBars; i++) {
      const b = document.createElement('div');
      b.className = 'cb-bar';
      b.innerHTML = '<i class="sh"></i><i class="hp"></i><i class="po"></i>';
      this.el.bars.appendChild(b);
      this.pool.push({ el: b, sh: /** @type {HTMLElement} */ (b.children[0]), hp: /** @type {HTMLElement} */ (b.children[1]), po: /** @type {HTMLElement} */ (b.children[2]) });
    }
    this._banner = 0;
    this._count = 0;
    /** @type {any} */
    this.focus = null;
    const banner = (text, kind) => this.banner(text, kind);
    this._off = [
      bus.on('combat:staggered', ({ enemy }) => banner(`${enemy.name} sersemledi — bitirici büyü!`, 'stagger')),
      bus.on('combat:parried', ({ player }) => player && banner('Savuşturma!', 'parry')),
      bus.on('combat:shieldBroken', () => banner('Kalkan kırıldı!', 'break')),
      bus.on('combat:bossPhase', ({ label }) => banner(label, 'boss')),
      bus.on('combat:bossDefeated', ({ enemy }) => banner(`${enemy.name} yenildi!`, 'victory')),
      bus.on('combat:finisher', () => banner('Bitirici büyü!', 'stagger')),
      bus.on('combat:dodged', () => banner('Kaçındın', 'parry')),
      bus.on('duel:countdown', ({ n }) => this.countdown(n)),
      bus.on('duel:result', ({ won, text }) => banner(text, won ? 'victory' : 'break')),
    ];
  }

  /** @param {string} text @param {string} [kind] */
  banner(text, kind = '') {
    const b = this.el.banner;
    b.textContent = text;
    b.dataset.kind = kind;
    b.classList.add('show');
    this._banner = COMBAT_HUD.bannerLife;
  }

  /** Big duel countdown number (0 → "Başla!"). @param {number} n */
  countdown(n) {
    const c = this.el.count;
    c.textContent = n > 0 ? String(n) : 'Başla!';
    c.classList.remove('show');
    void c.offsetWidth;
    c.classList.add('show');
    this._count = 0.9;
  }

  /**
   * @param {number} dt
   * @param {{enemies:any[], camera:import('three').Camera, width:number, height:number, player:any, chill:number, focus:any}} s
   */
  update(dt, s) {
    if (this._banner > 0) {
      this._banner -= dt;
      if (this._banner <= 0) this.el.banner.classList.remove('show');
    }
    if (this._count > 0) {
      this._count -= dt;
      if (this._count <= 0) this.el.count.classList.remove('show');
    }
    // Floating bars over foes that are fighting or hurt.
    let used = 0;
    const cam = s.camera;
    const pp = s.player.position;
    for (const e of s.enemies) {
      if (used >= this.pool.length) break;
      if (e.dead || e === s.focus || e.def.immune) continue;
      if (!(e.engaged || e.health < e.maxHealth)) continue;
      const d = e.position.distanceTo(pp);
      if (d > COMBAT_HUD.barRange) continue;
      const v = e.headPoint(_p).setY(e.position.y + e.def.height + 0.35).project(cam);
      if (v.z >= 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
      const b = this.pool[used++];
      b.el.style.display = 'block';
      b.el.style.transform = `translate(${((v.x + 1) / 2) * s.width}px, ${((1 - v.y) / 2) * s.height}px) translate(-50%, -100%)`;
      b.el.style.opacity = String(Math.min(1, (COMBAT_HUD.barRange - d) / 6));
      b.hp.style.transform = `scaleX(${Math.max(0, e.health / e.maxHealth)})`;
      b.po.style.transform = `scaleX(${e.status.staggered > 0 ? 1 : e.poise / e.maxPoise})`;
      b.el.classList.toggle('staggered', e.status.staggered > 0);
      const sh = e.shield && e.shield.time > 0 ? Math.max(0, e.shield.health / e.def.shield.health) : 0;
      b.sh.style.transform = `scaleX(${sh})`;
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i].el.style.display = 'none';

    // Boss / duel opponent.
    const f = s.focus;
    this.el.boss.classList.toggle('show', !!f && !f.dead);
    if (f && !f.dead) {
      this.el.bossName.textContent = f.name;
      this.el.bossPhase.textContent = f.phaseLabel ?? f.profile?.title ?? '';
      this.el.bossHp.style.transform = `scaleX(${Math.max(0, f.health / f.maxHealth)})`;
      this.el.bossPoise.style.transform = `scaleX(${f.status.staggered > 0 ? 1 : f.poise / f.maxPoise})`;
      this.el.boss.classList.toggle('staggered', f.status.staggered > 0);
    }

    const p = s.player;
    const status = p.stunned > 0 ? 'Sersemledin!' : p.slowed > 0 ? 'Ağa takıldın — yavaşsın' : '';
    if (status !== this._status) {
      this._status = status;
      this.el.status.textContent = status;
      this.el.status.classList.toggle('show', !!status);
    }
    this.el.frost.style.opacity = String(Math.min(1, s.chill * 1.2));
  }

  dispose() {
    for (const off of this._off) off();
    this.el.root.remove();
  }
}
