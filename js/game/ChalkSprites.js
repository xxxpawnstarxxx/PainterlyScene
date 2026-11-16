/**
 * ChalkSprites.js — the game's cast and props, each drawn by the same
 * simulated hand into small sheets, three times over (a three-drawing boil).
 *
 *   spore      the player: a seed of light let out of the nest
 *   ember      a mote of warm light worth gathering
 *   knot       an ink knot: a charcoal tangle that smudges your light
 *   burst      12-frame chalk bloom (warm / cool / ink)
 *   meter      the glow meter's frame and its wax fill
 *   card       a scumbled indigo card for panels
 *   shade      the smudged dark field behind the main menu
 *   underline  a quick chalk underscore for the selected menu item
 */
import { RNG, makeCanvas, smoothstep, clamp } from '../engine/Noise.js';
import { Region, Technique } from '../engine/DryMediaTools.js';
import { P, mix2, vary } from '../engine/Palette90sOVA.js';

export class ChalkSprites {
  constructor(studio, tools, seed = 1990) {
    this.S = studio; this.tools = tools; this.seed = seed;
    this.cards = new Map();
    this.underlines = new Map();
  }

  /** Run a drawing function onto `variants` fresh w×h sheets. */
  _sheets(w, h, variants, draw, salt = 0) {
    const S = this.S;
    const prev = { target: S.target, physics: S.physics, load: S.loadEnabled, coarse: S.coarse };
    const out = [];
    for (let v = 0; v < variants; v++) {
      const c = makeCanvas(w, h);
      S.setTarget(c._ctx);
      S.physics = false; S.loadEnabled = false; S.coarse = false;
      draw(this.tools, new RNG(this.seed * 31 + salt * 7919 + v * 104729), c, v);
      S.flush();
      out.push(c);
    }
    S.physics = prev.physics; S.loadEnabled = prev.load; S.coarse = prev.coarse;
    if (prev.target) S.setTarget(prev.target);
    return out;
  }

  buildAll() {
    this.spore = this._spore();
    this.ember = this._ember();
    this.knot = this._knot();
    this.burst = {
      warm: this._burst([P.honeyHalo, P.candleCream], 1),
      cool: this._burst([P.electricCyan, P.pearl], 2),
      rose: this._burst([P.hollyhockRose, P.honeyHalo], 3),
      ink: this._burst([P.vineBlack, P.bruisedViolet], 4),
    };
    this.meterFrame = this._meterFrame(360, 34);
    this.meterFill = this._meterFill(340, 22);
    this.shade = this._shade();
    this.glow = this._glows();
  }

  _spore() {
    const N = 112, c = N / 2;
    return this._sheets(N, N, 3, ({ chalk, wax, conte, willow }, r) => {
      // filaments — a dandelion seed's parachute
      for (let k = 0; k < 11; k++) {
        const a = -Math.PI / 2 + (k / 10 - 0.5) * 2.4 + r.gauss(0, 0.06);
        const L = r.range(26, 38);
        conte.stroke([{ x: c, y: c }, { x: c + Math.cos(a) * L, y: c + Math.sin(a) * L }], { color: P.pearl, size: 1.4, alpha: 0.75, pressure: 0.85, spacing: 1.2 });
        chalk.stroke([{ x: c + Math.cos(a) * L, y: c + Math.sin(a) * L }, { x: c + Math.cos(a) * L + 1, y: c + Math.sin(a) * L }], { color: P.candleCream, size: 5, alpha: 0.8, pressure: 0.9, crumble: 0 });
      }
      // warm halo
      for (let k = 0; k < 14; k++) {
        const a = r.range(0, 6.28), rr = r.range(6, 16);
        chalk.stroke([{ x: c + Math.cos(a) * rr, y: c + Math.sin(a) * rr }, { x: c + Math.cos(a + 0.8) * rr, y: c + Math.sin(a + 0.8) * rr }], { color: vary(P.peach, r, 0.06), size: 10, alpha: 0.35, pressure: 0.6, crumble: 0 });
      }
      // the seed itself
      for (let k = 0; k < 5; k++) {
        const y = c - 7 + k * 3.5, hw = Math.sqrt(Math.max(0, 1 - ((k - 2) / 2.6) ** 2)) * 8;
        wax.stroke([{ x: c - hw, y }, { x: c + hw, y: y + 0.5 }], { color: vary(k < 2 ? P.candleCream : P.honeyHalo, r, 0.04), size: 6, alpha: 0.95, pressure: 1, sheen: false });
      }
      const ring = []; for (let k = 0; k <= 14; k++) { const a = (k / 14) * 6.283; ring.push({ x: c + Math.cos(a) * 9, y: c + Math.sin(a) * 10 }); }
      willow.stroke(ring, { color: P.sepia, size: 1.4, alpha: 0.6, pressure: 0.7, dust: 0 });
    }, 11);
  }

