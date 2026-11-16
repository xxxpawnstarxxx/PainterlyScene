/**
 * DryMediaTools.js — the physics of dry pigment on toothed paper.
 *
 * Nothing here draws a line. Every mark is a sequence of hundreds of tiny
 * deposits ("dabs") of crumbling pigment, laid along a path traced by a
 * simulated hand (wrist arc, tremor, attack and lift-off pressure,
 * changing speed). Each deposit is then filtered by the paper:
 *
 *   • pressure chooses how deep into the tooth the pigment reaches
 *     (light = only the nodule tops sparkle; heavy = valleys fill)
 *   • every deposit loads the tooth; a saturated tooth stops gripping, so
 *     later dry layers slide and break up — exactly why pastel "fills"
 *   • wax seals the tooth: charcoal skates over oil pastel, chalk
 *     catches only partially on top of it
 *   • soft sticks crumble, dropping loose crumbs that settle downward
 *   • the tortillon drags real pigment already on the sheet, smearing it
 *     directionally and pushing it into the valleys
 *
 * The five invented tools:
 *   EmberChalk      hand-rolled soft chalk pastel
 *   LanternWax      dense oil-pastel stick with a waxy sheen ridge
 *   DuskConte       square sanguine / indigo conté crayon for hatching
 *   WillowAsh       charred willow vine for searching contour lines
 *   Tortillon       rolled-paper blending stump
 */
import { RNG, Perlin, valueField, clamp, smoothstep, makeCanvas } from './Noise.js';
import { mix2, P } from './Palette90sOVA.js';

/* ====================================================================
 *  The Hand — turns a few control points into a living, trembling path
 * ==================================================================== */
export class Hand {
  static init(seed) { Hand.noise = new Perlin(seed); }

  /**
   * @returns {{x,y,p,ang,u}[]} samples: position, pressure, heading, progress
   */
  static trace(pts, o = {}, rng) {
    const N = Hand.noise;
    const spacing = Math.max(0.6, o.spacing ?? 2);
    let ctrl = pts;

    // A two-point mark is never straight: the wrist pivots, so it arcs.
    if (pts.length === 2) {
      const [a, b] = pts;
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const bow = (o.bow ?? 0.05) * len * (rng.chance(0.78) ? 1 : -1) * rng.range(0.4, 1.2);
      ctrl = [a, { x: (a.x + b.x) / 2 - (dy / len) * bow, y: (a.y + b.y) / 2 + (dx / len) * bow }, b];
    }

    // Catmull-Rom densification
    const dense = [];
    for (let i = 0; i < ctrl.length - 1; i++) {
      const p0 = ctrl[i - 1] || ctrl[i], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[i + 2] || p2;
      const seg = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const n = Math.max(2, Math.ceil(seg / Math.max(1.5, spacing)));
      for (let j = 0; j < n; j++) {
        const t = j / n, t2 = t * t, t3 = t2 * t;
        dense.push({
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        });
      }
    }
    dense.push(ctrl[ctrl.length - 1]);

    const L = new Float32Array(dense.length);
    for (let i = 1; i < dense.length; i++) L[i] = L[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y);
    const total = L[L.length - 1];
    const press = o.pressure ?? 1;
    if (total < 0.5) return [{ x: dense[0].x, y: dense[0].y, p: press, ang: 0, u: 0.5 }];

    const out = [];
    const off = rng.range(0, 2000);
    const wob = o.wobble ?? 1, wf = o.wobbleFreq ?? 0.011;
    const attack = o.attack ?? 0.14, release = o.release ?? 0.26;
    let s = 0, k = 0;
    while (s <= total) {
      while (k < L.length - 2 && L[k + 1] < s) k++;
      const segL = (L[k + 1] - L[k]) || 1, t = (s - L[k]) / segL;
      const a = dense[k], b = dense[k + 1];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const u = s / total;
      // slow drift of the arm + fast physiological tremor
      const w = (N.noise2(s * wf, off) + N.noise2(s * wf * 5.1, off + 40) * 0.3) * wob;
      const x = a.x + (b.x - a.x) * t - Math.sin(ang) * w;
      const y = a.y + (b.y - a.y) * t + Math.cos(ang) * w;
      const e1 = u < attack ? smoothstep(0, 1, u / attack) : 1;
      const e2 = u > 1 - release ? smoothstep(0, 1, (1 - u) / release) : 1;
      const env = 0.1 + 0.9 * e1 * e2;
      const p = clamp(press * env * (1 + 0.3 * N.noise2(s * 0.021, off + 100)), 0, 1);
      out.push({ x, y, p, ang, u });
      // the hand speeds up mid-stroke: wider spacing = more skipping
      s += spacing * (0.72 + 0.56 * (0.5 + 0.5 * N.noise2(s * 0.009, off + 200)));
    }
    return out;
  }
}

