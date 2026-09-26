/**
 * @file DynamicResolution — keeps the frame rate up by lowering the render
 * resolution in steps while frames stay slow, and raising it again once
 * they run at the display's refresh. Only acts while playing, after a
 * settle time following state or region changes (loading hitches), and
 * only when the "dynamicResolution" setting is on.
 */
import { DYNAMIC_RES } from '../data/perf.js';

export class DynamicResolution {
  /**
   * @param {import('./Renderer.js').Renderer} renderer
   * @param {import('../core/Settings.js').Settings} settings
   * @param {import('../core/EventBus.js').EventBus} bus
   */
  constructor(renderer, settings, bus) {
    this.renderer = renderer;
    this.settings = settings;
    this.scale = 1;
    this._slow = 0;
    this._fast = 0;
    this._settle = DYNAMIC_RES.settle;
    this._avg = 0;
    const settle = () => {
      this._settle = DYNAMIC_RES.settle;
      this._slow = this._fast = 0;
    };
    bus.on('region:loaded', settle);
    bus.on('game:state', settle);
    bus.on('settings:changed', ({ key }) => {
      if ((key === 'dynamicResolution' || key === '*') && !settings.get('dynamicResolution')) this._set(1);
      if (key === 'quality' || key === 'renderScale') settle();
    });
  }

  /**
   * @param {number} dt real seconds
   * @param {number} frameMs this frame's time
   * @param {boolean} playing
   */
  update(dt, frameMs, playing) {
    if (!this.settings.get('dynamicResolution') || !playing) return;
    // Short smoothing so a single hitch does not count.
    this._avg += (frameMs - this._avg) * Math.min(1, dt * 4);
    if (this._settle > 0) {
      this._settle -= dt;
      return;
    }
    const R = DYNAMIC_RES;
    this._slow = this._avg > R.slowMs ? this._slow + dt : 0;
    this._fast = this._avg < R.fastMs ? this._fast + dt : 0;
    if (this._slow > R.downAfter && this.scale > R.min) {
      this._set(Math.max(R.min, this.scale - R.step));
      this._slow = 0;
      this._settle = R.downAfter;
    } else if (this._fast > R.upAfter && this.scale < 1) {
      this._set(Math.min(1, this.scale + R.step));
      this._fast = 0;
    }
  }

  _set(s) {
    this.scale = Math.round(s * 100) / 100;
    this.renderer.setDynamicScale(this.scale);
  }
}
