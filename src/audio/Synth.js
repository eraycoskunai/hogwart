/**
 * @file Synth — turns sound recipes (data/sounds.js, data/music.js) into
 * Web Audio node graphs: oscillators or looping noise buffers, exponential
 * pitch and filter glides, attack / decay envelopes, vibrato (LFO on
 * detune), tremolo (LFO on gain) and bursts (the layer repeated with
 * random gaps and pitch). Instrument notes add an ADSR envelope with a
 * held sustain. Every builder returns the end time and a stop function.
 */

const SILENT = 0.0001;
/** Seconds of noise in the shared loop buffers. */
const NOISE_SECONDS = 2;

/** Build white / pink / brown noise buffers once per context. */
export function makeNoise(ctx) {
  const n = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const make = (fill) => {
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    fill(b.getChannelData(0));
    return b;
  };
  const white = make((d) => {
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  });
  // Paul Kellet's economy pink filter.
  const pink = make((d) => {
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
  });
  const brown = make((d) => {
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
  });
  return { white, pink, brown };
}

/** Source node for a layer (oscillator or looping noise). */
function source(ctx, noise, layer, t, freq) {
  if (layer.src in noise) {
    const s = ctx.createBufferSource();
    s.buffer = noise[layer.src];
    s.loop = true;
    s.start(t, Math.random() * (NOISE_SECONDS - 0.1));
    return s;
  }
  const o = ctx.createOscillator();
  o.type = layer.src;
  o.frequency.setValueAtTime(freq, t);
  if (layer.detune) o.detune.setValueAtTime(layer.detune, t);
  o.start(t);
  return o;
}

function lfo(ctx, rate, depth, target, t) {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(rate, t);
  const g = ctx.createGain();
  g.gain.setValueAtTime(depth, t);
  o.connect(g).connect(target);
  o.start(t);
  return o;
}

/**
 * One recipe layer (one shot or loop).
 * @returns {{end:number, stop:(t:number)=>void, gain:GainNode, filter:BiquadFilterNode|null, src:AudioScheduledSourceNode}}
 */
export function playLayer(ctx, noise, layer, t, pitch, out) {
  const dur = layer.dur;
  const loop = !Number.isFinite(dur);
  const f0 = layer.f ? layer.f[0] * pitch : 440;
  const src = source(ctx, noise, layer, t, f0);
  const extra = [];
  const osc = !(layer.src in noise);
  if (osc && layer.f && !loop && layer.f[1] !== layer.f[0]) src.frequency.exponentialRampToValueAtTime(Math.max(1, layer.f[1] * pitch), t + dur);
  if (osc && layer.vib) extra.push(lfo(ctx, layer.vib[0], layer.vib[1], src.detune, t));
  let node = src;
  let filter = null;
  if (layer.filter) {
    const F = layer.filter;
    filter = ctx.createBiquadFilter();
    filter.type = F.t;
    filter.Q.setValueAtTime(F.q ?? 0.7, t);
    filter.frequency.setValueAtTime(F.f[0], t);
    if (!loop && F.f[1] !== F.f[0]) filter.frequency.exponentialRampToValueAtTime(F.f[1], t + dur);
    node.connect(filter);
    node = filter;
  }
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(layer.g, t + layer.a);
  if (!loop) env.gain.exponentialRampToValueAtTime(SILENT, t + Math.max(dur, layer.a + 0.01));
  node.connect(env);
  node = env;
  if (layer.am) {
    const [rate, depth] = layer.am;
    const trem = ctx.createGain();
    trem.gain.setValueAtTime(1 - depth / 2, t);
    extra.push(lfo(ctx, rate, depth / 2, trem.gain, t));
    node.connect(trem);
    node = trem;
  }
  node.connect(out);
  const end = loop ? Infinity : t + dur + 0.05;
  if (!loop) {
    src.stop(end);
    for (const x of extra) x.stop(end);
  }
  return {
    end,
    gain: env,
    filter,
    src,
    stop(at, fade = 0.2) {
      env.gain.cancelScheduledValues(at);
      env.gain.setValueAtTime(env.gain.value, at);
      env.gain.linearRampToValueAtTime(0, at + fade);
      src.stop(at + fade + 0.02);
      for (const x of extra) x.stop(at + fade + 0.02);
    },
  };
}

/**
 * A whole recipe (with bursts).
 * @returns {{end:number, layers:any[], stop:(t:number, fade?:number)=>void}}
 */
export function playRecipe(ctx, noise, recipe, t, pitch, out) {
  const layers = [];
  let end = t;
  for (const L of recipe.layers) {
    const start = t + (L.delay ?? 0);
    if (L.burst) {
      let at = start;
      for (let i = 0; i < L.burst.n; i++) {
        const [p0, p1] = L.burst.pitch;
        const l = playLayer(ctx, noise, L, at, pitch * (p0 + Math.random() * (p1 - p0)), out);
        layers.push(l);
        end = Math.max(end, l.end);
        const [e0, e1] = L.burst.every;
        at += e0 + Math.random() * (e1 - e0);
      }
    } else {
      const l = playLayer(ctx, noise, L, start, pitch, out);
      layers.push(l);
      end = Math.max(end, l.end);
    }
  }
  return {
    end,
    layers,
    stop(at, fade) {
      for (const l of layers) l.stop(at, fade);
    },
  };
}

/**
 * An instrument note (ADSR, sustained for `hold` seconds).
 * @param {any} inst INSTRUMENTS entry
 */
export function playNote(ctx, noise, inst, freq, t, hold, gain, out) {
  const env = ctx.createGain();
  const peak = gain;
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(peak, t + inst.a);
  let end;
  if (inst.s > 0) {
    const off = t + Math.max(hold, inst.a);
    env.gain.setValueAtTime(peak * inst.s, off);
    env.gain.exponentialRampToValueAtTime(SILENT, off + inst.r);
    end = off + inst.r + 0.05;
  } else {
    env.gain.exponentialRampToValueAtTime(SILENT, t + inst.a + inst.d);
    end = t + inst.a + inst.d + 0.05;
  }
  env.connect(out);
  const srcs = [];
  for (const L of inst.layers) {
    const f = freq * (L.ratio ?? 1);
    const s = source(ctx, noise, L, t, f);
    let node = s;
    if (L.filter) {
      const flt = ctx.createBiquadFilter();
      flt.type = L.filter.t;
      flt.Q.value = L.filter.q ?? 0.7;
      flt.frequency.value = L.filter.abs ?? Math.min(18000, f * (L.filter.ratio ?? 4));
      node.connect(flt);
      node = flt;
    }
    const g = ctx.createGain();
    g.gain.value = L.g;
    node.connect(g).connect(env);
    if (inst.vib && s.detune) srcs.push(lfo(ctx, inst.vib[0], inst.vib[1], s.detune, t));
    srcs.push(s);
  }
  for (const s of srcs) s.stop(end);
  return end;
}
