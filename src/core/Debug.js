/**
 * @file Debug — F3 developer panel: FPS / frame-time graph, draw calls,
 * memory, physics statistics, player state, AI states, toggles (collision
 * shapes, noclip, god mode), time scale and a teleport menu.
 */

export const DEBUG_UI = Object.freeze({
  textRefresh: 0.2,
  graphSamples: 120,
  graphMaxMs: 50,
  targetMs60: 1000 / 60,
  targetMs30: 1000 / 30,
});

/**
 * @typedef {Object} DebugProvider
 * @property {() => Record<string, Record<string, string|number>>} getSections
 * @property {() => {name:string, state:string}[]} getEntities
 * @property {{name:string}[]} teleports
 * @property {Record<string, (arg?:any) => any>} actions
 * @property {() => Record<string, boolean>} getToggles
 */

export class Debug {
  /**
   * @param {HTMLElement} root
   * @param {import('./EventBus.js').EventBus} bus
   * @param {DebugProvider} provider
   */
  constructor(root, bus, provider) {
    this.root = root;
    this.bus = bus;
    this.p = provider;
    this.visible = false;
    this._timer = 0;
    this._samples = new Float32Array(DEBUG_UI.graphSamples);
    this._sampleIdx = 0;

    root.innerHTML = `
      <div class="dbg-head">Hata Ayıklama <small>F3</small></div>
      <canvas class="dbg-graph" width="240" height="60"></canvas>
      <div class="dbg-stats"></div>
      <div class="dbg-section"><h4>Seçenekler</h4><div class="dbg-toggles"></div>
        <label class="dbg-row">Zaman ölçeği <input type="range" min="0.1" max="2" step="0.05" value="1" data-dbg="timeScale"><output>1.00</output></label>
        <div class="dbg-buttons">
          <button data-dbg-act="cinematic">Sinematik</button>
          <button data-dbg-act="damage">25 hasar</button>
          <button data-dbg-act="heal">İyileş</button>
          <button data-dbg-act="resetProps">Nesneleri sıfırla</button>
          <button data-dbg-act="hitStop">Hit-stop</button>
          <button data-dbg-act="shake">Sarsıntı</button>
        </div>
      </div>
      <div class="dbg-section"><h4>Işınlan</h4><div class="dbg-teleports"></div></div>
      <div class="dbg-section"><h4>Yapay zekâ / varlıklar</h4><div class="dbg-ai"></div></div>`;
    this.graph = /** @type {HTMLCanvasElement} */ (root.querySelector('.dbg-graph'));
    this.g = this.graph.getContext('2d');
    this.statsEl = root.querySelector('.dbg-stats');
    this.aiEl = root.querySelector('.dbg-ai');
    this.togglesEl = root.querySelector('.dbg-toggles');
    root.querySelector('.dbg-teleports').innerHTML = provider.teleports
      .map((t, i) => `<button data-dbg-tp="${i}">${t.name}</button>`)
      .join('');

    root.addEventListener('click', (e) => {
      const b = /** @type {HTMLElement} */ (e.target).closest('button');
      if (!b) return;
      if (b.dataset.dbgTp != null) this.p.actions.teleport(Number(b.dataset.dbgTp));
      else if (b.dataset.dbgAct) this.p.actions[b.dataset.dbgAct]?.();
      else if (b.dataset.dbgToggle) this.p.actions.toggle(b.dataset.dbgToggle);
      this._renderToggles();
    });
    root.addEventListener('input', (e) => {
      const el = /** @type {HTMLInputElement} */ (e.target);
      if (el.dataset.dbg === 'timeScale') {
        this.p.actions.timeScale(Number(el.value));
        el.nextElementSibling.textContent = Number(el.value).toFixed(2);
      }
    });
    this._renderToggles();
  }

  toggle(force) {
    this.visible = force ?? !this.visible;
    this.root.classList.toggle('show', this.visible);
    this.bus.emit('debug:visible', { visible: this.visible });
    if (this.visible) this._renderToggles();
  }

  _renderToggles() {
    const labels = { collision: 'Çarpışma şekilleri', noclip: 'Noclip (uç)', god: 'Ölümsüzlük', hud: 'HUD' };
    const t = this.p.getToggles();
    this.togglesEl.innerHTML = Object.entries(labels)
      .map(([k, l]) => `<button class="${t[k] ? 'on' : ''}" data-dbg-toggle="${k}">${l}: ${t[k] ? 'açık' : 'kapalı'}</button>`)
      .join('');
  }

  /**
   * @param {number} frameMs real frame time in ms
   * @param {number} dt real seconds
   */
  update(frameMs, dt) {
    this._samples[this._sampleIdx] = frameMs;
    this._sampleIdx = (this._sampleIdx + 1) % this._samples.length;
    if (!this.visible) return;
    this._drawGraph();
    this._timer -= dt;
    if (this._timer > 0) return;
    this._timer = DEBUG_UI.textRefresh;
    this._renderToggles();

    const sections = this.p.getSections();
    this.statsEl.innerHTML = Object.entries(sections)
      .map(([title, rows]) => `<div class="dbg-section"><h4>${title}</h4>${Object.entries(rows)
        .map(([k, v]) => `<div class="dbg-kv"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`)
      .join('');
    this.aiEl.innerHTML = this.p.getEntities()
      .map((e) => `<div class="dbg-kv"><span>${e.name}</span><b>${e.state}</b></div>`)
      .join('');
  }

  _drawGraph() {
    const { g, graph } = this;
    const w = graph.width;
    const h = graph.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 0, w, h);
    const yFor = (ms) => h - (Math.min(ms, DEBUG_UI.graphMaxMs) / DEBUG_UI.graphMaxMs) * h;
    g.strokeStyle = 'rgba(120,255,160,0.5)';
    g.beginPath();
    g.moveTo(0, yFor(DEBUG_UI.targetMs60));
    g.lineTo(w, yFor(DEBUG_UI.targetMs60));
    g.stroke();
    g.strokeStyle = 'rgba(255,200,80,0.5)';
    g.beginPath();
    g.moveTo(0, yFor(DEBUG_UI.targetMs30));
    g.lineTo(w, yFor(DEBUG_UI.targetMs30));
    g.stroke();
    const n = this._samples.length;
    const bw = w / n;
    for (let i = 0; i < n; i++) {
      const ms = this._samples[(this._sampleIdx + i) % n];
      g.fillStyle = ms > DEBUG_UI.targetMs30 ? '#ff5a5a' : ms > DEBUG_UI.targetMs60 + 1 ? '#ffc84a' : '#6dff9a';
      const y = yFor(ms);
      g.fillRect(i * bw, y, Math.max(1, bw - 0.5), h - y);
    }
  }
}