  _ember() {
    const N = 72, c = N / 2;
    return this._sheets(N, N, 3, ({ chalk, wax }, r) => {
      const rays = 8;
      for (let k = 0; k < rays; k++) {
        const a = (k / rays) * 6.283 + r.gauss(0, 0.08) + 0.3;
        const L = k % 2 ? r.range(10, 15) : r.range(20, 28);
        chalk.stroke([{ x: c + Math.cos(a) * 4, y: c + Math.sin(a) * 4 }, { x: c + Math.cos(a) * L, y: c + Math.sin(a) * L }], { color: vary(k % 2 ? P.goldenAmber : P.honeyHalo, r, 0.05), size: 4.5, alpha: 0.85, pressure: 0.9, crumble: 0.2, release: 0.6 });
      }
      wax.stroke([{ x: c - 5, y: c }, { x: c + 5, y: c + 1 }], { color: P.candleCream, size: 10, alpha: 1, pressure: 1, sheen: false });
      wax.stroke([{ x: c - 1, y: c - 5 }, { x: c + 1, y: c + 5 }], { color: P.candleCream, size: 7, alpha: 1, pressure: 1, sheen: false });
    }, 12);
  }

  _knot() {
    const N = 150, c = N / 2;
    return this._sheets(N, N, 3, ({ willow, chalk, conte }, r) => {
      // a soft smudge of ink to sit in
      for (let k = 0; k < 10; k++) {
        const a = r.range(0, 6.28), rr = r.range(8, 34);
        chalk.stroke([{ x: c + Math.cos(a) * rr, y: c + Math.sin(a) * rr }, { x: c + Math.cos(a + 1) * rr, y: c + Math.sin(a + 1) * rr }], { color: vary(P.midnightIndigo, r, 0.05), size: 22, alpha: 0.4, pressure: 0.6, crumble: 0.1 });
      }
      // the tangle: looping willow scribbles
      for (let loop = 0; loop < 4; loop++) {
        const pts = []; const ph = r.range(0, 6.28), turns = r.range(1.6, 2.6);
        for (let k = 0; k <= 34; k++) {
          const a = ph + (k / 34) * turns * 6.283;
          const rr = 14 + 30 * Math.abs(Math.sin(k * 0.37 + loop)) + r.gauss(0, 3);
          pts.push({ x: c + Math.cos(a) * rr, y: c + Math.sin(a) * rr * r.range(0.7, 1) });
        }
        willow.stroke(pts, { color: loop % 2 ? P.vineBlack : mix2(P.vineBlack, P.bruisedViolet, 0.5), size: 3.4, alpha: 0.9, pressure: 0.95, dust: 0.08, spacing: 1.4 });
      }
      // cold lavender glints so the knots read against the dark meadows
      for (let k = 0; k < 6; k++) {
        const a = r.range(0, 6.28), rr = r.range(24, 42);
        conte.stroke([{ x: c + Math.cos(a) * rr, y: c + Math.sin(a) * rr }, { x: c + Math.cos(a + 0.5) * rr, y: c + Math.sin(a + 0.5) * rr }], { color: vary(P.lavenderHaze, r, 0.06), size: 2, alpha: 0.75, pressure: 0.8 });
      }
    }, 13);
  }

