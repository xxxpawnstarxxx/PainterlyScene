/**
 * LivingAnimation.js — the painting breathes.
 *
 * Traditional hand-drawn animation, not tweening:
 *
 *   • Every living element is RE-DRAWN from scratch with the same dry tools
 *     on each new drawing, twelve drawings a second ("on twos" at 24fps).
 *     Nothing slides; positions advance in held steps, and because the hand
 *     never lands twice in the same place, every mark crawls and shivers.
 *   • The contour layer cycles through three separately searched drawings
 *     (a classic three-drawing "boil"), never repeating the same one twice.
 *   • Underneath runs a slow, continuous atmosphere — breathing shafts, a
 *     pulsing sun, twinkling stars — the way an OVA camera crew would add
 *     diffusion and light passes over held cels.
 *
 * The motion is the feeling:
 *   river streaks racing home into the ring ........ effortless momentum
 *   chalk-burst blooms over the valley .............. loud celebratory joy
 *   the floating islands' cascades and light ........ invincibility
 *   seed pods trembling, hopping, bursting .......... impatient, messy joy
 *   spores drifting up for hours .................... being lost in flow
 *   warm grass sighing under a travelling gust ...... the warm night drive
 */
import { RNG, Perlin, clamp, makeCanvas } from '../engine/Noise.js';
import { P, mix2, vary } from '../engine/Palette90sOVA.js';

const DRAWING_DT = 1 / 12;

export class LivingAnimation {
  constructor({ geometry, studio, tools, seed = 1990 }) {
    this.g = geometry;
    this.studio = studio;
    this.tools = tools;
    this.W = geometry.W; this.H = geometry.H;
    this.layer = makeCanvas(this.W, this.H);
    this.lctx = this.layer._ctx;
    this.rng = new RNG(seed ^ 0x5eed);
    this.pn = new Perlin(seed + 77);
    this.time = 0;
    this.drawings = 0;
    this.boilIndex = 0;
    this.shaftIndex = 0;
    this.lod = 1;                       // level of detail, adapts to the machine
    this.lastCost = 0;

    const r = this.rng;
    this.motes = [];
    for (let i = 0; i < 150; i++) this.motes.push(this._spawnMote(true));
    this.streaks = [];
    for (let i = 0; i < 30; i++) this.streaks.push(this._spawnStreak(r.next()));
    this.blooms = [];
    this.nextBloom = 1.2;
    this.pods = geometry.pods.map((p) => ({ ...p, energy: r.range(0, 0.9), rate: r.range(0.08, 0.22), hop: -1 }));
    this.dandelions = geometry.dandelions.map((d) => ({ ...d, seeds: 26, regrow: 0 }));
    this.glow = this._buildGlows();
    this.brightStars = geometry.stars.filter((s) => s.m > 0.2);
  }

  /* ---------------------------------------------------------- spawning */

  _spawnMote(anywhere = false) {
    const { g, rng: r } = this;
    let x, y, kind = 'spore';
    const roll = r.next();
    if (anywhere) {
      x = r.range(0, this.W); y = r.range(g.horizon - 250, this.H);
    } else if (roll < 0.35) {
      const p = r.pick(g.pods); x = p.x + r.gauss(0, 20); y = p.y - p.ry * 0.6;
    } else if (roll < 0.55) {
      const d = r.pick(g.dandelions); x = d.x + d.lean * d.h + r.gauss(0, 10); y = d.y - d.h; kind = 'seed';
    } else if (roll < 0.8) {
      x = r.range(0, this.W); y = r.range(g.ridgeNear(x), this.H);
    } else {
      x = r.range(-100, this.W * 0.5); y = r.range(g.horizon, this.H);
    }
    return {
      x, y, kind, life: 0, max: r.range(5, 14),
      size: kind === 'seed' ? r.range(2, 3.5) : r.range(1.6, 4.2),
      col: kind === 'seed' ? P.pearl : r.pick([P.honeyHalo, P.candleCream, P.electricCyan, P.peach, P.auroraMint]),
      ph: r.range(0, 6.28), buoy: r.range(6, 22),
    };
  }

