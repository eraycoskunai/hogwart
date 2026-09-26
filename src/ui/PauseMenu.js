/**
 * @file PauseMenu — parchment-styled pause overlay with save/load slots,
 * graphics, controls (key rebinding), audio and gameplay settings.
 */
import { ACTIONS, describeCode } from '../data/input.js';
import { QUALITY_PRESETS, QUALITY_ORDER, RENDER_SCALES } from '../data/quality.js';
import { SETTING_RANGES, DIFFICULTIES, SPEECH_MODES } from '../data/settings.js';

const TABS = [
  ['game', 'Oyun'],
  ['graphics', 'Grafik'],
  ['controls', 'Kontroller'],
  ['audio', 'Ses'],
];

const FX_LABELS = [
  ['bloom', 'Parlama (bloom)'],
  ['ao', 'Ortam kapatma (GTAO)'],
  ['godRays', 'Işık huzmeleri'],
  ['dust', 'Havada toz'],
];

const VOLUME_LABELS = { master: 'Ana ses', music: 'Müzik', sfx: 'Efektler', ambience: 'Ortam', voice: 'Konuşma' };

function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return new Date(ts).toISOString();
  }
}

export class PauseMenu {
  /**
   * @param {HTMLElement} root
   * @param {{settings:import('../core/Settings.js').Settings, input:import('../core/Input.js').Input,
   *          saves:import('../core/SaveSystem.js').SaveSystem,
   *          onResume:()=>void, onSave:(slot:string|number)=>void, onLoad:(slot:string|number)=>void}} o
   */
  constructor(root, o) {
    this.root = root;
    this.o = o;
    this.tab = 'game';
    this.visible = false;
    root.addEventListener('click', (e) => this._onClick(e));
    root.addEventListener('input', (e) => this._onInput(e));
    root.addEventListener('change', (e) => this._onInput(e));
  }

  open() {
    this.visible = true;
    this.root.classList.add('show');
    this.render();
  }

  close() {
    this.visible = false;
    this.o.input.cancelRebind();
    this.root.classList.remove('show');
  }

