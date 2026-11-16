/**
 * PaperSubstrate.js — a sheet of heavy, cold-press, hand-toned paper.
 *
 * Cold-press paper is couched against wool felt, which leaves an irregular
 * field of soft nodules ("tooth"). Dry pigment only catches on the peaks
 * under light pressure and is driven down into the valleys under heavy
 * pressure. This module builds that physical surface as a heightmap and
 * derives everything the tools need from it:
 *
 *   height        Float32Array heightmap (0 = deepest valley, 1 = highest nodule)
 *   tooth[]       alpha masks: which pixels a given hand pressure can reach
 *   paperCanvas   the toned sheet itself, raked by a low studio light
 *   grainCanvas   neutral-grey emboss, laid over the finished frame ('overlay')
 *
 * The sheet is toned a deep twilight aubergine-indigo, the way pastellists
 * work on Mi-Teintes or sanded board: wherever the pastel skips, the
 * paper's own dusk shows through — so no pixel is ever "blank".
 */
import { RNG, valueField, clamp, smoothstep, makeCanvas } from './Noise.js';

export class PaperSubstrate {
  constructor(width, height, { seed = 1990, tone = [30, 24, 58] } = {}) {
    this.w = width;
    this.h = height;
    this.seed = seed;
    this.tone = tone;
    this.rng = new RNG(seed);
    this._generateHeight();
    this._buildHistogram();
  }

  /* ------------------------------------------------------------ surface */

