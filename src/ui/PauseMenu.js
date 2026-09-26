/**
 * @file PauseMenu — the parchment menu. In play: save cards (thumbnail,
 * place, chapter, playtime, Galleons) with save / load / delete /
 * export and import from a file, the character sheet, friends, the
 * journal, and settings (gameplay, graphics, controls, audio). From the
 * title screen it opens in 'boot' mode (load and settings only).
 * Arrow keys move between controls; destructive actions ask twice.
 */
import { ACTIONS, describeCode } from '../data/input.js';
import { QUALITY_PRESETS, QUALITY_ORDER, RENDER_SCALES } from '../data/quality.js';
import { SETTING_RANGES, DIFFICULTIES, SPEECH_MODES } from '../data/settings.js';
import { UI_SCALES } from '../data/ui.js';

const TABS = {
  play: [['saves', 'Kayıtlar'], ['character', 'Karakter'], ['friends', 'Dostlar'], ['journal', 'Günlük'], ['gameplay', 'Oynanış'], ['graphics', 'Grafik'], ['controls', 'Kontroller'], ['audio', 'Ses']],
  boot: [['saves', 'Kayıt yükle'], ['gameplay', 'Oynanış'], ['graphics', 'Grafik'], ['controls', 'Kontroller'], ['audio', 'Ses']],
};

function slotName(slot) {
  if (slot === 'quick') return 'Hızlı kayıt';
  if (slot === 'auto') return 'Otomatik kayıt (en yeni)';
  if (String(slot).startsWith('auto')) return `Otomatik kayıt (${String(slot).slice(4)})`;
  return `Yuva ${slot}`;
}

