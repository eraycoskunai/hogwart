/**
 * @file texture.worker.js — module worker that runs material generators off
 * the main thread and transfers the packed RGBA8 maps back.
 *
 * Protocol:
 *   in:  { type:'job', jobId, id, variant, size, seed }
 *   out: { type:'done', jobId, size, maps, ms } | { type:'error', jobId, message }
 */
import { GENERATORS } from './materials/index.js';
import { buildMaps } from './pipeline.js';

self.onmessage = (e) => {
  const msg = e.data;
  if (!msg || msg.type !== 'job') return;
  const { jobId, id, variant, size, seed } = msg;
  const t0 = performance.now();
  try {
    const gen = GENERATORS[id];
    if (!gen) throw new Error(`Unknown material generator "${id}"`);
    const { maps } = buildMaps(gen, size, seed, variant);
    const transfer = Object.values(maps).map((a) => a.buffer);
    self.postMessage({ type: 'done', jobId, size, maps, ms: performance.now() - t0 }, transfer);
  } catch (err) {
    self.postMessage({ type: 'error', jobId, message: String(err?.message ?? err) });
  }
};

self.postMessage({ type: 'ready' });
