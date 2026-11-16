/**
 * ChalkText.js — hand lettering with the same dry tools as the painting.
 *
 * Two lettering techniques, chosen by size:
 *   • 'hatch'   display type. The glyph shapes become a region the hand
 *               hatches into with Ember Chalk, cross-hatched in Dusk Conté,
 *               over a pressed under-layer, with a vine-black drop shadow and
 *               an optional chalk halo. Lettering for titles and menu items.
 *   • 'pressed' body type. Each glyph is pressed through a stencil into the
 *               paper's tooth with its own small rotation, lift and scale, so
 *               no two letters sit the same — then broken up by the grain.
 *
 * Every piece of text is drawn three times (three boil drawings), cached.
 */
import { RNG, makeCanvas, clamp } from '../engine/Noise.js';
import { Region, Technique } from '../engine/DryMediaTools.js';
import { P, mix2, vary } from '../engine/Palette90sOVA.js';

export const SERIF = "'Cormorant Garamond', 'Iowan Old Style', Georgia, serif";

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export class ChalkText {
  constructor(studio, tools, seed = 7) {
    this.S = studio; this.tools = tools; this.seed = seed;
    this.cache = new Map();
    this.maxEntries = 260;
    this.measure = makeCanvas(8, 8)._ctx;
  }

  /**
   * @param {string} text
   * @param {object} st  {size, colors:[top,bottom], accent, halo, italic, weight, mode, shadow, variants}
   * @returns {{w,h,pad,baseline,textW,frames:HTMLCanvasElement[]}}
   */
  get(text, st = {}) {
    const key = text + '|' + JSON.stringify(st);
    let e = this.cache.get(key);
    if (e) { this.cache.delete(key); this.cache.set(key, e); return e; }
    e = this._render(text, st);
    this.cache.set(key, e);
    if (this.cache.size > this.maxEntries) this.cache.delete(this.cache.keys().next().value);
    return e;
  }

  _render(text, st) {
    const S = this.S;
    const size = st.size ?? 40;
    const mode = st.mode ?? (size >= 44 ? 'hatch' : 'pressed');
    const font = `${st.italic ? 'italic ' : ''}${st.weight ?? 500} ${size}px ${SERIF}`;
    const colors = st.colors ?? [P.candleCream, P.honeyHalo];
    const variants = st.variants ?? 3;

    const m = this.measure; m.font = font;
    const textW = Math.ceil(m.measureText(text).width);
    const pad = Math.ceil(size * (st.halo ? 0.55 : 0.3)) + 4;
    const w = textW + pad * 2, h = Math.ceil(size * 1.35) + pad * 2;
    const baseline = pad + Math.round(size * 1.0);
    const advance = [];
    for (let i = 0; i <= text.length; i++) advance.push(m.measureText(text.slice(0, i)).width);

    const colorAt = (y) => mix2(colors[0], colors[1], clamp((y - (baseline - size * 0.72)) / (size * 0.85)));

    // glyph mask (and halo mask) for the hatching hand
    let inside = null, haloInside = null;
    if (mode === 'hatch') {
      const mk = makeCanvas(w, h, true), g = mk._ctx;
      g.font = font; g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
      g.fillText(text, pad, baseline);
      const A = g.getImageData(0, 0, w, h).data;
      inside = (x, y) => { const xi = x | 0, yi = y | 0; return xi >= 0 && yi >= 0 && xi < w && yi < h && A[(yi * w + xi) * 4 + 3] > 110; };
      if (st.halo) {
        g.clearRect(0, 0, w, h);
        g.shadowColor = '#fff'; g.shadowBlur = size * 0.35;
        g.fillText(text, pad, baseline); g.fillText(text, pad, baseline);
        const Hh = g.getImageData(0, 0, w, h).data;
        haloInside = (x, y) => { const xi = x | 0, yi = y | 0; return xi >= 0 && yi >= 0 && xi < w && yi < h && Hh[(yi * w + xi) * 4 + 3] > 26; };
      }
    }

    const prev = { target: S.target, physics: S.physics, load: S.loadEnabled, coarse: S.coarse };
    const frames = [];
    for (let v = 0; v < variants; v++) {
      const c = makeCanvas(w, h);
      S.setTarget(c._ctx);
      S.physics = false; S.loadEnabled = false; S.coarse = false;
      const rng = new RNG(hash(text) ^ (this.seed * 7919) ^ (v * 104729));

      const pressGlyphs = (level, dx, dy, color, alpha, jit = 1) => {
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (ch === ' ') continue;
          const s = 1 + rng.gauss(0, 0.022 * jit);
          S.press(level, ch, pad + advance[i] + dx + rng.gauss(0, size * 0.01 * jit), baseline + dy + rng.gauss(0, size * 0.018 * jit), {
            font, size, alpha, rot: rng.gauss(0, 0.03 * jit), sx: s, sy: s,
            color: typeof color === 'function' ? color() : color,
          });
        }
      };

      if (st.shadow !== false) pressGlyphs(3, size * 0.035, size * 0.055, mix2(P.vineBlack, P.midnightIndigo, 0.3), 0.75);
      S.flush();

      if (mode === 'pressed') {
        pressGlyphs(size < 34 ? 4 : 3, 0, 0, () => vary(colorAt(baseline - size * 0.35), rng, 0.04), 0.95, 0.7);
        pressGlyphs(1, rng.gauss(0, 0.6), rng.gauss(0, 0.6), () => vary(colorAt(baseline - size * 0.1), rng, 0.05), 0.55, 0.6);
        S.flush();
      } else {
        const { chalk, conte } = this.tools;
        if (haloInside) {
          const halo = Region.fn([0, 0, w, h], (x, y) => haloInside(x, y) && !inside(x, y));
          const jobs = Technique.hatch(chalk, halo, { rng, angle: -0.7, spacing: Math.max(2.5, size * 0.07), length: [size * 0.2, size * 0.6], size: Math.max(5, size * 0.16), alpha: 0.3, pressure: 0.65, crumble: 0, step: 3, minFrac: 0.1, color: (x, y, r) => vary(st.halo, r, 0.06) });
          for (const j of jobs) j();
          S.flush();
        }
        pressGlyphs(3, 0, 0, () => vary(mix2(colorAt(baseline - size * 0.3), P.bruisedViolet, 0.18), rng, 0.04), 0.95, 0.35);
        pressGlyphs(2, rng.gauss(0, 0.8), rng.gauss(0, 0.8), () => vary(colorAt(baseline - size * 0.5), rng, 0.04), 0.7, 0.35);
        S.flush();
        const region = Region.fn([0, 0, w, h], inside);
        const body = Technique.hatch(chalk, region, {
          rng, angle: -1.05, spacing: Math.max(1.6, size * 0.042), length: [size * 0.18, size * 0.55], size: Math.max(2.4, size * 0.07),
          alpha: 0.88, pressure: 0.92, crumble: 0.03, step: 1.5, minFrac: 0.04, wobble: Math.max(0.4, size * 0.006),
          color: (x, y, r) => vary(colorAt(y), r, 0.05),
        });
        for (const j of body) j();
        const cross = Technique.hatch(conte, region, {
          rng, angle: 0.5, spacing: Math.max(2.2, size * 0.065), length: [size * 0.12, size * 0.4], size: Math.max(1.4, size * 0.028),
          alpha: 0.55, pressure: 0.8, step: 1.5, minFrac: 0.04, hold: 0.4, density: () => 0.7,
          color: (x, y, r) => vary(mix2(colorAt(y), st.accent ?? P.goldenAmber, 0.5), r, 0.05),
        });
        for (const j of cross) j();
        S.flush();
      }
      frames.push(c);
    }
    S.physics = prev.physics; S.loadEnabled = prev.load; S.coarse = prev.coarse;
    if (prev.target) S.setTarget(prev.target);
    return { w, h, pad, baseline, textW, size, frames };
  }
}

/** Draw a cached text entry so that its text box (not its padding) starts at x. */
export function drawText(ctx, entry, x, y, frame = 0, align = 'left', alpha = 1) {
  const ox = align === 'center' ? entry.textW / 2 : align === 'right' ? entry.textW : 0;
  ctx.globalAlpha = alpha;
  ctx.drawImage(entry.frames[frame % entry.frames.length], Math.round(x - ox - entry.pad), Math.round(y - entry.baseline));
  ctx.globalAlpha = 1;
}
