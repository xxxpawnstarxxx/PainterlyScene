/**
 * Palette90sOVA.js — the pigment box and the cinematographer.
 *
 * PIGMENTS are the hand-ground sticks: each has a body colour and a short
 * provenance note. Colours are never blended with RGB averaging (which makes
 * light, not paint). They are mixed with single-constant Kubelka–Munk
 * theory — the physics of light scattering inside a pigment layer — so
 * magenta into amber goes through a warm, dusty coral the way real pastel
 * does, instead of a bright digital pink.
 *
 * OVAGrade is the "film print": deep indigo-violet shadow lift, warm amber
 * pull around the light source, red-orange halation bleeding around every
 * highlight the way bright cels bloomed through 1990s optical printers,
 * and a soft gate vignette.
 */
import { clamp, makeCanvas, smoothstep } from './Noise.js';

export const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const PIGMENTS = {
  vineBlack:      { rgb: hex('#120c1c'), name: 'Vine Black', note: 'charred grapevine, faintly violet' },
  midnightIndigo: { rgb: hex('#1d1a4e'), name: 'Midnight Indigo', note: 'indigo cake, ground with chalk' },
  prussianDusk:   { rgb: hex('#1f3566'), name: 'Prussian Dusk', note: 'iron blue, cut with kaolin' },
  bruisedViolet:  { rgb: hex('#4b2770'), name: 'Bruised Violet', note: 'manganese violet' },
  twilightMagenta:{ rgb: hex('#9b2b72'), name: 'Twilight Magenta', note: 'quinacridone lake on chalk' },
  hollyhockRose:  { rgb: hex('#d4568a'), name: 'Hollyhock Rose', note: 'rose madder, hand-rolled' },
  emberCoral:     { rgb: hex('#ef6e5c'), name: 'Ember Coral', note: 'cadmium red light, softened' },
  sanguine:       { rgb: hex('#a4402e'), name: 'Sanguine', note: 'red iron earth (conté)' },
  sepia:          { rgb: hex('#553226'), name: 'Warm Sepia', note: 'cuttlefish ink earth' },
  goldenAmber:    { rgb: hex('#f4a23c'), name: 'Golden-Hour Amber', note: 'yellow ochre + cadmium' },
  honeyHalo:      { rgb: hex('#ffcf72'), name: 'Honey Halo', note: 'Naples yellow, warm' },
  candleCream:    { rgb: hex('#fff0cc'), name: 'Candle Cream', note: 'zinc white + a breath of ochre' },
  pearl:          { rgb: hex('#f6f1ff'), name: 'Pearl', note: 'calcite white, cool' },
  electricCyan:   { rgb: hex('#4fe6f4'), name: 'Electric Cyan', note: 'phthalo + titanium, very soft' },
  glacierTeal:    { rgb: hex('#2a9fb6'), name: 'Glacier Teal', note: 'cobalt teal' },
  auroraMint:     { rgb: hex('#6ff2bf'), name: 'Aurora Mint', note: 'cobalt green light' },
  mossNight:      { rgb: hex('#1c3a42'), name: 'Night Moss', note: 'green earth + indigo' },
  sageGlow:       { rgb: hex('#86b59c'), name: 'Sage Glow', note: 'terre verte, chalked' },
  periwinkle:     { rgb: hex('#6c74cc'), name: 'Periwinkle', note: 'ultramarine + white' },
  lavenderHaze:   { rgb: hex('#a990da'), name: 'Lavender Haze', note: 'ultramarine violet tint' },
  peach:          { rgb: hex('#ffb08a'), name: 'Birthday Peach', note: 'cadmium orange tint' },
};
export const P = Object.fromEntries(Object.entries(PIGMENTS).map(([k, v]) => [k, v.rgb]));

/* ----------------------------------------------- Kubelka–Munk mixing */