  /** A 12-drawing chalk bloom, like the celebration bursts over the valley. */
  _burst(pal, salt) {
    const N = 240, c = N / 2, n = 12;
    const frames = [];
    for (let k = 0; k < n; k++) {
      const u = (k + 1) / n;
      frames.push(this._sheets(N, N, 1, ({ chalk }, r) => {
        const radius = 100 * (1 - Math.pow(1 - u, 3));
        const fade = Math.pow(1 - u, 1.1) + 0.05;
        const rays = 24;
        for (let i = 0; i < rays; i++) {
          const a = (i / rays) * 6.283 + r.gauss(0, 0.05);
          const r0 = radius * (0.5 + 0.25 * u), r1 = radius * r.range(0.9, 1.08);
          const droop = u * u * 22;
          chalk.stroke([{ x: c + Math.cos(a) * r0, y: c + Math.sin(a) * r0 + droop * 0.4 }, { x: c + Math.cos(a) * r1, y: c + Math.sin(a) * r1 + droop }],
            { color: i % 3 ? pal[0] : pal[1], size: 3.4 + 2 * (1 - u), alpha: 0.85 * fade, pressure: 0.85, crumble: 0.25 * u, attack: 0.3, release: 0.4 });
        }
      }, salt * 100 + k)[0]);
    }
    return frames;
  }

  _meterFrame(w, h) {
    const W = w + 24, H = h + 24;
    return this._sheets(W, H, 3, ({ willow, chalk }, r) => {
      const x0 = 12, y0 = 12, x1 = 12 + w, y1 = 12 + h;
      const bg = Region.fn([x0, y0, x1, y1], (x, y) => x > x0 && x < x1 && y > y0 && y < y1);
      for (const j of Technique.hatch(chalk, bg, { rng: r, angle: -0.6, spacing: 4, length: [10, 30], size: 8, alpha: 0.55, pressure: 0.7, minFrac: 0.1, color: (x, y, rr) => vary(P.midnightIndigo, rr, 0.05) })) j();
      const edge = [{ x: x0, y: y0 }, { x: x1, y: y0 + r.gauss(0, 1) }, { x: x1 + r.gauss(0, 1), y: y1 }, { x: x0, y: y1 + r.gauss(0, 1) }, { x: x0 + r.gauss(0, 1), y: y0 - 2 }];
      for (let i = 0; i < 4; i++) willow.stroke([edge[i], edge[i + 1]], { color: P.lavenderHaze, size: 2, alpha: 0.8, pressure: 0.85, dust: 0.05, bow: 0.01 });
    }, 14);
  }

  _meterFill(w, h) {
    return this._sheets(w, h, 3, ({ wax, chalk }, r) => {
      for (let row = 0; row < 5; row++) {
        const y = 3 + row * (h - 6) / 4;
        for (let x = -10; x < w; x += r.range(30, 60)) {
          const u = clamp(x / w);
          const c = vary(mix2(P.emberCoral, P.honeyHalo, u), r, 0.05);
          wax.stroke([{ x, y }, { x: x + r.range(40, 80), y: y + r.gauss(0, 1) }], { color: c, size: 7, alpha: 0.95, pressure: 1, sheen: row === 0 });
        }
      }
      chalk.stroke([{ x: 0, y: 4 }, { x: w, y: 5 }], { color: P.candleCream, size: 4, alpha: 0.6, pressure: 0.7, crumble: 0 });
    }, 15);
  }