/* ====================================================================
 *  SpriteLib — the crumbling tips of each stick, as alpha masks
 * ==================================================================== */
class SpriteLib {
  constructor(seed) {
    this.rng = new RNG(seed);
    this.base = {};
    this.cache = new Map();
    this.maxEntries = 700;
    const r = this.rng;
    this.base.chalk = this._make(4, 48, (nx, ny, g, g2) => {
      const d = Math.hypot(nx, ny) + (g2 - 0.5) * 0.5;
      let a = smoothstep(0.86, 0.36, d) * (0.3 + 0.7 * smoothstep(0.22, 0.78, g * 0.7 + g2 * 0.3));
      if (g < 0.2) a *= 0.35;                                  // crumb voids
      return a;
    }, 2.1);
    this.base.oil = this._make(4, 40, (nx, ny, g, g2) => {
      const d = Math.pow(Math.pow(Math.abs(nx), 4) + Math.pow(Math.abs(ny * 1.15), 4), 0.25) + (g2 - 0.5) * 0.22;
      const striation = 0.78 + 0.22 * Math.sin(ny * 24 + g2 * 5);
      return smoothstep(0.94, 0.78, d) * striation * (0.86 + 0.14 * g);
    }, 2.6);
    this.base.conte = this._make(4, 32, (nx, ny, g, g2) => {
      const d = Math.max(Math.abs(nx), Math.abs(ny * 1.25)) + (g2 - 0.5) * 0.1;
      return smoothstep(0.9, 0.78, d) * (0.5 + 0.5 * smoothstep(0.18, 0.72, g));
    }, 1.6);
    this.base.willow = this._make(4, 32, (nx, ny, g, g2) => {
      const d = Math.hypot(nx * 0.8, ny * 2.6) + (g2 - 0.5) * 0.4;
      const streak = 0.35 + 0.65 * smoothstep(0.25, 0.65, g);
      return smoothstep(0.95, 0.4, d) * streak;
    }, 1.4);
    this.base.crumb = this._make(6, 10, (nx, ny, g, g2) => {
      const d = Math.hypot(nx, ny) + (g2 - 0.5) * 0.9;
      return smoothstep(0.75, 0.2, d);
    }, 2.5);
    this.base.soft = this._make(1, 64, (nx, ny) => {
      const d = clamp(1 - Math.hypot(nx, ny));
      return d * d;
    }, 8);
    void r;
  }