  render() {
    const tabs = TABS.map(([id, label]) => `<button class="tab ${this.tab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('');
    this.root.innerHTML = `
      <div class="menu-panel parchment">
        <h1>Duraklatıldı</h1>
        <nav class="tabs">${tabs}</nav>
        <section class="tab-body">${this['_' + this.tab]()}</section>
        <footer><button class="primary" data-act="resume">Devam Et</button></footer>
      </div>`;
  }

  _game() {
    const slots = this.o.saves.list().map((m) => {
      const name = m.slot === 'auto' ? 'Otomatik kayıt' : `Yuva ${m.slot}`;
      const info = m.empty ? '<em>boş</em>' : `${m.label || ''} · ${fmtDate(m.timestamp)}`;
      const save = m.slot === 'auto' ? '' : `<button data-act="save" data-slot="${m.slot}">Kaydet</button>`;
      const load = m.empty ? '' : `<button data-act="load" data-slot="${m.slot}">Yükle</button>`;
      return `<div class="slot"><div><strong>${name}</strong><small>${info}</small></div><div>${save}${load}</div></div>`;
    }).join('');
    const s = this.o.settings.values;
    const diff = Object.entries(DIFFICULTIES).map(([k, d]) => `<option value="${k}" ${s.difficulty === k ? 'selected' : ''}>${d.label}</option>`).join('');
    return `
      <h3>Kayıtlar</h3><div class="slots">${slots}</div>
      <h3>Oynanış</h3>
      <label class="row">Zorluk <select data-setting="difficulty">${diff}</select></label>
      <label class="row">Altyazılar <input type="checkbox" data-setting="showSubtitles" ${s.showSubtitles ? 'checked' : ''}></label>`;
  }

  _graphics() {
    const s = this.o.settings.values;
    const q = QUALITY_ORDER.map((k) => `<option value="${k}" ${s.quality === k ? 'selected' : ''}>${QUALITY_PRESETS[k].label}</option>`).join('');
    const rs = RENDER_SCALES.map((v) => `<option value="${v}" ${s.renderScale === v ? 'selected' : ''}>${Math.round(v * 100)}%</option>`).join('');
    const f = SETTING_RANGES.fov;
    return `
      <label class="row">Kalite <select data-setting="quality">${q}</select></label>
      <label class="row">Çözünürlük ölçeği <select data-setting="renderScale" data-type="number">${rs}</select></label>
      <label class="row">Görüş alanı (FOV) <span><input type="range" data-setting="fov" data-type="number" min="${f.min}" max="${f.max}" step="${f.step}" value="${s.fov}"><output>${s.fov}°</output></span></label>
      <h3>Efektler <small>(kalite ayarı izin veriyorsa)</small></h3>
      ${FX_LABELS.map(([k, label]) => `<label class="row">${label} <input type="checkbox" data-fx="${k}" ${s.fx?.[k] !== false ? 'checked' : ''}></label>`).join('')}
      <p class="note">Doku çözünürlüğü ve parçacık sayıları sayfa yeniden yüklenince uygulanır.</p>`;
  }

  _controls() {
    const s = this.o.settings.values;
    const ms = SETTING_RANGES.mouseSensitivity;
    const gs = SETTING_RANGES.gamepadSensitivity;
    const rows = Object.entries(ACTIONS).map(([action, def]) => {
      const b = this.o.input.bindings[action] ?? [];
      const cell = (slot) => def.rebindable
        ? `<button class="bind" data-act="bind" data-action="${action}" data-slot="${slot}">${describeCode(b[slot])}</button>`
        : `<span class="bind fixed">${describeCode(b[slot])}</span>`;
      return `<tr><td>${def.label}</td><td>${cell(0)}</td><td>${cell(1)}</td></tr>`;
    }).join('');
    return `
      <label class="row">Fare hassasiyeti <span><input type="range" data-setting="mouseSensitivity" data-type="number" min="${ms.min}" max="${ms.max}" step="${ms.step}" value="${s.mouseSensitivity}"><output>${s.mouseSensitivity.toFixed(2)}</output></span></label>
      <label class="row">Gamepad hassasiyeti <span><input type="range" data-setting="gamepadSensitivity" data-type="number" min="${gs.min}" max="${gs.max}" step="${gs.step}" value="${s.gamepadSensitivity}"><output>${s.gamepadSensitivity.toFixed(2)}</output></span></label>
      <label class="row">Y eksenini ters çevir <input type="checkbox" data-setting="invertY" ${s.invertY ? 'checked' : ''}></label>
      <h3>Tuş atama <small>(tıkla, sonra yeni tuşa bas · Esc iptal)</small></h3>
      <table class="binds"><tr><th>Eylem</th><th>Birincil</th><th>İkincil</th></tr>${rows}</table>
      <button data-act="resetBinds">Varsayılan tuşlar</button>`;
  }

  _audio() {
    const v = this.o.settings.values.volume;
    const rows = Object.entries(VOLUME_LABELS).map(([k, label]) =>
      `<label class="row">${label} <span><input type="range" data-volume="${k}" min="0" max="1" step="0.05" value="${v[k]}"><output>${Math.round(v[k] * 100)}%</output></span></label>`,
    ).join('');
    const s = this.o.settings.values;
    const speech = Object.entries(SPEECH_MODES).map(([k, l]) => `<option value="${k}" ${s.speech === k ? 'selected' : ''}>${l}</option>`).join('');
    return `${rows}
      <label class="row">Karakter konuşması <select data-setting="speech">${speech}</select></label>
      <label class="row">Altyazılar <input type="checkbox" data-setting="showSubtitles" ${s.showSubtitles ? 'checked' : ''}></label>
      <p class="note">Tüm sesler ve müzik gerçek zamanlı sentezlenir; ilk tıklamada ses motoru açılır.</p>`;
  }

  _onClick(e) {
    const t = /** @type {HTMLElement} */ (e.target).closest('button');
    if (!t) return;
    if (t.dataset.tab) {
      this.tab = t.dataset.tab;
      this.render();
      return;
    }
    const slot = t.dataset.slot === 'auto' ? 'auto' : Number(t.dataset.slot);
    switch (t.dataset.act) {
      case 'resume':
        this.o.onResume();
        break;
      case 'save':
        this.o.onSave(slot);
        this.render();
        break;
      case 'load':
        this.o.onLoad(slot);
        break;
      case 'bind': {
        t.textContent = '…';
        t.classList.add('waiting');
        this.o.input.startRebind(t.dataset.action, Number(t.dataset.slot)).then(() => {
          if (this.visible) this.render();
        });
        break;
      }
      case 'resetBinds':
        this.o.input.resetBindings();
        this.render();
        break;
      default:
    }
  }

  _onInput(e) {
    const el = /** @type {HTMLInputElement} */ (e.target);
    const settings = this.o.settings;
    if (el.dataset.volume) {
      const vol = { ...settings.get('volume'), [el.dataset.volume]: Number(el.value) };
      settings.set('volume', vol);
      const out = el.parentElement.querySelector('output');
      if (out) out.textContent = `${Math.round(Number(el.value) * 100)}%`;
      return;
    }
    if (el.dataset.fx) {
      if (e.type !== 'change') return;
      settings.set('fx', { ...settings.get('fx'), [el.dataset.fx]: el.checked });
      return;
    }
    const key = el.dataset.setting;
    if (!key) return;
    let value = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.type === 'number') value = Number(value);
    // Sliders update live on 'input'; selects/checkboxes on 'change'.
    if (e.type === 'input' && el.type !== 'range') return;
    settings.set(key, value);
    const out = el.parentElement.querySelector('output');
    if (out) out.textContent = key === 'fov' ? `${value}°` : Number(value).toFixed(2);
  }
}
