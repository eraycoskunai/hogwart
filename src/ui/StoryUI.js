/**
 * @file StoryUI — story overlays:
 *   - parchment: the acceptance letter / ending (promise resolves on the button)
 *   - tracker: current quest and objective (top left) with a waypoint
 *     marker and distance, or the region to go to
 *   - lesson panel: the running lesson's goal and timer
 *   - journal (L): every quest with its steps, and the House Cup
 *   - banners: chapter started / quest completed / house points
 */
import * as THREE from 'three';

/** Screen edge margin (px) for the waypoint marker; banner time (s). */
const EDGE = 44;
const BANNER = 3.5;
const REGION_NAMES = Object.freeze({ grounds: 'arazide', castle: 'şato içinde', testRoom: 'test salonunda' });
const _v = new THREE.Vector3();

export class StoryUI {
  /**
   * @param {HTMLElement} root
   * @param {import('../core/EventBus.js').EventBus} bus
   */
  constructor(root, bus) {
    const el = document.createElement('div');
    el.className = 'story-ui';
    el.innerHTML = `
      <div class="st-tracker"><b></b><span></span></div>
      <div class="st-lesson"><b></b><span></span><i></i></div>
      <div class="st-way"><span></span></div>
      <div class="st-banner"><small></small><b></b></div>
      <div class="st-journal"><h3>Günlük <small>L: kapat</small></h3><div class="st-cup"></div><div class="st-quests"></div></div>
      <div class="st-parchment"><div class="st-paper"><h2></h2><div class="st-lines"></div><em></em><button></button></div></div>`;
    root.appendChild(el);
    const q = (s) => /** @type {HTMLElement} */ (el.querySelector(s));
    this.el = {
      root: el, tracker: q('.st-tracker'), trName: q('.st-tracker b'), trText: q('.st-tracker span'),
      lesson: q('.st-lesson'), lsName: q('.st-lesson b'), lsText: q('.st-lesson span'), lsTime: q('.st-lesson i'),
      way: q('.st-way'), wayText: q('.st-way span'), banner: q('.st-banner'), bnSmall: q('.st-banner small'), bnBig: q('.st-banner b'),
      journal: q('.st-journal'), cup: q('.st-cup'), quests: q('.st-quests'),
      parchment: q('.st-parchment'), pTitle: q('.st-paper h2'), pLines: q('.st-lines'), pSign: q('.st-paper em'), pButton: q('.st-paper button'),
    };
    this.journalOpen = false;
    this._banner = 0;
    this._queue = [];
    this._off = [
      bus.on('quest:started', ({ name, main, silent }) => !silent && this.banner(main ? 'Yeni bölüm' : 'Yeni görev', name)),
      bus.on('quest:completed', ({ name, reward }) => this.banner('Görev tamamlandı', `${name}${reward.points ? ` · +${reward.points} puan` : ''}`)),
      bus.on('lesson:complete', ({ points }) => points > 0 && this.banner('Ders tamamlandı', `+${points} bina puanı`)),
    ];
  }

  banner(small, big) {
    this._queue.push([small, big]);
  }

