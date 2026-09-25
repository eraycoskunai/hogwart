/**
 * @file CharacterCreator — DOM panel of the character creation screen:
 * name and voice, body, face, colours, hair and accessories tabs with
 * sliders / swatches, random and reset, plus preview controls (outfit,
 * house colours, pose, expression). Edits a character description and
 * pushes it to the CreatorStage; "Başla" hands it to the game.
 */
import {
  SLIDERS, SKIN_TONES, HAIR_COLORS, EYE_COLORS, HAIR_STYLES, GLASSES, LOWER_GARMENTS, HOUSES, OUTFITS,
  DEFAULT_APPEARANCE, EXPRESSIONS,
} from '../data/character.js';
import { sanitizeCharacter, randomAppearance, randomName } from '../procgen/characters/Appearance.js';
import { describeWand } from '../procgen/characters/WandGenerator.js';

const TABS = Object.freeze([
  { id: 'identity', label: 'Kimlik', framing: 'body' },
  { id: 'body', label: 'Beden', framing: 'body' },
  { id: 'face', label: 'Yüz', framing: 'face' },
  { id: 'colors', label: 'Renkler', framing: 'face' },
  { id: 'hair', label: 'Saç', framing: 'face' },
  { id: 'extras', label: 'Aksesuar', framing: 'body' },
]);