const toKS = (c) => { const R = clamp(c / 255, 0.004, 0.996); return ((1 - R) * (1 - R)) / (2 * R); };
const fromKS = (ks) => { const R = 1 + ks - Math.sqrt(ks * ks + 2 * ks); return clamp(R * 255, 0, 255); };

/** Subtractive mix of any number of pigments by weight. */
export function mix(colors, weights) {
  let tw = 0; const ks = [0, 0, 0];
  for (let i = 0; i < colors.length; i++) {
    const w = weights ? weights[i] : 1;
    tw += w;
    for (let ch = 0; ch < 3; ch++) ks[ch] += toKS(colors[i][ch]) * w;
  }
  return ks.map((k) => fromKS(k / (tw || 1)));
}
export const mix2 = (a, b, t) => mix([a, b], [1 - t, t]);

/** Optical (light) blend — used only for glazes of glow, never for pigment. */
export const lerpRGB = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Hand-ground sticks are never uniform: each pick varies in hue and value. */
export function vary(rgb, rng, amt = 0.07) {
  const v = 1 + rng.range(-amt, amt);
  return [
    clamp(rgb[0] * v * (1 + rng.range(-amt, amt) * 0.6), 0, 255),
    clamp(rgb[1] * v * (1 + rng.range(-amt, amt) * 0.6), 0, 255),
    clamp(rgb[2] * v * (1 + rng.range(-amt, amt) * 0.6), 0, 255),
  ];
}

export const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/** Sample a pigment ramp [{t, c}] using KM mixing between neighbouring stops. */
export function ramp(stops, t) {
  if (t <= stops[0].t) return stops[0].c;
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].t) {
      const a = stops[i - 1], b = stops[i];
      return mix2(a.c, b.c, (t - a.t) / (b.t - a.t));
    }
  }
  return stops[stops.length - 1].c;
}

/** The twilight: zenith night down to the golden band at the horizon. */
export const SKY_RAMP = [
  { t: 0.00, c: hex('#0f0c2c') },
  { t: 0.16, c: hex('#1f1950') },
  { t: 0.33, c: hex('#3d2370') },
  { t: 0.50, c: hex('#742a76') },
  { t: 0.64, c: hex('#b2427e') },
  { t: 0.76, c: hex('#df6371') },
  { t: 0.86, c: hex('#f39552') },
  { t: 0.94, c: hex('#ffc372') },
  { t: 1.00, c: hex('#ffe2a4') },
];

/* -------------------------------------------------------- grading */

function boxBlurRGBA(d, w, h, r) {
  const tmp = new Float32Array(d.length);
  const win = r * 2 + 1;
  // horizontal
  for (let y = 0; y < h; y++) {
    for (let ch = 0; ch < 4; ch++) {
      let acc = 0;
      for (let x = -r; x <= r; x++) acc += d[(y * w + clamp(x, 0, w - 1)) * 4 + ch];
      for (let x = 0; x < w; x++) {
        tmp[(y * w + x) * 4 + ch] = acc / win;
        acc += d[(y * w + Math.min(w - 1, x + r + 1)) * 4 + ch] - d[(y * w + Math.max(0, x - r)) * 4 + ch];
      }
    }
  }
  // vertical
  for (let x = 0; x < w; x++) {
    for (let ch = 0; ch < 4; ch++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[(clamp(y, 0, h - 1) * w + x) * 4 + ch];
      for (let y = 0; y < h; y++) {
        d[(y * w + x) * 4 + ch] = acc / win;
        acc += tmp[(Math.min(h - 1, y + r + 1) * w + x) * 4 + ch] - tmp[(Math.max(0, y - r) * w + x) * 4 + ch];
      }
    }
  }
}

export class OVAGrade {
  constructor(w, h, light) {
    this.w = w; this.h = h;
    this.light = light;             // {x, y} principal light (the sun inside the ring)
    this.gradeCanvas = this._buildGrade();
  }