  _make(count, size, fn, cell) {
    const out = [];
    for (let v = 0; v < count; v++) {
      const c = makeCanvas(size, size);
      const img = c._ctx.createImageData(size, size), d = img.data;
      const g1 = valueField(size, size, cell, this.rng);
      const g2 = valueField(size, size, cell * 3.2, this.rng);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const i = y * size + x, j = i * 4;
        const nx = ((x + 0.5) / size) * 2 - 1, ny = ((y + 0.5) / size) * 2 - 1;
        d[j] = d[j + 1] = d[j + 2] = 255;
        d[j + 3] = clamp(fn(nx, ny, g1[i], g2[i]), 0, 1) * 255;
      }
      c._ctx.putImageData(img, 0, 0);
      out.push(c);
    }
    return out;
  }

  /** Tinted sprite set for a colour (5-bit quantised, LRU cached). */
  tinted(kind, rgb) {
    const q = ((rgb[0] >> 3) << 10) | ((rgb[1] >> 3) << 5) | (rgb[2] >> 3);
    const key = kind + q;
    let set = this.cache.get(key);
    if (set) { this.cache.delete(key); this.cache.set(key, set); return set; }
    const col = `rgb(${((rgb[0] >> 3) << 3) + 4},${((rgb[1] >> 3) << 3) + 4},${((rgb[2] >> 3) << 3) + 4})`;
    set = this.base[kind].map((s) => {
      const c = makeCanvas(s.width, s.height), g = c._ctx;
      g.drawImage(s, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = col; g.fillRect(0, 0, s.width, s.height);
      return c;
    });
    this.cache.set(key, set);
    if (this.cache.size > this.maxEntries) this.cache.delete(this.cache.keys().next().value);
    return set;
  }
}

/* ====================================================================
 *  Studio — the easel: pressure buckets, tooth filtering, tooth loading
 * ==================================================================== */