  /** A scumbled indigo card with a ragged chalk edge (cached per size). */
  card(w, h) {
    const key = `${w}x${h}`;
    if (this.cards.has(key)) return this.cards.get(key);
    const m = 30, W = w + m * 2, H = h + m * 2;
    const frames = this._sheets(W, H, 2, ({ chalk, conte, willow, tortillon }, r) => {
      const rag = (x, y) => 9 * Math.sin(x * 0.05 + y * 0.03) + 6 * Math.sin(x * 0.13 - y * 0.11);
      const inside = (x, y) => {
        const dx = Math.min(x - m, m + w - x), dy = Math.min(y - m, m + h - y);
        return Math.min(dx, dy) > rag(x, y) * 0.6;
      };
      const reg = Region.fn([0, 0, W, H], inside);
      const col = (x, y, rr) => vary(mix2(P.midnightIndigo, P.vineBlack, 0.35 + 0.3 * (y / H)), rr, 0.05);
      for (const j of Technique.hatch(chalk, reg, { rng: r, angle: -0.08, spacing: 9, length: [80, 220], size: 34, alpha: 0.85, pressure: 0.95, depth: 0.35, crumble: 0.02, color: col })) j();
      for (const j of Technique.hatch(chalk, reg, { rng: r, angle: 0.6, spacing: 10, length: [30, 80], size: 14, alpha: 0.4, pressure: 0.7, crumble: 0.04, color: (x, y, rr) => vary(mix2(P.bruisedViolet, P.midnightIndigo, 0.5), rr, 0.06) })) j();
      for (const j of Technique.hatch(chalk, reg, { rng: r, angle: 0.12, spacing: 10, length: [60, 180], size: 30, alpha: 0.75, pressure: 0.95, depth: 0.35, crumble: 0, color: col })) j();
      for (const j of Technique.hatch(tortillon, reg, { rng: r, angle: 0, spacing: 26, length: [100, 240], size: 22, alpha: 0.45, color: () => 1 })) j();
      for (const j of Technique.hatch(conte, Region.fn([0, 0, W, H], (x, y) => inside(x, y) && !inside(x - 14, y - 14)), { rng: r, angle: 0.8, spacing: 5, length: [10, 24], size: 2.5, alpha: 0.6, pressure: 0.8, minFrac: 0.1, color: (x, y, rr) => vary(P.lavenderHaze, rr, 0.06) })) j();
      const edge = [];
      for (let x = m; x <= m + w; x += 18) edge.push({ x, y: m + rag(x, m) * 0.6 });
      willow.stroke(edge, { color: P.goldenAmber, size: 1.8, alpha: 0.55, pressure: 0.7, dust: 0 });
    }, 16 + w + h);
    const entry = { w, h, m, frames };
    this.cards.set(key, entry);
    return entry;
  }

  /** The smudged dark field the main menu sits on (left side of the screen). */
  _shade() {
    const W = 1240, H = 1080;
    return this._sheets(W, H, 1, ({ chalk, tortillon }, r) => {
      const reg = Region.fn([0, 0, W, H], () => true);
      const density = (x, y) => 1 - smoothstep(560, 1180 - 120 * Math.sin(y * 0.006), x);
      for (const j of Technique.hatch(chalk, reg, { rng: r, angle: -0.12, spacing: 12, length: [120, 280], size: 46, alpha: 0.6, pressure: 0.9, depth: 0.25, crumble: 0.01, density,
        color: (x, y, rr) => vary(mix2(P.vineBlack, P.midnightIndigo, 0.6 + 0.3 * (y / H)), rr, 0.05) })) j();
      for (const j of Technique.hatch(tortillon, reg, { rng: r, angle: 0, spacing: 22, length: [140, 300], size: 36, alpha: 0.5, color: () => 1, density })) j();
    }, 17)[0];
  }

  /** A quick chalk underscore for a selected item (cached per width). */
  underline(w) {
    const key = Math.round(w / 8) * 8;
    if (this.underlines.has(key)) return this.underlines.get(key);
    const W = key + 40, H = 34;
    const frames = this._sheets(W, H, 3, ({ chalk, wax }, r) => {
      wax.stroke([{ x: 10, y: 18 }, { x: W * 0.5, y: 14 + r.gauss(0, 1) }, { x: W - 12, y: 19 }], { color: P.goldenAmber, size: 6, alpha: 0.9, pressure: 0.95, attack: 0.05, release: 0.5, sheenColor: P.candleCream });
      chalk.stroke([{ x: W * 0.3, y: 23 }, { x: W - 30, y: 21 }], { color: P.hollyhockRose, size: 4, alpha: 0.6, pressure: 0.7, crumble: 0.2 });
    }, 18 + key);
    const entry = { w: W, h: H, frames };
    this.underlines.set(key, entry);
    return entry;
  }

  _glows() {
    const mk = (rgb) => {
      const c = makeCanvas(128, 128), x = c._ctx;
      const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, `rgba(${rgb},0.95)`); g.addColorStop(0.22, `rgba(${rgb},0.38)`); g.addColorStop(1, `rgba(${rgb},0)`);
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
      return c;
    };
    return { warm: mk('255,186,104'), cream: mk('255,240,214'), cyan: mk('90,228,255'), violet: mk('150,110,230'), ember: mk('255,120,70') };
  }
}