  _generateHeight() {
    const { w, h, rng } = this;
    const N = w * h;
    const H = new Float32Array(N);

    // 1. broad cockling of a heavy, damp-stretched sheet
    const cockle = valueField(w, h, 160, rng);
    // 2. felt-pressed nodules at two scales (the real "tooth")
    const nodA = valueField(w, h, 7.5, rng);
    const nodB = valueField(w, h, 3.4, rng);
    // 3. the felt weave: a ridged network that makes the nodules crater-like
    const weave = valueField(w, h, 5.2, rng);
    // 4. sub-pixel sizing grit
    const grit = valueField(w, h, 1.3, rng);

    for (let i = 0; i < N; i++) {
      const a = nodA[i], b = nodB[i];
      const nod = a * a * (3 - 2 * a);                    // rounder bumps
      const ridge = 1 - Math.abs(weave[i] * 2 - 1);        // felt ridges
      H[i] = cockle[i] * 0.10
           + nod * 0.40
           + b * 0.22
           + ridge * ridge * 0.16
           + grit[i] * 0.12;
    }

    this._laySeedFibers(H);

    // normalise to [0, 1]
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < N; i++) { const v = H[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    const inv = 1 / (mx - mn || 1);
    for (let i = 0; i < N; i++) H[i] = (H[i] - mn) * inv;
    this.height = H;
  }

  /** Long cotton-rag fibres, slightly raised or slightly sunk into the pulp. */
  _laySeedFibers(H) {
    const { w, h, rng } = this;
    const count = Math.round((w * h) / 1500);
    for (let f = 0; f < count; f++) {
      let x = rng.range(0, w), y = rng.range(0, h);
      let ang = rng.range(0, Math.PI * 2);
      const curl = rng.range(-0.06, 0.06);
      const len = rng.range(14, 95);
      const amp = rng.chance(0.7) ? rng.range(0.03, 0.11) : -rng.range(0.03, 0.07);
      for (let s = 0; s < len; s++) {
        const xi = x | 0, yi = y | 0;
        if (xi > 0 && yi > 0 && xi < w - 1 && yi < h - 1) {
          const t = Math.sin((s / len) * Math.PI);        // fibre tapers both ends
          const i = yi * w + xi;
          H[i] += amp * t;
          H[i + 1] += amp * t * 0.35; H[i - 1] += amp * t * 0.35;
          H[i + w] += amp * t * 0.35; H[i - w] += amp * t * 0.35;
        }
        ang += curl + rng.range(-0.08, 0.08);
        x += Math.cos(ang); y += Math.sin(ang);
      }
    }
  }

  _buildHistogram() {
    const bins = 2048, hist = new Uint32Array(bins), H = this.height;
    for (let i = 0; i < H.length; i++) hist[Math.min(bins - 1, (H[i] * bins) | 0)]++;
    this._cdf = new Float32Array(bins);
    let acc = 0;
    for (let i = 0; i < bins; i++) { acc += hist[i]; this._cdf[i] = acc / H.length; }
  }

  /** Height value below which a fraction q of the sheet lies. */
  quantile(q) {
    const cdf = this._cdf;
    for (let i = 0; i < cdf.length; i++) if (cdf[i] >= q) return i / cdf.length;
    return 1;
  }

  heightAt(x, y) {
    const xi = clamp(x | 0, 0, this.w - 1), yi = clamp(y | 0, 0, this.h - 1);
    return this.height[yi * this.w + xi];
  }

  /* -------------------------------------------------------- tooth masks */

  /**
   * One mask per pressure band. `p` is the fraction of the sheet's surface a
   * stick pressed that hard can touch. Light pressure → only the nodule tops.
   */
  buildToothMasks(levels = [0.26, 0.44, 0.62, 0.8, 0.965]) {
    const { w, h, height: H } = this;
    this.tooth = levels.map((p) => {
      const thr = this.quantile(1 - p);
      const soft = 0.055;
      const c = makeCanvas(w, h);
      const img = c._ctx.createImageData(w, h);
      const d = img.data;
      for (let i = 0, j = 0; i < H.length; i++, j += 4) {
        d[j] = d[j + 1] = d[j + 2] = 255;
        d[j + 3] = (smoothstep(thr - soft, thr + soft, H[i]) * 255) | 0;
      }
      c._ctx.putImageData(img, 0, 0);
      return { p, canvas: c };
    });
    return this.tooth;
  }

  /* ------------------------------------------------------- the sheet */

  /** The toned sheet as it sits on the easel, raked by a low warm lamp. */
  renderPaperCanvas() {
    const { w, h, height: H, tone, rng } = this;
    const c = makeCanvas(w, h);
    const img = c._ctx.createImageData(w, h);
    const d = img.data;
    const mottle = valueField(w, h, 220, rng);
    const bloom = valueField(w, h, 60, rng);
    const lx = -0.62, ly = -0.78;                      // light from the upper left
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const xl = x > 0 ? i - 1 : i, xr = x < w - 1 ? i + 1 : i;
        const yu = y > 0 ? i - w : i, yd = y < h - 1 ? i + w : i;
        const nx = H[xr] - H[xl], ny = H[yd] - H[yu];
        const lit = -(nx * lx + ny * ly) * 1.6;
        const m = (mottle[i] - 0.5) * 0.16 + (bloom[i] - 0.5) * 0.06;
        const s = 1 + lit + (H[i] - 0.5) * 0.35 + m;
        const j = i * 4;
        d[j] = clamp(tone[0] * s * (1 + m * 0.6), 0, 255);
        d[j + 1] = clamp(tone[1] * s, 0, 255);
        d[j + 2] = clamp(tone[2] * s * (1 - m * 0.3), 0, 255);
        d[j + 3] = 255;
      }
    }
    c._ctx.putImageData(img, 0, 0);
    this.paperCanvas = c;
    return c;
  }

  /**
   * Neutral-grey emboss of the tooth for an 'overlay' pass over every frame,
   * so the paper's relief reads *through* the pigment the way it does when a
   * real pastel is lit from the side in a gallery.
   */
  renderGrainOverlay(strength = 46) {
    const { w, h, height: H } = this;
    const c = makeCanvas(w, h);
    const img = c._ctx.createImageData(w, h);
    const d = img.data;
    const lx = -0.62, ly = -0.78;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const xl = x > 0 ? i - 1 : i, xr = x < w - 1 ? i + 1 : i;
        const yu = y > 0 ? i - w : i, yd = y < h - 1 ? i + w : i;
        const lit = -((H[xr] - H[xl]) * lx + (H[yd] - H[yu]) * ly);
        const v = clamp(128 + lit * strength * 3.2 + (H[i] - 0.5) * strength * 0.9, 0, 255);
        const j = i * 4;
        d[j] = d[j + 1] = d[j + 2] = v; d[j + 3] = 255;
      }
    }
    c._ctx.putImageData(img, 0, 0);
    this.grainCanvas = c;
    return c;
  }
}