export class Studio {
  constructor(paper, { seed = 7 } = {}) {
    this.paper = paper;
    this.w = paper.w; this.h = paper.h;
    this.levels = paper.tooth;
    this.buckets = this.levels.map(() => {
      const c = makeCanvas(this.w, this.h);
      return { c, ctx: c._ctx, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    });
    this.sprites = new SpriteLib(seed);
    this.rng = new RNG(seed + 1);
    this.target = null;
    this.physics = true;                 // tooth grip (off for animation layers)
    this.loadEnabled = true;             // whether marks load the tooth (off for boil re-drawings)
    this.coarse = false;                 // two-band tooth filtering for live redraws
    this.cell = 8;
    this.gw = Math.ceil(this.w / this.cell); this.gh = Math.ceil(this.h / this.cell);
    this.dryLoad = new Float32Array(this.gw * this.gh);
    this.waxLoad = new Float32Array(this.gw * this.gh);
    this.dabCount = 0;
  }

  setTarget(ctx) { if (this.target && this.target !== ctx) this.flush(); this.target = ctx; }

  levelFor(p) {
    const n = this.levels.length, i = clamp(Math.floor(p * n), 0, n - 1);
    // coarse mode (animation): two pressure bands only, half the compositing work
    return this.coarse ? (i >= 3 ? n - 1 : 1) : i;
  }

  _gi(x, y) { return clamp((y / this.cell) | 0, 0, this.gh - 1) * this.gw + clamp((x / this.cell) | 0, 0, this.gw - 1); }

  /** How well the sheet still takes pigment of a given binder at (x, y). */
  grip(x, y, kind) {
    if (!this.physics) return 1;
    const i = this._gi(x, y), dry = this.dryLoad[i], wax = this.waxLoad[i];
    if (kind === 'charcoal') return clamp(1 - wax * 0.8 - dry * 0.25, 0.08, 1);
    if (kind === 'wax') return clamp(1 - wax * 0.3, 0.55, 1);
    return clamp(1 - dry * 0.5 - wax * 0.4, 0.22, 1);
  }

  load(x, y, amt, kind) {
    if (!this.physics || !this.loadEnabled) return;
    const i = this._gi(x, y);
    const g = kind === 'wax' ? this.waxLoad : this.dryLoad;
    g[i] = Math.min(1, g[i] + amt);
  }

  /** Deposit one dab of pigment into a pressure bucket. */
  stamp(level, img, x, y, size, angle, alpha, aspect = 1) {
    if (alpha <= 0.004 || size < 0.4) return;
    const b = this.buckets[level], ctx = b.ctx;
    ctx.globalAlpha = alpha > 1 ? 1 : alpha;
    const s = size / img.width;
    if (angle) {
      const c = Math.cos(angle), sn = Math.sin(angle);
      ctx.setTransform(c * s, sn * s, -sn * s * aspect, c * s * aspect, x, y);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
    } else {
      ctx.setTransform(s, 0, 0, s * aspect, x, y);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
    }
    const r = size * 0.75 + 2;
    if (x - r < b.x0) b.x0 = x - r; if (y - r < b.y0) b.y0 = y - r;
    if (x + r > b.x1) b.x1 = x + r; if (y + r > b.y1) b.y1 = y + r;
    this.dabCount++;
  }

  /** Press the buckets through the paper's tooth and onto the target sheet. */
  flush(composite = 'source-over', alpha = 1) {
    const t = this.target;
    if (!t) return;
    for (let i = 0; i < this.buckets.length; i++) {
      const b = this.buckets[i];
      if (b.x1 < b.x0) continue;
      const x = clamp(Math.floor(b.x0), 0, this.w), y = clamp(Math.floor(b.y0), 0, this.h);
      const w = clamp(Math.ceil(b.x1), 0, this.w) - x, h = clamp(Math.ceil(b.y1), 0, this.h) - y;
      b.x0 = b.y0 = Infinity; b.x1 = b.y1 = -Infinity;
      const ctx = b.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (w <= 0 || h <= 0) { ctx.clearRect(0, 0, this.w, this.h); continue; }
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();      // keep the work local
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(this.levels[i].canvas, x, y, w, h, x, y, w, h);
      ctx.restore();
      t.save();
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.globalCompositeOperation = composite;
      t.globalAlpha = alpha;
      t.drawImage(b.c, x, y, w, h, x, y, w, h);
      t.restore();
      ctx.clearRect(x, y, w, h);
    }
  }
}

/* ====================================================================
 *  The tools
 * ==================================================================== */
class Tool {
  constructor(studio, seed) { this.studio = studio; this.rng = new RNG(seed); }
  _trace(points, o, spacing, defWobble = 1, defs = {}) {
    return Hand.trace(points, {
      spacing, wobble: o.wobble ?? defWobble, wobbleFreq: o.wobbleFreq, pressure: o.pressure,
      attack: o.attack ?? defs.attack, release: o.release ?? defs.release, bow: o.bow,
    }, this.rng);
  }
}

/** I. Ember Chalk — hand-rolled soft pastel, more pigment than binder. */
export class EmberChalk extends Tool {
  static card = {
    id: 'chalk', name: 'Ember Chalk', medium: 'hand-rolled soft pastel',
    recipe: 'Raw pigment, precipitated chalk and a whisper of gum tragacanth, rolled between the palms and dried slowly on blotter.',
    behaviour: 'Crumbles as it moves. Under light pressure it only kisses the tops of the paper\'s nodules, leaving a sparkling broken film; pressed harder it drives into the valleys. Every pass loads the tooth, so the third layer grips less than the first. Loose crumbs fall and settle below the stroke.',
  };
  stroke(points, o = {}) {
    const S = this.studio, rng = this.rng;
    const size = o.size ?? 14, alpha = o.alpha ?? 0.55, crumble = o.crumble ?? 0.1;
    const path = this._trace(points, o, o.spacing ?? Math.max(1, size * 0.26), size * 0.12);
    const set = S.sprites.tinted('chalk', o.color);
    const crumbs = crumble > 0 ? S.sprites.tinted('crumb', o.color) : null;
    const depth = o.depth ?? 0;
    for (const s of path) {
      const g = S.grip(s.x, s.y, 'dry');
      const p = s.p;
      if (rng.next() < 0.08 * (1 - p)) continue;               // skipped over the tooth
      const lvl = S.levelFor(clamp(p * (0.45 + 0.55 * g) + depth));
      const sz = size * (0.62 + 0.5 * p) * rng.range(0.85, 1.15);
      S.stamp(lvl, set[(rng.next() * set.length) | 0],
        s.x + rng.gauss(0, size * 0.06), s.y + rng.gauss(0, size * 0.06),
        sz, rng.next() * 6.283, alpha * g * (0.45 + 0.55 * p));
      S.load(s.x, s.y, 0.006 * p * alpha * (size / 14), 'dry');
      if (crumbs && rng.next() < crumble * p) {
        const n = 1 + ((rng.next() * 3) | 0);
        for (let k = 0; k < n; k++) {
          S.stamp(S.levels.length - 1, crumbs[(rng.next() * crumbs.length) | 0],
            s.x + rng.gauss(0, size * 0.5), s.y + Math.abs(rng.gauss(size * 0.35, size * 0.6)),
            rng.range(1.2, 3.4), 0, rng.range(0.4, 0.9));
        }
      }
    }
  }
}

/** II. Lantern Wax — dense oil pastel that seals the tooth and catches light. */
export class LanternWax extends Tool {
  static card = {
    id: 'wax', name: 'Lantern Wax', medium: 'dense oil pastel',
    recipe: 'Pigment kneaded warm into beeswax, mineral oil and a little carnauba so the stick stays buttery at body heat.',
    behaviour: 'Glides, never crumbles. It presses deep into the tooth and seals it: charcoal will skate over it afterwards and chalk only half-catches. Each stroke throws up a faint ridge of wax on its leading shoulder that catches a lighter sheen.',
  };
  stroke(points, o = {}) {
    const S = this.studio, rng = this.rng;
    const size = o.size ?? 10, alpha = o.alpha ?? 0.85;
    const path = this._trace(points, o, o.spacing ?? Math.max(0.8, size * 0.2), size * 0.08);
    const set = S.sprites.tinted('oil', o.color);
    const sheenCol = o.sheen === false ? null : mix2(o.color, o.sheenColor ?? P.candleCream, 0.42);
    const sheen = sheenCol ? S.sprites.tinted('oil', sheenCol) : null;
    let i = 0;
    for (const s of path) {
      const g = S.grip(s.x, s.y, 'wax');
      const lvl = S.levelFor(clamp(0.6 + s.p * 0.4 * g));
      const sz = size * (0.55 + 0.5 * s.p);
      S.stamp(lvl, set[(rng.next() * set.length) | 0], s.x, s.y, sz, s.ang, alpha * g * (0.55 + 0.45 * s.p), 0.62);
      S.load(s.x, s.y, 0.02 * s.p * (size / 10), 'wax');
      if (sheen && (i++ % 3 === 0)) {
        const off = -sz * 0.34;
        S.stamp(S.levels.length - 1, sheen[(rng.next() * sheen.length) | 0],
          s.x - Math.sin(s.ang) * off, s.y + Math.cos(s.ang) * off, sz * 0.42, s.ang, 0.32 * s.p, 0.5);
      }
    }
  }
}

/** III. Dusk Conté — a square stick of fired earth, for hatching. */
export class DuskConte extends Tool {
  static card = {
    id: 'conte', name: 'Dusk Conté', medium: 'square conté crayon (sanguine · indigo · pearl)',
    recipe: 'Iron earths and indigo bound in kaolin clay, pressed square and kiln-fired hard.',
    behaviour: 'Held at a fixed angle like a real crayon, so its square tip turns crisp and narrow on one heading and broad on another. Firm enough to lay disciplined hatching and cross-hatching that sits on the tooth without filling it.',
  };
  stroke(points, o = {}) {
    const S = this.studio, rng = this.rng;
    const size = o.size ?? 4, alpha = o.alpha ?? 0.75;
    const hold = (o.hold ?? 0.65) + rng.range(-0.08, 0.08);
    const path = this._trace(points, o, o.spacing ?? Math.max(0.7, size * 0.3), size * 0.2);
    const set = S.sprites.tinted('conte', o.color);
    for (const s of path) {
      const g = S.grip(s.x, s.y, 'dry');
      if (rng.next() < 0.05 * (1 - s.p)) continue;
      // contact width depends on how the square tip meets the heading
      const contact = 0.55 + 0.45 * Math.abs(Math.sin(s.ang - hold));
      const lvl = S.levelFor(clamp(0.25 + s.p * 0.55 * g + (o.depth ?? 0)));
      S.stamp(lvl, set[(rng.next() * set.length) | 0], s.x, s.y,
        size * (0.6 + 0.45 * s.p) * contact * 1.3, hold, alpha * g * (0.5 + 0.5 * s.p), 0.75);
      S.load(s.x, s.y, 0.004 * s.p, 'dry');
    }
  }
}

/** IV. Willow Ash — charred willow vine, the searching line. */
export class WillowAsh extends Tool {
  static card = {
    id: 'willow', name: 'Willow Ash', medium: 'charred willow vine charcoal',
    recipe: 'Peeled willow withies sealed in a tin with sand and charred overnight in a wood stove.',
    behaviour: 'Fragile and scratchy. It breaks up over the tooth, skates almost uselessly across wax, and leaves a grey halo of dust that smears. Lines are searched for, drawn two or three times, never once — and on every animated frame the artist searches again, so the contours boil.',
  };
  stroke(points, o = {}) {
    const S = this.studio, rng = this.rng;
    const size = o.size ?? 2.6, alpha = o.alpha ?? 0.7;
    const path = this._trace(points, o, o.spacing ?? Math.max(0.6, size * 0.33), 1.2 + size * 0.3);
    const set = S.sprites.tinted('willow', o.color);
    const dust = (o.dust ?? 0.05) > 0 ? S.sprites.tinted('chalk', o.color) : null;
    let breakRun = 0;
    for (const s of path) {
      const g = S.grip(s.x, s.y, 'charcoal');
      if (breakRun > 0) { breakRun--; continue; }
      if (rng.next() < 0.02 + (1 - g) * 0.2) { breakRun = (rng.next() * 4) | 0; continue; }   // stick skips
      const lvl = S.levelFor(clamp(0.15 + s.p * 0.6 * g));
      S.stamp(lvl, set[(rng.next() * set.length) | 0], s.x, s.y, size * (0.6 + 0.7 * s.p) * 2.4, s.ang, alpha * g * (0.35 + 0.65 * s.p), 1);
      if (dust && rng.next() < (o.dust ?? 0.05)) {
        S.stamp(0, dust[(rng.next() * dust.length) | 0], s.x + rng.gauss(0, 3), s.y + rng.gauss(0, 3), size * rng.range(3, 6), rng.next() * 6.28, 0.12);
      }
    }
  }
}

/** V. Tortillon — a tightly rolled paper stump. Moves pigment; adds none. */
export class Tortillon extends Tool {
  static card = {
    id: 'tortillon', name: 'Tortillon', medium: 'rolled-paper blending stump',
    recipe: 'Soft grey blotting paper rolled diagonally into a hard double-pointed stump, sanded clean between passes.',
    behaviour: 'Carries no pigment of its own. It lifts what is already on the sheet under its tip and drags it in the direction of travel, burnishing pigment down into the valleys of the tooth. Used for skies, haze, light shafts and the soft breath around every glow.',
  };
  constructor(studio, seed) {
    super(studio, seed);
    this.scratch = makeCanvas(256, 256);
    this.masks = new Map();
  }
  _mask(d) {
    let m = this.masks.get(d);
    if (!m) {
      m = makeCanvas(d, d);
      const g = m._ctx, r = d / 2;
      const rg = g.createRadialGradient(r, r, 0, r, r, r);
      rg.addColorStop(0, 'rgba(255,255,255,1)');
      rg.addColorStop(0.45, 'rgba(255,255,255,0.75)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.fillRect(0, 0, d, d);
      this.masks.set(d, m);
    }
    return m;
  }
  smudge(points, o = {}) {
    const S = this.studio;
    S.flush();
    const t = S.target;
    const r = Math.round(clamp(o.radius ?? 14, 3, 120));
    const d = r * 2;
    const strength = o.strength ?? 0.5;
    const path = this._trace(points, o, o.spacing ?? Math.max(1, r * 0.3), r * 0.15, { attack: 0.2, release: 0.35 });
    if (this.scratch.width < d) { this.scratch = makeCanvas(d, d); }
    const sc = this.scratch._ctx, mask = this._mask(d);
    t.save();
    t.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      sc.globalCompositeOperation = 'copy';
      sc.globalAlpha = 1;
      sc.drawImage(t.canvas, a.x - r, a.y - r, d, d, 0, 0, d, d);
      sc.globalCompositeOperation = 'destination-in';
      sc.drawImage(mask, 0, 0);
      t.globalAlpha = strength * b.p;
      t.drawImage(this.scratch, 0, 0, d, d, b.x - r, b.y - r, d, d);
    }
    t.restore();
  }
  stroke(points, o = {}) { this.smudge(points, { ...o, radius: o.radius ?? o.size, strength: o.strength ?? o.alpha }); }
}

/* ====================================================================
 *  Regions & Techniques — how an artist covers ground
 * ==================================================================== */
export const Region = {
  fn(bbox, inside) { return { bbox, inside }; },
  ellipse(cx, cy, rx, ry) {
    return { bbox: [cx - rx, cy - ry, cx + rx, cy + ry], inside: (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 };
  },
  /** between top(x) and bottom(x) for x in [x0, x1] */
  band(x0, x1, top, bottom, yMin, yMax) {
    return { bbox: [x0, yMin, x1, yMax], inside: (x, y) => x >= x0 && x <= x1 && y >= top(x) && y <= bottom(x) };
  },
  poly(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    return {
      bbox: [x0, y0, x1, y1],
      inside: (x, y) => {
        let c = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const a = pts[i], b = pts[j];
          if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
        }
        return c;
      },
    };
  },
};

/**
 * Every technique returns a list of jobs (closures). The orchestrator runs
 * them in timed slices so the drawing is visibly made, mark by mark.
 */
export const Technique = {
  /** Parallel hatching of short, overlapping, hand-length strokes. */
  hatch(tool, region, o) {
    const rng = o.rng, jobs = [];
    const [bx0, by0, bx1, by1] = region.bbox;
    const ang = o.angle ?? -0.3;
    const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
    const corners = [[bx0, by0], [bx1, by0], [bx0, by1], [bx1, by1]];
    let n0 = Infinity, n1 = -Infinity, d0 = Infinity, d1 = -Infinity;
    for (const [x, y] of corners) {
      const pn = x * nx + y * ny, pd = x * dx + y * dy;
      n0 = Math.min(n0, pn); n1 = Math.max(n1, pn); d0 = Math.min(d0, pd); d1 = Math.max(d1, pd);
    }
    const spacing = o.spacing ?? 8;
    const [lmin, lmax] = o.length ?? [30, 90];
    const density = o.density;
    for (let v = n0; v < n1; v += spacing * rng.range(0.7, 1.3)) {
      let u = d0 - rng.range(0, lmax);
      while (u < d1) {
        const len = rng.range(lmin, lmax);
        const ja = (o.jitterAngle ?? 0.08) * rng.gauss(0, 1);
        const cdx = Math.cos(ang + ja), cdy = Math.sin(ang + ja);
        const vv = v + rng.gauss(0, spacing * 0.25);
        const sx = nx * vv + dx * u, sy = ny * vv + dy * u;
        // walk the stroke, keep the longest run that stays inside the region
        const steps = Math.max(3, Math.ceil(len / 6));
        let start = -1, best = null;
        for (let k = 0; k <= steps; k++) {
          const px = sx + cdx * (len * k) / steps, py = sy + cdy * (len * k) / steps;
          const ins = region.inside(px, py) && (!density || rng.next() < density(px, py));
          if (ins && start < 0) start = k;
          if ((!ins || k === steps) && start >= 0) {
            const end = ins ? k : k - 1;
            if (!best || end - start > best[1] - best[0]) best = [start, end];
            start = -1;
          }
        }
        if (best && best[1] - best[0] >= Math.max(1, steps * (o.minFrac ?? 0.3))) {
          const a = { x: sx + cdx * (len * best[0]) / steps, y: sy + cdy * (len * best[0]) / steps };
          const b = { x: sx + cdx * (len * best[1]) / steps, y: sy + cdy * (len * best[1]) / steps };
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          const color = o.color(mx, my, rng);
          if (color) {
            const extra = o.strokeOpts ? o.strokeOpts(mx, my, rng) : null;
            const opts = { size: o.size, alpha: o.alpha, pressure: o.pressure, crumble: o.crumble, wobble: o.wobble, depth: o.depth, bow: o.bow, hold: o.hold, sheen: o.sheen, color, ...extra };
            jobs.push(() => tool.stroke([a, b], opts));
          }
        }
        u += len * rng.range(o.gapMin ?? 0.55, o.gapMax ?? 1.05);
      }
    }
    if (o.shuffle !== false) shuffle(jobs, rng);
    return jobs;
  },

  /** Two hatch layers at different angles. */
  crossHatch(tool, region, o) {
    return [
      ...Technique.hatch(tool, region, o),
      ...Technique.hatch(tool, region, { ...o, angle: (o.angle ?? -0.3) + (o.cross ?? 1.15) }),
    ];
  },

  /** Small looping scribbles — the scumble that breaks a flat passage. */
  scumble(tool, region, o) {
    const rng = o.rng, jobs = [];
    const [x0, y0, x1, y1] = region.bbox;
    let tries = 0, made = 0;
    while (made < o.count && tries < o.count * 8) {
      tries++;
      const cx = rng.range(x0, x1), cy = rng.range(y0, y1);
      if (!region.inside(cx, cy)) continue;
      made++;
      const r = rng.range(o.radius[0], o.radius[1]);
      const turns = rng.range(1.1, 2.6), ph = rng.range(0, 6.28), sq = rng.range(0.45, 1);
      const pts = [];
      const n = Math.ceil(turns * 9);
      for (let k = 0; k <= n; k++) {
        const a = ph + (k / n) * turns * 6.283;
        const rr = r * (0.6 + 0.4 * Math.sin(k * 0.9 + ph));
        pts.push({ x: cx + Math.cos(a) * rr + (k / n) * r * 0.8, y: cy + Math.sin(a) * rr * sq });
      }
      const color = o.color(cx, cy, rng);
      if (color) jobs.push(() => tool.stroke(pts, { size: o.size, alpha: o.alpha, pressure: o.pressure, crumble: o.crumble, depth: o.depth, sheen: o.sheen, color }));
    }
    return jobs;
  },

  /** A searched-for contour: two or three passes, never quite on top. */
  contour(tool, pts, o) {
    const rng = o.rng, jobs = [];
    const passes = o.passes ?? 2;
    for (let p = 0; p < passes; p++) {
      const off = { x: rng.gauss(0, o.drift ?? 1.4), y: rng.gauss(0, o.drift ?? 1.4) };
      // break long contours into overlapping hand-length pieces
      const seg = o.segment ?? 14;
      for (let i = 0; i < pts.length - 1; i += seg - 2) {
        const piece = pts.slice(i, Math.min(pts.length, i + seg)).map((q) => ({ x: q.x + off.x, y: q.y + off.y }));
        if (piece.length < 2) continue;
        const color = typeof o.color === 'function' ? o.color(piece[0].x, piece[0].y, rng) : o.color;
        const opts = { size: o.size, alpha: (o.alpha ?? 0.7) * (p ? 0.7 : 1), pressure: o.pressure ?? rng.range(0.6, 1), color, wobble: o.wobble, dust: o.dust };
        jobs.push(() => tool.stroke(piece, opts));
      }
    }
    return jobs;
  },
};

export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

export function createToolkit(studio, seed = 11) {
  return {
    chalk: new EmberChalk(studio, seed + 1),
    wax: new LanternWax(studio, seed + 2),
    conte: new DuskConte(studio, seed + 3),
    willow: new WillowAsh(studio, seed + 4),
    tortillon: new Tortillon(studio, seed + 5),
  };
}
export const TOOL_CARDS = [EmberChalk.card, LanternWax.card, DuskConte.card, WillowAsh.card, Tortillon.card];