  /** Show the parchment; resolves when its button is pressed. */
  show(o) {
    const E = this.el;
    E.pTitle.textContent = o.title;
    E.pLines.innerHTML = o.lines.map((l) => `<p>${l.replace(/</g, '&lt;')}</p>`).join('');
    E.pSign.textContent = o.signature ?? '';
    E.pButton.textContent = o.button ?? 'Devam';
    E.parchment.classList.add('show');
    this.parchmentOpen = true;
    return new Promise((resolve) => {
      const done = () => {
        E.pButton.removeEventListener('click', done);
        window.removeEventListener('keydown', key);
        E.parchment.classList.remove('show');
        this.parchmentOpen = false;
        resolve();
      };
      const key = (e) => {
        if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') {
          e.preventDefault();
          done();
        }
      };
      E.pButton.addEventListener('click', done);
      // Keys only after a moment, so a held key does not skip the letter.
      setTimeout(() => this.parchmentOpen && window.addEventListener('keydown', key), 600);
    });
  }

  toggleJournal() {
    this.journalOpen = !this.journalOpen;
    this.el.journal.classList.toggle('show', this.journalOpen);
    this._journalT = 0;
  }

  /**
   * @param {number} dt
   * @param {{tracker:any, lesson:any, journal:any[], standings:any[], camera:THREE.Camera, width:number, height:number, player:any, region:string, hidden:boolean}} s
   */
  update(dt, s) {
    const E = this.el;
    // Banners, one at a time.
    if (this._banner > 0 && (this._banner -= dt) <= 0) E.banner.classList.remove('show');
    if (this._banner <= 0 && this._queue.length) {
      const [a, b] = this._queue.shift();
      E.bnSmall.textContent = a;
      E.bnBig.textContent = b;
      E.banner.classList.add('show');
      this._banner = BANNER;
    }
    const t = s.hidden ? null : s.tracker;
    E.tracker.classList.toggle('show', !!t);
    let way = null;
    if (t) {
      E.trName.textContent = t.name;
      let where = '';
      const T = t.target;
      if (T) {
        if (T.region !== s.region) where = ` — ${REGION_NAMES[T.region] ?? T.region}`;
        else {
          const [x, y, z] = T.pos;
          _v.set(x, y ?? s.player.position.y, z);
          const d = _v.distanceTo(s.player.position);
          where = ` — ${Math.round(d)} m`;
          if (d > 4) way = { pos: _v.clone().setY(_v.y + 1.2), d };
        }
      }
      E.trText.textContent = t.text + where;
    }
    this._way(way, s);
    const L = s.hidden ? null : s.lesson;
    E.lesson.classList.toggle('show', !!L);
    if (L) {
      E.lsName.textContent = L.name;
      E.lsText.textContent = L.text;
      E.lsTime.textContent = L.time != null ? `${Math.ceil(L.time)} s` : '';
    }
    if (this.journalOpen) {
      this._journalT = (this._journalT ?? 0) - dt;
      if (this._journalT <= 0) {
        this._journalT = 0.5;
        this._renderJournal(s.journal, s.standings);
      }
    }
  }

  _way(way, s) {
    const m = this.el.way;
    if (!way) {
      m.style.display = 'none';
      return;
    }
    _v.copy(way.pos).project(s.camera);
    const behind = _v.z > 1;
    let x = behind ? -_v.x : _v.x;
    let y = behind ? -_v.y : _v.y;
    const hw = s.width / 2;
    const hh = s.height / 2;
    let px = hw + x * hw;
    let py = hh - y * hh;
    const off = behind || Math.abs(x) > 1 || Math.abs(y) > 1;
    if (off) {
      const dx = px - hw;
      const dy = py - hh;
      const k = Math.min((hw - EDGE) / Math.max(1e-3, Math.abs(dx)), (hh - EDGE) / Math.max(1e-3, Math.abs(dy)));
      px = hw + dx * k;
      py = hh + dy * k;
    }
    m.style.display = 'block';
    m.style.transform = `translate(${px}px, ${py}px)`;
    m.classList.toggle('off', off);
    this.el.wayText.textContent = `${Math.round(way.d)} m`;
  }

  _renderJournal(quests, standings) {
    this.el.cup.innerHTML = `<h4>Bina Kupası</h4>${standings.map((h) => `<div class="st-house${h.mine ? ' mine' : ''}" style="--c:${h.color}"><span>${h.label}</span><b>${h.points}</b></div>`).join('')}`;
    const row = (q) => `
      <div class="st-q${q.done ? ' done' : ''}">
        <b>${q.main ? `Bölüm ${q.chapter}: ` : ''}${q.name}${q.done ? ' ✓' : ''}</b>
        <small>${q.desc}</small>
        ${q.steps.map((st) => `<div class="st-step${st.done ? ' done' : st.current ? ' cur' : ''}">${st.done ? '✓' : st.current ? '▸' : '·'} ${st.text}</div>`).join('')}
      </div>`;
    const main = quests.filter((q) => q.main);
    const side = quests.filter((q) => !q.main);
    this.el.quests.innerHTML = `<h4>Ana hikâye</h4>${main.map(row).join('') || '<small>Henüz başlamadı.</small>'}<h4>Yan görevler</h4>${side.map(row).join('')}`;
  }

  dispose() {
    for (const off of this._off) off();
    this.el.root.remove();
  }
}
