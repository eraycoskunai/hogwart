/**
 * @file FriendsPanel — the "Dostlar" overlay (J): every companion with
 * house colour, personality, friendship level and progress, where they
 * are right now according to their routine, and their favour. Refreshed
 * while open; gameplay keeps running underneath.
 */

/** Seconds between refreshes while open. */
const REFRESH = 0.5;

export class FriendsPanel {
  /** @param {HTMLElement} root */
  constructor(root) {
    const el = document.createElement('div');
    el.className = 'friends';
    el.innerHTML = '<h3>Dostlar <small>J: kapat</small></h3><div class="fr-list"></div>';
    root.appendChild(el);
    this.el = el;
    this.list = /** @type {HTMLElement} */ (el.querySelector('.fr-list'));
    this.open = false;
    this._t = 0;
  }

  toggle() {
    this.open = !this.open;
    this.el.classList.toggle('show', this.open);
    this._t = 0;
  }

  /**
   * @param {number} dt
   * @param {() => any[]} summary
   */
  update(dt, summary) {
    if (!this.open) return;
    this._t -= dt;
    if (this._t > 0) return;
    this._t = REFRESH;
    this.list.innerHTML = summary()
      .map((f) => `
        <div class="fr-card" style="--house:${f.color}">
          <div class="fr-top"><b>${f.met ? f.name : '???'}</b><span>${f.house}</span></div>
          <div class="fr-traits">${f.met ? f.traits : 'Henüz tanışmadınız.'}</div>
          <div class="fr-level">${f.level} · ${f.affinity}/100<div class="fr-bar"><i style="transform:scaleX(${f.progress})"></i></div></div>
          <div class="fr-where">${f.where}</div>
          ${f.favour ? `<div class="fr-favour">${f.favour}</div>` : ''}
        </div>`)
      .join('');
  }

  dispose() {
    this.el.remove();
  }
}
