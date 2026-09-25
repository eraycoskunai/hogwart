/**
 * @file GalleryPanel — DOM side panel for the material gallery: material
 * list by category, map previews (albedo / normal / ORM / emissive),
 * generation info and live weathering controls.
 */
import { materialLabel, MaterialGallery } from '../world/MaterialGallery.js';
import { MATERIALS } from '../data/materials.js';

const PREVIEW_SIZE = 128;
const SURFACE_SLIDERS = [
  ['uVariation', 'Renk varyasyonu', 0, 1],
  ['uDirt', 'Kir', 0, 1],
  ['uMoss', 'Yosun', 0, 1],
  ['uDamp', 'Nem lekesi', 0, 1],
  ['uWetResponse', 'Islaklık tepkisi', 0, 1],
];

export class GalleryPanel {
  /**
   * @param {HTMLElement} root
   * @param {{gallery:MaterialGallery, library:import('../render/MaterialLibrary.js').MaterialLibrary,
   *          bus:import('../core/EventBus.js').EventBus, onExit:()=>void, onRegenerate:()=>void}} o
   */
  constructor(root, o) {
    this.root = root;
    this.o = o;
    this.material = null;
    root.addEventListener('click', (e) => this._onClick(e));
    root.addEventListener('input', (e) => this._onInput(e));
    o.bus.on('gallery:select', ({ key, material }) => this._showDetails(key, material));
    o.bus.on('textures:progress', ({ done, total, label }) => this._progress(done, total, label));
  }

  show() {
    this.root.classList.add('show');
    this.root.innerHTML = `
      <div class="gal-head">
        <h2>Malzeme Galerisi</h2>
        <button data-gal="exit">← Test salonu</button>
      </div>
      <div class="gal-progress"><i></i><span>Hazırlanıyor…</span></div>
      <div class="gal-body">
        <nav class="gal-list"></nav>
        <section class="gal-details"><p class="gal-hint">Bir malzemeye tıkla (listeden ya da sahnede). Sürükle: döndür · Tekerlek: yakınlaş · Sağ tık sürükle: kaydır</p></section>
      </div>
      <div class="gal-global">
        <label>Yağmur / ıslaklık <input type="range" min="0" max="1" step="0.01" value="${this.o.library.shared.uWetness.value}" data-gal-global="wet"></label>
        <label>Işık yönü <input type="range" min="0" max="6.283" step="0.01" value="0.9" data-gal-global="light"></label>
        <button data-gal="regen">Önbelleği temizle</button>
      </div>`;
    this._renderList();
  }

  hide() {
    this.root.classList.remove('show');
    this.root.innerHTML = '';
  }

  _progress(done, total, label) {
    const bar = this.root.querySelector('.gal-progress');
    if (!bar) return;
    bar.classList.toggle('done', done >= total);
    bar.querySelector('i').style.width = `${total ? (done / total) * 100 : 100}%`;
    bar.querySelector('span').textContent = done >= total ? 'Hazır' : `${label ?? 'Dokular'}: ${done} / ${total}`;
  }

  _renderList() {
    const list = this.root.querySelector('.gal-list');
    let html = '';
    for (const [cat, keys] of MaterialGallery.groups()) {
      html += `<h4>${cat}</h4>` + keys.map((k) => `<button data-gal-key="${k}">${materialLabel(k)}</button>`).join('');
    }
    list.innerHTML = html;
  }

  _showDetails(key, material) {
    this.material = material;
    for (const b of this.root.querySelectorAll('[data-gal-key]')) b.classList.toggle('active', b.dataset.galKey === key);
    const d = MATERIALS[key];
    const lib = this.o.library;
    const set = lib.mapData(key);
    const info = set
      ? `${set.size}×${set.size} px · ${set.cached ? 'önbellekten' : `${Math.round(set.ms ?? 0)} ms'de üretildi`}`
      : '';
    const surf = material.userData?.surface;
    const sliders = surf
      ? SURFACE_SLIDERS.map(([u, label, min, max]) => `<label>${label} <input type="range" min="${min}" max="${max}" step="0.01" value="${surf[u].value}" data-gal-uniform="${u}"></label>`).join('')
      : '<p class="gal-hint">Efekt malzemesi (animasyonlu shader).</p>';
    const tri = surf
      ? `<label class="gal-check"><input type="checkbox" data-gal-tri ${material.userData.triplanar ? 'checked' : ''}> Triplanar (dünya uzayı) eşleme</label>`
      : '';
    const details = this.root.querySelector('.gal-details');
    details.innerHTML = `
      <h3>${materialLabel(key)}</h3>
      <p class="gal-meta"><code>${key}</code> · ${d.type} · karo ${d.tile} m<br>${info}</p>
      <div class="gal-maps">
        <figure><canvas data-map="albedo"></canvas><figcaption>Albedo</figcaption></figure>
        <figure><canvas data-map="normal"></canvas><figcaption>Normal</figcaption></figure>
        <figure><canvas data-map="orm"></canvas><figcaption>AO · Pürüz · Metal</figcaption></figure>
        ${set?.maps.emissive ? '<figure><canvas data-map="emissive"></canvas><figcaption>Emissive</figcaption></figure>' : ''}
      </div>
      ${tri}
      ${sliders}`;
    if (set) {
      for (const c of details.querySelectorAll('canvas[data-map]')) this._drawPreview(c, set.maps[c.dataset.map], set.size);
    }
  }

  /** Downsample a map into a preview canvas (flipping rows: data row 0 is v = 0). */
  _drawPreview(canvas, data, size) {
    if (!data) return;
    canvas.width = canvas.height = PREVIEW_SIZE;
    const g = canvas.getContext('2d');
    const img = g.createImageData(PREVIEW_SIZE, PREVIEW_SIZE);
    const step = size / PREVIEW_SIZE;
    for (let y = 0; y < PREVIEW_SIZE; y++) {
      const sy = Math.floor((PREVIEW_SIZE - 1 - y) * step);
      for (let x = 0; x < PREVIEW_SIZE; x++) {
        const sx = Math.floor(x * step);
        const si = (sy * size + sx) * 4;
        const di = (y * PREVIEW_SIZE + x) * 4;
        const a = data[si + 3] / 255;
        // Composite alpha over a checkerboard so cut-outs are visible.
        const checker = ((x >> 3) + (y >> 3)) & 1 ? 70 : 40;
        img.data[di] = data[si] * a + checker * (1 - a);
        img.data[di + 1] = data[si + 1] * a + checker * (1 - a);
        img.data[di + 2] = data[si + 2] * a + checker * (1 - a);
        img.data[di + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }

  _onClick(e) {
    const b = /** @type {HTMLElement} */ (e.target).closest('button');
    if (!b) return;
    if (b.dataset.galKey) this.o.gallery.select(b.dataset.galKey);
    else if (b.dataset.gal === 'exit') this.o.onExit();
    else if (b.dataset.gal === 'regen') this.o.onRegenerate();
  }

  _onInput(e) {
    const el = /** @type {HTMLInputElement} */ (e.target);
    if (el.dataset.galGlobal === 'wet') this.o.library.setWetness(Number(el.value));
    else if (el.dataset.galGlobal === 'light') this.o.gallery.setLightAngle(Number(el.value));
    else if (el.dataset.galUniform && this.material?.userData.surface) {
      this.material.userData.surface[el.dataset.galUniform].value = Number(el.value);
    } else if (el.hasAttribute('data-gal-tri') && this.material) {
      this.material.userData.triplanar = el.checked;
      this.material.needsUpdate = true;
    }
  }
}