  /** Low-resolution grading plate (gradients are smooth; scaled up at draw time). */
  _buildGrade() {
    const s = 0.25, w = this.w * s, h = this.h * s;
    const c = makeCanvas(w, h), g = c._ctx;
    // soft-light plate: 50% grey is neutral.
    const v = g.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0.0, 'rgb(64,58,150)');     // cool, deepen the zenith
    v.addColorStop(0.42, 'rgb(128,104,150)');
    v.addColorStop(0.58, 'rgb(150,118,120)');  // golden band
    v.addColorStop(0.78, 'rgb(104,86,150)');
    v.addColorStop(1.0, 'rgb(70,52,140)');     // indigo-violet floor
    g.fillStyle = v; g.fillRect(0, 0, w, h);
    const lx = this.light.x * s, ly = this.light.y * s;
    const r = g.createRadialGradient(lx, ly, 0, lx, ly, w * 0.42);
    r.addColorStop(0, 'rgba(255,190,110,0.85)');
    r.addColorStop(0.35, 'rgba(240,150,120,0.35)');
    r.addColorStop(1, 'rgba(128,128,128,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
    return c;
  }

  /**
   * Halation plate: isolate the brightest, warmest light, bleed it outward
   * and tint it red-orange (warm) or cyan (cool), as emulsion halation does.
   */
  buildHalation(source, { threshold = 0.66, scale = 0.25, radius = 9, gain = 1.25 } = {}) {
    const w = Math.round(this.w * scale), h = Math.round(this.h * scale);
    const c = makeCanvas(w, h, true), g = c._ctx;
    g.drawImage(source, 0, 0, w, h);
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, gr = d[i + 1] / 255, b = d[i + 2] / 255;
      const lum = 0.3 * r + 0.55 * gr + 0.15 * b;
      const k = smoothstep(threshold, 1.0, lum + Math.max(0, r - b) * 0.12);
      const warmth = clamp(r - b + 0.5);
      // warm halation → ember red-orange; cool highlights → electric cyan
      d[i]     = 255 * k * (0.55 + 0.45 * warmth);
      d[i + 1] = 255 * k * (0.32 + 0.38 * (1 - warmth) + 0.18 * gr);
      d[i + 2] = 255 * k * (0.16 + 0.7 * (1 - warmth));
      d[i + 3] = 255;
    }
    boxBlurRGBA(d, w, h, radius);
    boxBlurRGBA(d, w, h, Math.round(radius * 0.7));
    for (let i = 0; i < d.length; i += 4) {
      d[i] = clamp(d[i] * gain, 0, 255); d[i + 1] = clamp(d[i + 1] * gain, 0, 255); d[i + 2] = clamp(d[i + 2] * gain, 0, 255);
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /** Applied over the composited frame every display tick. */
  apply(ctx, { halation = null, halationAlpha = 0.6, vignette = 0.62 } = {}) {
    const { w, h } = this;
    ctx.save();
    if (halation) {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = halationAlpha;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(halation, 0, 0, w, h);
    }
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.75;
    ctx.drawImage(this.gradeCanvas, 0, 0, w, h);

    // gate vignette, sunk into indigo rather than black
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = vignette;
    if (!this._vig) {
      const vc = makeCanvas(w * 0.25, h * 0.25), g = vc._ctx;
      const rg = g.createRadialGradient(vc.width * 0.55, vc.height * 0.5, vc.height * 0.25, vc.width * 0.5, vc.height * 0.5, vc.width * 0.62);
      rg.addColorStop(0, 'rgb(255,255,255)');
      rg.addColorStop(0.7, 'rgb(200,180,230)');
      rg.addColorStop(1, 'rgb(60,40,110)');
      g.fillStyle = rg; g.fillRect(0, 0, vc.width, vc.height);
      this._vig = vc;
    }
    ctx.drawImage(this._vig, 0, 0, w, h);

    // lift the blacks into violet: cel prints never hit true black
    ctx.globalCompositeOperation = 'lighten';
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgb(20,13,38)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}