const POSES = Object.freeze([
  ['idle', 'Duruş'], ['walk', 'Yürü'], ['run', 'Koş'], ['cast', 'Büyü'], ['wave', 'Selam'], ['shield', 'Kalkan'], ['dodge', 'Yuvarlan'], ['flight', 'Uçuş'],
]);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class CharacterCreator {
  /**
   * @param {HTMLElement} root
   * @param {{stage:import('../world/CreatorStage.js').CreatorStage, onDone:(data:any)=>void, onCancel:()=>void}} o
   */
  constructor(root, o) {
    this.root = root;
    this.o = o;
    this.tab = 'identity';
    this.previewHouse = 'none';
    this.previewOutfit = 'uniform';
    root.addEventListener('click', (e) => this._onClick(e));
    root.addEventListener('input', (e) => this._onInput(e));
  }

  /**
   * @param {any} data starting character
   * @param {{confirmLabel?:string}} [opts]
   */
  show(data, opts = {}) {
    this.data = sanitizeCharacter(data);
    this.previewHouse = this.data.house;
    this.previewOutfit = this.data.outfit;
    this.confirmLabel = opts.confirmLabel ?? 'Başla';
    this.root.classList.add('show');
    this._render();
  }

  hide() {
    this.root.classList.remove('show');
    this.root.innerHTML = '';
  }

  /** Description handed to the stage (with preview-only house / outfit). */
  _stageData() {
    return { ...this.data, house: this.previewHouse, outfit: this.previewOutfit };
  }

  _push(now = false) {
    this.o.stage.setData(this._stageData(), now);
  }

  // ------------------------------------------------------------- render

  _render() {
    const d = this.data;
    this.root.innerHTML = `
      <aside class="cc-panel parchment">
        <h1>Öğrenci Yarat</h1>
        <nav class="tabs">${TABS.map((t) => `<button class="tab ${t.id === this.tab ? 'active' : ''}" data-cc-tab="${t.id}">${t.label}</button>`).join('')}</nav>
        <div class="tab-body cc-body">${this._tabBody()}</div>
        <div class="cc-actions">
          <button data-cc="random">Rastgele</button>
          <button data-cc="reset">Sıfırla</button>
          <button data-cc="cancel">Geri</button>
          <button class="primary" data-cc="done">${esc(this.confirmLabel)}</button>
        </div>
      </aside>
      <section class="cc-preview">
        <div class="cc-name">${esc(d.firstName)} ${esc(d.lastName)}</div>
        <div class="cc-group"><span>Kıyafet</span>${Object.entries(OUTFITS).map(([k, o]) => `<button class="${k === this.previewOutfit ? 'active' : ''}" data-cc-outfit="${k}">${o.label}</button>`).join('')}</div>
        <div class="cc-group"><span>Bina renkleri</span>${Object.entries(HOUSES).map(([k, h]) => `<button class="${k === this.previewHouse ? 'active' : ''}" data-cc-house="${k}" style="--sw:${h.primary}"><i></i>${h.label}</button>`).join('')}</div>
        <div class="cc-group"><span>Poz</span>${POSES.map(([k, l]) => `<button data-cc-pose="${k}">${l}</button>`).join('')}</div>
        <div class="cc-group"><span>İfade</span>${Object.entries(EXPRESSIONS).map(([k, e]) => `<button data-cc-expr="${k}">${e.label}</button>`).join('')}<button data-cc-expr="talk">Konuş</button></div>
        <p class="cc-hint">Sürükle: döndür · Tekerlek: yakınlaş · Bina, Seçmen Şapka töreninde belirlenir; buradaki renkler yalnızca önizlemedir.</p>
      </section>`;
  }

  _slider(key) {
    const s = SLIDERS.find((x) => x.key === key);
    const v = this.data.appearance[key];
    return `<label class="cc-slider"><span>${s.label}</span><input type="range" min="0" max="1" step="0.01" value="${v}" data-cc-slider="${key}"></label>`;
  }

  _swatches(key, list, colorOf) {
    const cur = this.data.appearance[key];
    return `<div class="cc-swatches">${list.map((item, i) => `<button class="swatch ${i === cur ? 'active' : ''}" title="${esc(item.label)}" style="--sw:${colorOf(item)}" data-cc-pick="${key}" data-cc-value="${i}"></button>`).join('')}</div>`;
  }

  _choices(key, entries) {
    const cur = this.data.appearance[key];
    return `<div class="cc-choices">${entries.map(([k, label]) => `<button class="${String(k) === String(cur) ? 'active' : ''}" data-cc-choice="${key}" data-cc-value="${k}">${esc(label)}</button>`).join('')}</div>`;
  }

  _tabBody() {
    const d = this.data;
    const bySlidersIn = (group) => SLIDERS.filter((s) => s.group === group).map((s) => this._slider(s.key)).join('');
    switch (this.tab) {
      case 'identity':
        return `
          <label class="cc-field"><span>Ad</span><input type="text" maxlength="24" value="${esc(d.firstName)}" data-cc-text="firstName"></label>
          <label class="cc-field"><span>Soyad</span><input type="text" maxlength="24" value="${esc(d.lastName)}" data-cc-text="lastName"></label>
          <button data-cc="randomName">Rastgele isim</button>
          ${bySlidersIn('identity')}
          <p class="note">Ses tonu, büyü sözlerini söylerken ve diyaloglarda kullanılır.</p>
          <h3>Asa <small>(Diagon Yolu'ndaki dükkânda seçilecek)</small></h3>
          <p class="note">${d.wand ? esc(describeWand(d.wand)) : 'Henüz asa seçilmedi'}</p>`;
      case 'body':
        return `${bySlidersIn('body')}<h3>Alt giyim</h3>${this._choices('lower', Object.entries(LOWER_GARMENTS))}`;
      case 'face':
        return bySlidersIn('face');
      case 'colors':
        return `<h3>Cilt tonu</h3>${this._swatches('skinTone', SKIN_TONES, (t) => t.base)}
          <h3>Göz rengi</h3>${this._swatches('eyeColor', EYE_COLORS, (t) => t.color)}
          ${bySlidersIn('colors')}`;
      case 'hair':
        return `<h3>Saç stili</h3>${this._choices('hairStyle', Object.entries(HAIR_STYLES).map(([k, s]) => [k, s.label]))}
          <h3>Saç rengi</h3>${this._swatches('hairColor', HAIR_COLORS, (t) => t.color)}
          <h3>Kaşlar</h3>${bySlidersIn('hair')}`;
      case 'extras':
        return `<h3>Gözlük</h3>${this._choices('glasses', Object.entries(GLASSES).map(([k, g]) => [k, g.label]))}
          <h3>Atkı</h3>${this._choices('scarf', [[true, 'Tak'], [false, 'Takma']])}`;
      default:
        return '';
    }
  }

  // ------------------------------------------------------------- events

  _onClick(e) {
    const b = /** @type {HTMLElement} */ (e.target).closest('button');
    if (!b) return;
    const ds = b.dataset;
    const a = this.data.appearance;
    if (ds.ccTab) {
      this.tab = ds.ccTab;
      this.o.stage.setFraming(TABS.find((t) => t.id === this.tab).framing);
      this._render();
      return;
    }
    if (ds.ccPick) {
      a[ds.ccPick] = Number(ds.ccValue);
      this._push(true);
      this._render();
      return;
    }
    if (ds.ccChoice) {
      const raw = ds.ccValue;
      a[ds.ccChoice] = raw === 'true' ? true : raw === 'false' ? false : raw;
      this._push(true);
      this._render();
      return;
    }
    if (ds.ccOutfit) {
      this.previewOutfit = ds.ccOutfit;
      this._push(true);
      this._render();
      return;
    }
    if (ds.ccHouse) {
      this.previewHouse = ds.ccHouse;
      this._push(true);
      this._render();
      return;
    }
    if (ds.ccPose) {
      this.o.stage.setPreview(ds.ccPose);
      return;
    }
    if (ds.ccExpr) {
      this.o.stage.setExpression(ds.ccExpr);
      return;
    }
    switch (ds.cc) {
      case 'random': {
        const rnd = Math.random;
        this.data.appearance = randomAppearance(rnd);
        Object.assign(this.data, randomName(rnd));
        this._push(true);
        this._render();
        break;
      }
      case 'randomName':
        Object.assign(this.data, randomName(Math.random));
        this._render();
        break;
      case 'reset':
        this.data.appearance = { ...DEFAULT_APPEARANCE };
        this._push(true);
        this._render();
        break;
      case 'cancel':
        this.o.onCancel();
        break;
      case 'done':
        this.o.onDone(sanitizeCharacter(this.data));
        break;
      default:
        break;
    }
  }

  _onInput(e) {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (t.dataset.ccSlider) {
      this.data.appearance[t.dataset.ccSlider] = Number(t.value);
      this._push();
    } else if (t.dataset.ccText) {
      this.data[t.dataset.ccText] = t.value;
      const n = this.root.querySelector('.cc-name');
      if (n) n.textContent = `${this.data.firstName} ${this.data.lastName}`;
    }
  }
}