  _spawnStreak(s = 0) {
    const r = this.rng;
    return { s, lane: r.range(-0.38, 0.38), speed: r.range(0.05, 0.13), len: r.range(0.012, 0.035), col: r.pick([P.honeyHalo, P.candleCream, P.candleCream, P.electricCyan, P.peach]) };
  }

  _spawnBloom() {
    const r = this.rng, g = this.g;
    const x = r.range(640, this.W - 80), y = r.range(70, g.horizon - 260);
    const pal = r.pick([
      [P.electricCyan, P.pearl], [P.hollyhockRose, P.honeyHalo], [P.honeyHalo, P.candleCream],
      [P.auroraMint, P.electricCyan], [P.peach, P.hollyhockRose], [P.lavenderHaze, P.electricCyan],
    ]);
    return { x, y, k: 0, n: r.int(14, 19), rays: r.int(22, 36), R: r.range(70, 150), col: pal[0], col2: pal[1], spin: r.range(0, 6.28), seed: r.int(1, 1e6) };
  }

  _buildGlows() {
    const mk = (rgb) => {
      const c = makeCanvas(96, 96), x = c._ctx;
      const rg = x.createRadialGradient(48, 48, 0, 48, 48, 48);
      rg.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.9)`);
      rg.addColorStop(0.25, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.35)`);
      rg.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
      x.fillStyle = rg; x.fillRect(0, 0, 96, 96);
      return c;
    };
    return { warm: mk([255, 186, 104]), cyan: mk([90, 228, 255]), rose: mk([255, 118, 168]), cream: mk([255, 240, 214]), ember: mk([255, 120, 70]) };
  }

  /* --------------------------------------------------------- the drawing */

  /** Advance one drawing (1/12 s) and re-draw every living mark by hand. */
  drawNext() {
    const t0 = performance.now();
    const r = this.rng;
    this.time += DRAWING_DT;
    this.drawings++;
    // three-drawing boil: never the same drawing twice in a row
    this.boilIndex = (this.boilIndex + 1 + (r.chance(0.5) ? 1 : 0)) % 3;
    if (this.drawings % 2 === 0) this.shaftIndex = (this.shaftIndex + 1 + (r.chance(0.5) ? 1 : 0)) % 3;

    this._simulate(DRAWING_DT);

    const S = this.studio;
    const prevPhysics = S.physics, prevLoad = S.loadEnabled;
    S.physics = false; S.loadEnabled = false; S.coarse = true;
    S.setTarget(this.lctx);
    this.lctx.setTransform(1, 0, 0, 1, 0, 0);
    this.lctx.clearRect(0, 0, this.W, this.H);

    this._drawMeadowWind();
    this._drawRiver();
    this._drawBlooms();
    this._drawPods();
    this._drawDandelions();
    this._drawGrass();
    this._drawMotes();

    S.flush();
    S.physics = prevPhysics; S.loadEnabled = prevLoad; S.coarse = false;

    // adapt detail so the 12fps cadence holds on slower machines
    this.lastCost = performance.now() - t0;
    if (this.lastCost > 55 && this.lod > 0.35) this.lod -= 0.08;
    else if (this.lastCost < 28 && this.lod < 1) this.lod += 0.04;
  }

  _wind(x, y, t) {
    const gx = ((t * 240) % (this.W + 900)) - 450;                  // travelling gust
    const gust = 0.55 * Math.exp(-(((x - gx) / 240) ** 2));
    return 0.22 * Math.sin(x * 0.0042 - t * 1.7) + 0.2 * this.pn.noise2(x * 0.003 + y * 0.001, t * 0.45) + gust;
  }

  _simulate(dt) {
    const { g, rng: r } = this;
    const t = this.time;
    // motes: rise, drift on the wind, curl
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      m.life += dt;
      const w = this._wind(m.x, m.y, t);
      const curl = this.pn.noise2(m.x * 0.004, m.y * 0.004 + t * 0.2);
      m.x += (18 + w * 60 + curl * 22) * dt;
      m.y += (-m.buoy - 10 * this.pn.noise2(m.y * 0.004, t * 0.3 + m.ph)) * dt;
      if (m.life > m.max || m.x > this.W + 40 || m.y < -30) this.motes[i] = this._spawnMote(false);
    }
    // river streaks: constant world speed => screen speed scales with perspective
    for (let i = 0; i < this.streaks.length; i++) {
      const s = this.streaks[i];
      const p = this._riverAt(s.s);
      s.s += s.speed * dt * (0.12 + 0.88 * (p.w / 330)) * 2.2;
      if (s.s > 1) this.streaks[i] = this._spawnStreak(0);
    }
    // celebration blooms
    if (t > this.nextBloom) {
      const n = r.chance(0.35) ? r.int(2, 4) : 1;
      for (let i = 0; i < n; i++) { const b = this._spawnBloom(); b.k = -i * r.int(2, 5); this.blooms.push(b); }
      this.nextBloom = t + r.range(2.4, 5.8);
    }
    for (const b of this.blooms) b.k++;
    this.blooms = this.blooms.filter((b) => b.k <= b.n);
    // pods: impatience builds until they can't hold it
    for (const p of this.pods) {
      if (p.hop >= 0) {
        p.hop++;
        if (p.hop === 4) for (let k = 0; k < 18; k++) {
          const m = this._spawnMote(false);
          m.x = p.x + r.gauss(0, p.rx * 0.5); m.y = p.y - p.ry * 0.8 + r.gauss(0, 6);
          m.buoy = r.range(18, 46); m.max = r.range(3, 8); m.col = r.pick([P.honeyHalo, P.candleCream, P.peach]);
          this.motes[(r.next() * this.motes.length) | 0] = m;
        }
        if (p.hop > 8) { p.hop = -1; p.energy = 0; }
      } else {
        p.energy += p.rate * dt * r.range(0.6, 1.6);
        if (p.energy > 1) p.hop = 0;
      }
    }
    // dandelion clocks let go of seeds, then quietly regrow (it's that kind of world)
    for (const d of this.dandelions) {
      if (d.seeds > 4 && r.chance(0.05 + Math.max(0, this._wind(d.x, d.y, t)) * 0.15)) {
        d.seeds--;
        const m = this._spawnMote(false);
        m.kind = 'seed'; m.col = P.pearl; m.size = r.range(2, 3.4);
        m.x = d.x + d.lean * d.h + r.gauss(0, 8); m.y = d.y - d.h + r.gauss(0, 8);
        this.motes[(r.next() * this.motes.length) | 0] = m;
      }
      d.regrow += dt;
      if (d.regrow > 1.5 && d.seeds < 26) { d.seeds++; d.regrow = 0; }
    }
  }

  _riverAt(s) {
    const R = this.g.river;
    const f = clamp(s) * (R.length - 1), i = Math.floor(f), k = f - i;
    const a = R[i], b = R[Math.min(R.length - 1, i + 1)];
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, nx: a.nx, ny: a.ny };
  }

  /* wind combing the meadows — a travelling band of lighter strokes */
  _drawMeadowWind() {
    const { g, rng: r } = this, { chalk } = this.tools;
    const t = this.time;
    const gx = ((t * 240) % (this.W + 900)) - 450;
    const n = Math.round(46 * this.lod);
    for (let i = 0; i < n; i++) {
      const x = gx + r.gauss(0, 150);
      if (x < 0 || x > this.W) continue;
      const top = g.ridgeNear(x) + 6, bot = Math.min(g.fg(x), top + 260);
      if (bot <= top) continue;
      const y = r.range(top, bot);
      if (g.riverRegion.inside(x, y)) continue;
      const len = 14 + (y - g.horizon) * 0.1;
      const c = vary(r.pick([P.sageGlow, P.hollyhockRose, P.lavenderHaze, P.goldenAmber]), r, 0.06);
      chalk.stroke([{ x: x - len * 0.3, y: y + len * 0.2 }, { x: x + len * 0.7, y: y - len * 0.25 }], { color: c, size: 3 + (y - g.horizon) * 0.02, alpha: 0.32, pressure: 0.6, crumble: 0 });
    }
  }

  /* streaks racing home + shimmer on the water */
  _drawRiver() {
    const { rng: r } = this, { chalk, conte } = this.tools;
    for (const s of this.streaks) {
      const pts = [];
      for (let k = 0; k <= 4; k++) {
        const p = this._riverAt(s.s - s.len * (k / 4) * (0.4 + this._riverAt(s.s).w / 330));
        pts.push({ x: p.x + p.nx * s.lane * p.w, y: p.y + p.ny * s.lane * p.w });
      }
      const head = this._riverAt(s.s);
      chalk.stroke(pts.reverse(), { color: s.col, size: 1.6 + head.w * 0.03, alpha: 0.85, pressure: 0.9, crumble: 0, attack: 0.5, release: 0.08 });
    }
    const R = this.g.river, sun = this.g.sun;
    const n = Math.round(80 * this.lod);
    for (let i = 0; i < n; i++) {
      const p = R[(Math.pow(r.next(), 0.8) * R.length) | 0];
      const col = Math.exp(-(((p.x - sun.x) / 140) ** 2));
      if (!r.chance(0.35 + col * 0.65)) continue;
      const off = r.range(-0.4, 0.4) * p.w;
      const x = p.x + p.nx * off, y = p.y + p.ny * off;
      const len = 2 + p.w * r.range(0.02, 0.09);
      conte.stroke([{ x: x - len, y }, { x: x + len, y }], { color: r.chance(0.75) ? P.candleCream : P.electricCyan, size: 1.4 + p.w * 0.008, alpha: 0.7, pressure: 0.85, hold: 0.0, bow: 0.005 });
    }
  }

  /* chalk-burst blooms of celebration */
  _drawBlooms() {
    const { chalk } = this.tools;
    for (const b of this.blooms) {
      if (b.k < 0) continue;
      const u = b.k / b.n;
      const rr = new RNG(b.seed + b.k * 17);              // each drawing re-drawn by hand
      const radius = b.R * (1 - Math.pow(1 - u, 3));
      const fade = Math.pow(1 - u, 1.1);
      for (let i = 0; i < b.rays; i++) {
        const a = b.spin + (i / b.rays) * 6.283 + rr.gauss(0, 0.05);
        const r0 = radius * (0.5 + 0.25 * u), r1 = radius * rr.range(0.9, 1.08);
        const droop = u * u * 36;
        const p0 = { x: b.x + Math.cos(a) * r0, y: b.y + Math.sin(a) * r0 + droop * 0.4 };
        const p1 = { x: b.x + Math.cos(a) * r1, y: b.y + Math.sin(a) * r1 + droop };
        chalk.stroke([p0, p1], { color: i % 3 ? b.col : b.col2, size: 3.2 + 2 * (1 - u), alpha: 0.8 * fade + 0.1, pressure: 0.85, crumble: 0.25 * u, attack: 0.3, release: 0.4 });
        if (u > 0.5 && rr.chance(0.4)) {
          const q = { x: p1.x + rr.gauss(0, 6), y: p1.y + 8 + rr.range(0, 20) * u };
          chalk.stroke([q, { x: q.x + 1, y: q.y + 2 }], { color: b.col2, size: 2.4, alpha: 0.8 * fade, pressure: 0.9, crumble: 0 });
        }
      }
    }
  }

  /* the seed pods — warm, glowing, unable to wait */
  _drawPods() {
    const { rng: r } = this, { wax, chalk, willow, conte } = this.tools;
    for (const p of this.pods) {
      const amp = 0.6 + p.energy * p.energy * 4.5;
      let sx = 1, sy = 1, lift = 0;
      if (p.hop >= 0) {
        const h = p.hop;
        // squash, stretch, airborne, land, settle
        const table = [[1.18, 0.8, 0], [1.25, 0.72, 0], [0.84, 1.24, 10], [0.9, 1.14, 22], [0.95, 1.06, 26], [0.92, 1.1, 18], [1.12, 0.86, 4], [1.08, 0.92, 0], [1.02, 0.98, 0]];
        [sx, sy, lift] = table[Math.min(h, table.length - 1)];
      }
      const cx = p.x + r.gauss(0, amp), cy = p.y + r.gauss(0, amp * 0.6) - lift + (1 - sy) * p.ry;
      const ca = Math.cos(p.tilt + r.gauss(0, amp * 0.01)), sa = Math.sin(p.tilt + r.gauss(0, amp * 0.01));
      const W2 = (lx, ly) => {
        const X = lx * p.rx * sx * (1 - 0.22 * ly), Y = ly * p.ry * sy;
        return { x: cx + X * ca - Y * sa, y: cy + X * sa + Y * ca };
      };
      const rows = 9;
      for (let j = 0; j < rows; j++) {
        const ly = -0.92 + (j + 0.5) / rows * 1.84;
        const hw = Math.sqrt(Math.max(0, 1 - ly * ly)) * 0.96;
        const tcol = (ly + 1) / 2;                     // 0 top → 1 bottom
        const base = tcol < 0.35 ? mix2(P.candleCream, P.honeyHalo, tcol / 0.35)
          : tcol < 0.7 ? mix2(P.honeyHalo, P.peach, (tcol - 0.35) / 0.35)
          : mix2(P.peach, P.emberCoral, (tcol - 0.7) / 0.3);
        const glowBoost = 0.25 * p.energy;
        const c = vary(mix2(base, P.candleCream, glowBoost), r, 0.04);
        wax.stroke([W2(-hw, ly), W2(0, ly + 0.07), W2(hw, ly)], { color: c, size: p.ry * 0.46, alpha: 0.92, pressure: 0.95, sheen: false, wobble: 0.6, spacing: p.ry * 0.11 });
      }
      chalk.stroke([W2(-0.45, -0.55), W2(-0.15, -0.72)], { color: P.candleCream, size: p.rx * 0.22, alpha: 0.85, pressure: 0.9, crumble: 0 });
      const seam = [W2(0.18, -0.98), W2(0.32, -0.3), W2(0.3, 0.4), W2(0.12, 0.98)];
      conte.stroke(seam, { color: P.sanguine, size: 2, alpha: 0.7, pressure: 0.8 });
      const out = [];
      for (let k = 0; k <= 18; k++) { const a = (k / 18) * 6.283; out.push(W2(Math.cos(a), Math.sin(a))); }
      willow.stroke(out, { color: mix2(P.sepia, P.vineBlack, 0.5), size: 2, alpha: 0.65, pressure: 0.8, dust: 0 });
    }
  }

  _drawDandelions() {
    const { rng: r } = this, { willow, conte, chalk } = this.tools;
    const t = this.time;
    for (const d of this.dandelions) {
      const w = this._wind(d.x, d.y - d.h, t);
      const bend = d.lean + w * 0.35;
      const pts = [];
      for (let k = 0; k <= 4; k++) {
        const f = k / 4, a = -Math.PI / 2 + bend * Math.pow(f, 1.6);
        const prev = pts[k - 1] || { x: d.x, y: d.y };
        pts.push(k ? { x: prev.x + Math.cos(a) * d.h / 4, y: prev.y + Math.sin(a) * d.h / 4 } : { x: d.x, y: d.y });
      }
      willow.stroke(pts, { color: mix2(P.mossNight, P.sageGlow, 0.55), size: 3, alpha: 0.95, pressure: 0.95, spacing: 3.5, dust: 0 });
      willow.stroke(pts.slice(1), { color: P.hollyhockRose, size: 1.6, alpha: 0.6, pressure: 0.8, spacing: 3, dust: 0 });
      const head = pts[pts.length - 1];
      chalk.stroke([{ x: head.x - 2, y: head.y }, { x: head.x + 2, y: head.y + 1 }], { color: P.goldenAmber, size: 8, alpha: 0.9, pressure: 1, crumble: 0 });
      for (let k = 0; k < d.seeds; k++) {
        const a = (k / 26) * 6.283 + r.gauss(0, 0.06) + w * 0.4;
        const rr = d.r * r.range(0.85, 1.05);
        const q = { x: head.x + Math.cos(a) * rr, y: head.y + Math.sin(a) * rr };
        willow.stroke([{ x: head.x + Math.cos(a) * 3, y: head.y + Math.sin(a) * 3 }, q], { color: P.pearl, size: 1.3, alpha: 0.7, pressure: 0.85, bow: 0.01, spacing: 2.2, dust: 0 });
        chalk.stroke([q, { x: q.x + 0.6, y: q.y + 0.6 }], { color: k % 4 ? P.pearl : P.candleCream, size: 5.5, alpha: 0.75, pressure: 0.9, crumble: 0 });
      }
    }
  }

  /* tall foreground grass in the warm night wind */
  _drawGrass() {
    const { rng: r } = this, { willow } = this.tools;
    const t = this.time;
    const G = this.g.grass;
    const stride = this.lod > 0.8 ? 1 : this.lod > 0.55 ? 2 : 3;
    for (let i = 0; i < G.length; i += stride) {
      const b = G[i];
      const w = this._wind(b.x, b.y, t);
      const bend = b.lean + w * 0.9;
      const pts = [{ x: b.x, y: b.y }];
      let x = b.x, y = b.y;
      for (let k = 1; k <= 3; k++) {
        const f = k / 3, a = -Math.PI / 2 + bend * Math.pow(f, 1.4) * 1.2;
        x += Math.cos(a) * b.h / 3; y += Math.sin(a) * b.h / 3;
        pts.push({ x, y });
      }
      const right = b.x > 980;
      const dark = b.hue < 0.5 ? P.vineBlack : b.hue < 0.8 ? P.midnightIndigo : P.mossNight;
      willow.stroke(pts, { color: dark, size: b.w, alpha: 0.95, pressure: 0.95, spacing: b.w * 1.5, dust: 0, release: 0.45 });
      const lit = right ? (b.hue < 0.5 ? P.hollyhockRose : P.goldenAmber) : (b.hue < 0.6 ? P.glacierTeal : P.electricCyan);
      willow.stroke(pts.slice(2), { color: lit, size: b.w * 0.6, alpha: 0.75, pressure: 0.85, spacing: b.w * 1.3, dust: 0, attack: 0.4, release: 0.3 });
    }
  }

  _drawMotes() {
    const { chalk } = this.tools;
    for (const m of this.motes) {
      const f = Math.min(1, m.life / 0.6) * Math.min(1, (m.max - m.life) / 1.2);
      if (f <= 0.02) continue;
      chalk.stroke([{ x: m.x, y: m.y }, { x: m.x + 0.8, y: m.y + 0.4 }], { color: m.col, size: m.size * 1.6, alpha: 0.9 * f, pressure: 0.9, crumble: 0 });
    }
  }

  /* ------------------------------------------------------- compositing */

  /**
   * Draw the living state over the base painting. Called every display tick;
   * the drawings hold for two ticks, the atmosphere moves continuously.
   */
  composite(ctx, t, { boils, shafts }) {
    const g = this.g, { sun } = g;
    ctx.save();
    // breathing light shafts, gently swaying around the sun
    const breath = 0.5 + 0.22 * Math.sin(t * 0.8) + 0.08 * Math.sin(t * 2.1 + 1.3);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = clamp(breath, 0, 1);
    ctx.translate(sun.x, sun.y);
    ctx.rotate(0.018 * Math.sin(t * 0.21));
    ctx.translate(-sun.x, -sun.y);
    ctx.drawImage(shafts[this.shaftIndex], 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // the sun's pulse
    const pulse = 0.3 + 0.08 * Math.sin(t * 0.7) + 0.03 * Math.sin(t * 3.1);
    ctx.globalAlpha = pulse;
    const S = 560 + 40 * Math.sin(t * 0.5);
    ctx.drawImage(this.glow.warm, sun.x - S / 2, sun.y - S / 2, S, S);
    ctx.restore();

    // boil + the living layer
    ctx.drawImage(boils[this.boilIndex], 0, 0);
    ctx.drawImage(this.layer, 0, 0);

    // glows
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const s of this.brightStars) {
      const tw = 0.5 + 0.5 * Math.sin(t * (1.3 + s.m * 2) + s.ph);
      ctx.globalAlpha = 0.15 + 0.5 * s.m * tw;
      const z = 8 + s.m * 26;
      ctx.drawImage(s.cool ? this.glow.cyan : this.glow.cream, s.x - z / 2, s.y - z / 2, z, z);
    }
    for (const l of g.lights) {
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 1.7 + l.x);
      const z = l.r * 16;
      ctx.drawImage(l.warm ? this.glow.warm : this.glow.cyan, l.x - z / 2, l.y - z / 2, z, z);
    }
    for (const m of this.motes) {
      const f = Math.min(1, m.life / 0.6) * Math.min(1, (m.max - m.life) / 1.2);
      if (f <= 0.02) continue;
      ctx.globalAlpha = 0.4 * f * (0.75 + 0.25 * Math.sin(t * 6 + m.ph));
      const z = m.size * 9;
      const gl = m.col === P.electricCyan || m.col === P.auroraMint ? this.glow.cyan : m.kind === 'seed' ? this.glow.cream : this.glow.warm;
      ctx.drawImage(gl, m.x - z / 2, m.y - z / 2, z, z);
    }
    for (const p of this.pods) {
      const beat = 0.5 + 0.5 * Math.sin(t * (2.2 + p.energy * 6) + p.x);
      ctx.globalAlpha = 0.32 + 0.3 * beat * (0.4 + p.energy);
      const z = p.ry * 5.2;
      ctx.drawImage(this.glow.warm, p.x - z / 2, p.y - z / 2, z, z);
    }
    for (const d of this.dandelions) {
      const w = this._wind(d.x, d.y - d.h, t), bend = d.lean + w * 0.35;
      let x = d.x, y = d.y;
      for (let k = 1; k <= 4; k++) { const a = -Math.PI / 2 + bend * Math.pow(k / 4, 1.6); x += Math.cos(a) * d.h / 4; y += Math.sin(a) * d.h / 4; }
      ctx.globalAlpha = 0.18 + 0.012 * d.seeds;
      const z = d.r * 4.5;
      ctx.drawImage(this.glow.cream, x - z / 2, y - z / 2, z, z);
    }
    for (const s of this.streaks) {
      const h = this._riverAt(s.s);
      ctx.globalAlpha = 0.55;
      const z = 10 + h.w * 0.14;
      ctx.drawImage(s.col === P.electricCyan ? this.glow.cyan : this.glow.cream, h.x + h.nx * s.lane * h.w - z / 2, h.y + h.ny * s.lane * h.w - z / 2, z, z);
    }
    for (const b of this.blooms) {
      if (b.k < 0) continue;
      const u = b.k / b.n;
      ctx.globalAlpha = Math.max(0, 0.9 - u) * 0.8;
      const z = b.R * (u < 0.2 ? 1.6 : 3.2 * (1 - u * 0.5));
      ctx.drawImage(b.col === P.electricCyan || b.col === P.auroraMint ? this.glow.cyan : b.col === P.hollyhockRose ? this.glow.rose : this.glow.warm, b.x - z / 2, b.y - z / 2, z, z);
    }
    ctx.restore();
  }
}