function fmtPlaytime(sec) {
  const m = Math.floor((sec ?? 0) / 60);
  return `${Math.floor(m / 60)} sa ${String(m % 60).padStart(2, '0')} dk`;
}

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
   *          onResume:()=>void, onSave:(slot:string|number)=>Promise<boolean>|boolean, onLoad:(slot:string|number)=>void,
   *          onDelete:(slot:string|number)=>void, onExport:(slot:string|number)=>void, onImport:(text:string)=>void,
   *          onMap:()=>void, onMainMenu:()=>void, onClose:()=>void,
   *          getProfile:()=>string, getFriends:()=>string, getJournal:()=>string}} o
   */
  constructor(root, o) {
    this.root = root;
    this.o = o;
    this.tab = 'saves';
    this.mode = 'play';
    this.visible = false;
    this._confirm = null;
    this._status = '';
    root.addEventListener('click', (e) => this._onClick(e));
    root.addEventListener('input', (e) => this._onInput(e));
    root.addEventListener('change', (e) => this._onInput(e));
    this._onKey = (e) => this._key(e);
  }

  /** @param {'play'|'boot'} [mode] @param {string} [tab] */
  open(mode = 'play', tab) {
    this.mode = mode;
    const tabs = TABS[mode].map(([id]) => id);
    this.tab = tab && tabs.includes(tab) ? tab : tabs.includes(this.tab) ? this.tab : tabs[0];
    this.visible = true;
    this._confirm = null;
    this._status = '';
    this.root.classList.add('show');
    this.render();
    window.addEventListener('keydown', this._onKey);
    this.root.querySelector('.tab.active')?.focus();
  }

  close() {
    this.visible = false;
    this.o.input.cancelRebind();
    this.root.classList.remove('show');
    window.removeEventListener('keydown', this._onKey);
  }

  /** Show a status line under the tabs (saved, failed…). */
  status(text) {
    this._status = text;
    if (this.visible) this.render();
  }

  render() {
    const tabs = TABS[this.mode].map(([id, label]) => `<button class="tab ${this.tab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('');
    const footer = this.mode === 'boot'
      ? '<button class="primary" data-act="close">Kapat</button>'
      : '<button class="primary" data-act="resume">Devam Et</button><button data-act="map">Harita (M)</button><button data-act="mainMenu">Ana menüye dön</button>';
    this.root.innerHTML = `
      <div class="menu-panel parchment">
        <h1>${this.mode === 'boot' ? 'Hogwarts: Mühürlü Kule' : 'Duraklatıldı'}</h1>
        <nav class="tabs">${tabs}</nav>
        ${this._status ? `<p class="menu-status">${this._status}</p>` : ''}
        <section class="tab-body">${this['_' + this.tab]()}</section>
        <footer>${footer}</footer>
      </div>`;
  }

  _btn(act, slot, label, danger = false) {
    const c = this._confirm;
    const asking = c && c.act === act && String(c.slot) === String(slot);
    return `<button data-act="${act}" data-slot="${slot}" class="${danger ? 'danger' : ''}${asking ? ' asking' : ''}">${asking ? 'Emin misin?' : label}</button>`;
  }

  _saves() {
    const boot = this.mode === 'boot';
    const cards = this.o.saves.list().map((m) => {
      const manual = typeof m.slot === 'number';
      const M = m.meta ?? {};
      const thumb = M.thumb ? `<img src="${M.thumb}" alt="">` : '<div class="thumb-empty"></div>';
      const info = m.empty
        ? '<em>boş</em>'
        : `<small>${M.place ?? m.label ?? ''}${M.chapter ? ` · ${M.chapter}` : ''}</small>
           <small>${M.name ? `${M.name} · ${M.house ?? ''} · ` : ''}${fmtPlaytime(M.playtime)}${Number.isFinite(M.galleons) ? ` · ${M.galleons} G` : ''}</small>
           <small>${fmtDate(m.timestamp)}</small>`;
      const btns = [];
      if (manual && !boot) btns.push(m.empty ? this._btn('save', m.slot, 'Kaydet') : this._btn('overwrite', m.slot, 'Üzerine kaydet'));
      if (!m.empty) {
        btns.push(this._btn('load', m.slot, 'Yükle'));
        btns.push(this._btn('export', m.slot, 'Dışa aktar'));
        btns.push(this._btn('delete', m.slot, 'Sil', true));
      }
      return `<div class="save-card${m.empty ? ' empty' : ''}">${thumb}<div class="save-info"><strong>${slotName(m.slot)}</strong>${info}</div><div class="save-btns">${btns.join('')}</div></div>`;
    }).join('');
    return `
      <div class="save-tools"><button data-act="import">Dosyadan içe aktar…</button><input type="file" accept=".json,application/json" data-import hidden></div>
      <div class="save-list">${cards}</div>`;
  }

  _character() {
    return this.o.getProfile();
  }

  _friends() {
    return this.o.getFriends();
  }

  _journal() {
    return this.o.getJournal();
  }

  _gameplay() {
    const s = this.o.settings.values;
    const diff = Object.entries(DIFFICULTIES).map(([k, d]) => `<option value="${k}" ${s.difficulty === k ? 'selected' : ''}>${d.label}</option>`).join('');
    const scales = UI_SCALES.map((v) => `<option value="${v}" ${s.uiScale === v ? 'selected' : ''}>${Math.round(v * 100)}%</option>`).join('');
    return `
      <label class="row">Zorluk <select data-setting="difficulty">${diff}</select></label>
      <label class="row">Altyazılar <input type="checkbox" data-setting="showSubtitles" ${s.showSubtitles ? 'checked' : ''}></label>
      <label class="row">Mini harita <input type="checkbox" data-setting="showMinimap" ${s.showMinimap ? 'checked' : ''}></label>
      <label class="row">Görev takipçisi <input type="checkbox" data-setting="showTracker" ${s.showTracker ? 'checked' : ''}></label>
      <label class="row">Arayüz ölçeği <select data-setting="uiScale" data-type="number">${scales}</select></label>`;
  }

  _key(e) {
    if (!this.visible || this.o.input.isRebinding) return;
    const nav = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.code];
    if (!nav) return;
    const tag = /** @type {HTMLElement} */ (document.activeElement)?.tagName;
    // Sliders and selects keep their own arrow keys.
    if ((tag === 'INPUT' && /** @type {HTMLInputElement} */ (document.activeElement).type === 'range') || tag === 'SELECT') {
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') return;
    }
    const items = [...this.root.querySelectorAll('button:not([disabled]), input:not([hidden]), select')];
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(/** @type {any} */ (document.activeElement));
    const next = items[(i + nav + items.length) % items.length];
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  }

  _graphics() {
    const s = this.o.settings.values;
    const q = QUALITY_ORDER.map((k) => `<option value="${k}" ${s.quality === k ? 'selected' : ''}>${QUALITY_PRESETS[k].label}</option>`).join('');
    const rs = RENDER_SCALES.map((v) => `<option value="${v}" ${s.renderScale === v ? 'selected' : ''}>${Math.round(v * 100)}%</option>`).join('');
    const f = SETTING_RANGES.fov;
    return `
      <label class="row">Kalite <select data-setting="quality">${q}</select></label>
      <label class="row">Çözünürlük ölçeği <select data-setting="renderScale" data-type="number">${rs}</select></label>
      <label class="row">Dinamik çözünürlük <small>(FPS düşünce çözünürlüğü geçici olarak azaltır)</small> <input type="checkbox" data-setting="dynamicResolution" ${s.dynamicResolution ? 'checked' : ''}></label>
      <label class="row">FPS göstergesi <input type="checkbox" data-setting="showFps" ${s.showFps ? 'checked' : ''}></label>
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
    const raw = t.dataset.slot;
    const slot = raw != null && /^\d+$/.test(raw) ? Number(raw) : raw;
    const act = t.dataset.act;
    // Overwrite / delete / load over a running game ask twice.
    const risky = act === 'overwrite' || act === 'delete' || (act === 'load' && this.mode === 'play');
    if (risky && !(this._confirm && this._confirm.act === act && String(this._confirm.slot) === String(slot))) {
      this._confirm = { act, slot };
      this.render();
      return;
    }
    this._confirm = null;
    switch (act) {
      case 'resume':
        this.o.onResume();
        break;
      case 'close':
        this.o.onClose();
        break;
      case 'map':
        this.o.onMap();
        break;
      case 'mainMenu':
        this.o.onMainMenu();
        break;
      case 'save':
      case 'overwrite':
        Promise.resolve(this.o.onSave(slot)).then((ok) => this.status(ok ? `Kaydedildi: ${slotName(slot)}` : 'Kayıt başarısız — depolama dolu ya da kapalı olabilir.'));
        break;
      case 'load':
        this.o.onLoad(slot);
        break;
      case 'delete':
        this.o.onDelete(slot);
        this.status(`Silindi: ${slotName(slot)}`);
        break;
      case 'export':
        this.o.onExport(slot);
        break;
      case 'import': {
        const input = /** @type {HTMLInputElement} */ (this.root.querySelector('[data-import]'));
        input.onchange = async () => {
          const f = input.files?.[0];
          if (!f) return;
          this.o.onImport(await f.text());
          input.value = '';
        };
        input.click();
        break;
      }
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
