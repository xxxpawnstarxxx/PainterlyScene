/**
 * CompositionLayers.js — "Unlocked, at Dusk"
 *
 * A deep, multi-plane landscape built the way a pastellist builds one:
 * back to front, dark to light, broad to fine.
 *
 *   SKY / ATMOSPHERE   a bruised twilight from night-indigo to a golden band,
 *                      a sun cradled inside a colossal stone ring (the world,
 *                      unlocked), an aurora like a held breath of electricity,
 *                      a towering cumulus lit from beneath.
 *   DISTANT            violet ridges in atmospheric perspective, floating
 *                      islands that simply refuse gravity — triumph that
 *                      arrived in a single afternoon — and crystalline spires.
 *   MID-GROUND         meadows of warm night, cypress flames, scattered
 *                      lanterns of light, and a river of liquid gold that
 *                      winds all the way home into the ring.
 *   FOREGROUND         a cozy hollow of moss and giant fern, its fiddlehead
 *                      curled like a held secret; a nest of glowing seed pods
 *                      that can barely wait to burst (they are animated in
 *                      LivingAnimation.js), and a bank of tall dark grass.
 *
 * No figures, no objects — only the feeling.
 */
import { RNG, Perlin, clamp, smoothstep, lerp } from '../engine/Noise.js';
import { P, SKY_RAMP, ramp, mix, mix2, vary } from '../engine/Palette90sOVA.js';
import { Technique, Region, shuffle } from '../engine/DryMediaTools.js';

/* =====================================================================
 *  Geometry — the shared architecture of the world (used by animation)
 * ===================================================================== */
export function createGeometry(W, H, seed = 1990) {
  const pn = new Perlin(seed);
  const rng = new RNG(seed + 3);
  const horizon = Math.round(H * 0.585);
  const sun = { x: Math.round(W * 0.646), y: horizon - 30, r: 50 };
  const ring = { x: sun.x, y: horizon - 70, R: 172, r: 130 };
  const dip = (x, width, depth) => 1 - depth * Math.exp(-(((x - sun.x) / width) ** 2));
  const n01 = (v) => 0.5 + 0.5 * v;

  const ridgeFar = (x) => horizon - 14 - (150 * n01(pn.fbm(x * 0.0021 + 3.1, 0.7, 4)) * (0.55 + 0.75 * (1 - x / W)) + 30) * dip(x, 300, 0.8);
  const ridgeMid = (x) => horizon + 6 - (64 * n01(pn.fbm(x * 0.004 + 9.2, 1.7, 4)) + 16) * dip(x, 230, 0.9);
  const ridgeNear = (x) => horizon + 50 - (52 * n01(pn.fbm(x * 0.0052 + 21.4, 4.1, 3)) + 12) * dip(x, 190, 0.95);
  const leftMound = (x) => 968 - 238 * Math.exp(-(((x - 200) / 310) ** 2)) + 16 * pn.fbm(x * 0.01, 7.7, 3);
  const rightBank = (x) => 1004 - 204 * smoothstep(1120, 1780, x) + 14 * pn.fbm(x * 0.012, 3.3, 3);
  const fg = (x) => Math.min(leftMound(x), rightBank(x));

  /* the river of light: centreline, perspective width, banks */
  const riverCtrl = [
    { x: 610, y: H + 40 }, { x: 690, y: 1022 }, { x: 860, y: 962 }, { x: 965, y: 905 },
    { x: 905, y: 850 }, { x: 935, y: 800 }, { x: 1065, y: 757 }, { x: 1150, y: 714 },
    { x: 1206, y: 678 }, { x: sun.x, y: horizon + 12 },
  ];
  const river = sampleSpline(riverCtrl, 4).map((p) => ({ ...p, w: Math.max(4, 0.8 * (p.y - horizon + 4)) }));
  let acc = 0;
  river.forEach((p, i) => { if (i) acc += Math.hypot(p.x - river[i - 1].x, p.y - river[i - 1].y); p.s = acc; });
  river.forEach((p) => { p.s /= acc; });
  river.forEach((p, i) => {
    const a = river[Math.max(0, i - 1)], b = river[Math.min(river.length - 1, i + 1)];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    p.nx = -Math.sin(ang); p.ny = Math.cos(ang); p.ang = ang;
  });
  const bankL = river.map((p) => ({ x: p.x + p.nx * p.w * 0.5, y: p.y + p.ny * p.w * 0.5 }));
  const bankR = river.map((p) => ({ x: p.x - p.nx * p.w * 0.5, y: p.y - p.ny * p.w * 0.5 }));
  const riverPoly = [...bankL, ...bankR.slice().reverse()];
  const riverRegion = Region.poly(riverPoly);

  /* floating islands */
  const islands = [
    { x: 455, y: 262, w: 290, d: 200, lit: 1 },
    { x: 830, y: 150, w: 130, d: 92, lit: 1 },
    { x: 1575, y: 292, w: 210, d: 140, lit: -1 },
    { x: 1012, y: 338, w: 84, d: 58, lit: 1 },
    { x: 1430, y: 138, w: 92, d: 62, lit: -1 },
    { x: 650, y: 420, w: 44, d: 30, lit: 1 },
    { x: 1750, y: 170, w: 50, d: 34, lit: -1 },
  ].map((isl, k) => {
    const half = isl.w / 2;
    const top = (x) => {
      const u = (x - isl.x) / half;
      return isl.y - isl.w * 0.06 * Math.sqrt(Math.max(0, 1 - u * u)) + 3 * pn.noise2(x * 0.06, k * 7.3);
    };
    const bottom = (x) => {
      const u = Math.abs((x - isl.x - isl.w * 0.06) / half);
      return isl.y + isl.d * Math.pow(Math.max(0, 1 - Math.pow(u, 1.35)), 0.9) * (0.82 + 0.18 * pn.noise2(x * 0.07, k * 3.1 + 40)) + 6 * pn.noise2(x * 0.2, k);
    };
    const region = Region.band(isl.x - half, isl.x + half, top, bottom, isl.y - isl.w * 0.08 - 6, isl.y + isl.d + 8);
    return { ...isl, top, bottom, region };
  });

  /* crystalline spires on the far eastern ridge */
  const spires = [];
  for (let i = 0; i < 9; i++) {
    const x = 1745 + i * 19 + rng.range(-6, 6);
    const base = ridgeFar(x) + 6;
    spires.push({ x, base, h: rng.range(36, 128) * (i % 3 === 1 ? 1.25 : 1), w: rng.range(5, 11), lean: rng.range(-0.06, 0.06) });
  }

  /* cypress flames in the meadows */
  const trees = [];
  [[300, 5], [1455, 6]].forEach(([cx, n], side) => {
    for (let i = 0; i < n; i++) {
      const x = cx + i * rng.range(26, 38) + rng.range(-8, 8);
      trees.push({ x, base: ridgeNear(x) + rng.range(22, 48), h: rng.range(100, 200) * (i % 2 ? 0.8 : 1), w: rng.range(26, 40), litSide: side === 0 ? 1 : -1 });
    }
  });

  /* lanterns of warm light scattered through the meadows */
  const lights = [];
  while (lights.length < 46) {
    const x = rng.range(40, W - 40), y = rng.range(ridgeNear(x) + 8, Math.min(fg(x) - 10, ridgeNear(x) + 220));
    if (riverRegion.inside(x, y)) continue;
    lights.push({ x, y, r: rng.range(1.5, 3.6) * (0.6 + (y - horizon) / 300), warm: rng.chance(0.8) });
  }

  /* stars, mostly at the zenith */
  const stars = [];
  while (stars.length < 230) {
    const x = rng.range(0, W), y = Math.pow(rng.next(), 1.7) * horizon * 0.62;
    if (Math.hypot(x - sun.x, y - sun.y) < 420) continue;
    stars.push({ x, y, m: Math.pow(rng.next(), 3), ph: rng.range(0, 6.28), cool: rng.chance(0.55) });
  }

  /* aurora: a held breath of electricity across the upper sky */
  const aurora = sampleSpline([{ x: 560, y: 96 }, { x: 860, y: 50 }, { x: 1180, y: 72 }, { x: 1500, y: 118 }, { x: 1940, y: 84 }], 10);

  /* towering cumulus, lit from beneath by the sun */
  const puffs = [
    [470, 520, 230, 80], [330, 470, 150, 95], [560, 450, 160, 110], [430, 380, 140, 110],
    [300, 360, 110, 90], [560, 330, 120, 95], [440, 270, 120, 92], [330, 250, 92, 70],
    [520, 200, 96, 74], [430, 160, 80, 60], [180, 470, 130, 70], [700, 500, 150, 60],
    [650, 400, 100, 80], [200, 390, 90, 70],
  ].map(([x, y, rx, ry]) => ({ x, y, rx, ry }));

  /* the cozy hollow */
  const nest = { x: 262, y: 938, rx: 230, ry: 110 };
  const pods = [
    { x: 168, y: 924, rx: 30, ry: 42, tilt: -0.25 },
    { x: 246, y: 902, rx: 37, ry: 52, tilt: 0.06 },
    { x: 326, y: 930, rx: 29, ry: 40, tilt: 0.3 },
    { x: 206, y: 978, rx: 27, ry: 34, tilt: -0.4 },
    { x: 292, y: 984, rx: 33, ry: 41, tilt: 0.18 },
    { x: 386, y: 966, rx: 23, ry: 30, tilt: 0.5 },
    { x: 124, y: 982, rx: 22, ry: 28, tilt: -0.6 },
  ];

  /* giant ferns */
  const fronds = [
    makeFrond({ x: 30, y: 1100 }, -1.42, 560, 0.022, 1),
    makeFrond({ x: 150, y: 1100 }, -1.2, 420, 0.03, 2),
    makeFrond({ x: 352, y: 1095 }, -1.82, 380, -0.026, 3),
    makeFrond({ x: -30, y: 990 }, -0.95, 360, 0.03, 4),
    makeFrond({ x: 470, y: 1110 }, -1.18, 290, 0.042, 5),
  ];
  const fiddle = makeFiddlehead({ x: 92, y: 1100 }, { x: 192, y: 604 }, 62);

  /* tall foreground grass + dandelion clocks (animated) */
  const grass = [];
  for (let x = -20; x < W + 20; x += rng.range(5, 11)) {
    const top = Math.max(fg(x) - 10, H * 0.84);
    const n = x > 1150 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const y = rng.range(top, H + 12);
      const inRiver = riverRegion.inside(x, y - 20) && Math.abs(x - 610) < 140;
      if (inRiver && rng.chance(0.85)) continue;
      const nearPods = Math.hypot((x - nest.x) / 1.4, y - nest.y) < 120;
      if (nearPods && rng.chance(0.8)) continue;
      const tall = x > 1150 ? rng.range(70, 210) : rng.range(36, 120);
      grass.push({ x, y, h: tall * (0.6 + 0.6 * (y - H * 0.82) / (H * 0.18)), lean: rng.range(-0.25, 0.15), w: rng.range(2.2, 4.8), hue: rng.next() });
    }
  }
  const dandelions = [1310, 1420, 1505, 1610, 1690, 1790, 1860].map((x, i) => ({
    x: x + rng.range(-20, 20), y: H + 6, h: rng.range(220, 330) * (i % 2 ? 0.85 : 1), r: rng.range(15, 24), lean: rng.range(-0.18, 0.05),
  }));

  return {
    W, H, seed, pn, horizon, sun, ring, ridgeFar, ridgeMid, ridgeNear, leftMound, rightBank, fg,
    river, bankL, bankR, riverRegion, islands, spires, trees, lights, stars, aurora, puffs,
    nest, pods, fronds, fiddle, grass, dandelions,
  };
}

function sampleSpline(ctrl, step = 4) {
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[i - 1] || ctrl[i], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[i + 2] || p2;
    const n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / step));
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push({ ...ctrl[ctrl.length - 1] });
  return out;
}

function makeFrond(root, a0, L, bend, seed) {
  const r = new RNG(seed * 97);
  const n = 44, spine = [];
  let ang = a0, x = root.x, y = root.y;
  for (let i = 0; i <= n; i++) {
    spine.push({ x, y, ang });
    const t = i / n;
    ang += bend * (0.4 + 1.6 * t * t);           // the tip curls harder
    x += Math.cos(ang) * (L / n); y += Math.sin(ang) * (L / n);
  }
  const leaflets = [];
  for (let i = 4; i < n - 1; i++) {
    const t = i / n;
    const len = L * 0.17 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - 0.45 * t) * r.range(0.85, 1.1);
    for (const side of [-1, 1]) {
      const s = spine[i];
      const la = s.ang + side * (1.05 - 0.35 * t) + r.range(-0.08, 0.08);
      const droop = 0.25 * side * Math.sign(bend || 1);
      const mid = { x: s.x + Math.cos(la) * len * 0.5 + Math.cos(s.ang) * len * 0.12, y: s.y + Math.sin(la) * len * 0.5 + Math.sin(s.ang) * len * 0.12 };
      const tip = { x: s.x + Math.cos(la + droop) * len + Math.cos(s.ang) * len * 0.28, y: s.y + Math.sin(la + droop) * len + Math.sin(s.ang) * len * 0.28 };
      leaflets.push({ pts: [{ x: s.x, y: s.y }, mid, tip], t, side, len });
    }
  }
  return { spine, leaflets, bend };
}

function makeFiddlehead(root, top, R) {
  const stem = sampleSpline([root, { x: root.x + 30, y: root.y - 200 }, { x: top.x - 70, y: top.y + 170 }, { x: top.x - R, y: top.y }], 6);
  const spiral = [];
  const c = { x: top.x, y: top.y };
  for (let th = 0; th <= Math.PI * 4.4; th += 0.08) {
    const rr = R * Math.exp(-0.2 * th);
    spiral.push({ x: c.x + rr * Math.cos(Math.PI + th), y: c.y + rr * Math.sin(Math.PI + th), th, rr });
  }
  return { stem, spiral, c, R };
}

/* =====================================================================
 *  Colour fields
 * ===================================================================== */
function colourFields(g) {
  const { W, horizon, sun } = g;
  const skyAt = (x, y) => {
    const t = clamp(y / (horizon + 8));
    let c = ramp(SKY_RAMP, t);
    const d = Math.hypot((x - sun.x) / 1.55, y - sun.y);
    c = mix2(c, P.honeyHalo, Math.exp(-(d * d) / (2 * 250 * 250)) * 0.6);
    c = mix2(c, P.prussianDusk, smoothstep(W * 0.55, 0, x) * (1 - t) * 0.3);
    return c;
  };
  const sunWarmth = (x, y) => Math.exp(-(((x - sun.x) / 1.4) ** 2 + (y - sun.y) ** 2) / (2 * 380 * 380));
  return { skyAt, sunWarmth };
}

/* =====================================================================
 *  The plan — ordered drawing sessions, each a list of hand-made marks
 * ===================================================================== */
export function buildPlan(g, tools, seed = 1990) {
  const { W, H, horizon, sun, ring, pn } = g;
  const { chalk, wax, conte, willow, tortillon } = tools;
  const { skyAt, sunWarmth } = colourFields(g);
  const R = (k) => new RNG(seed * 31 + k * 977);
  const steps = [];
  const add = (label, tool, make, extra = {}) => steps.push({ label, tool, target: 'base', make, ...extra });

  const skyRegion = Region.fn([0, 0, W, horizon + 40], (x, y) => y < horizon + 40);

  /* ---------------------------------------------------------------- 0 */
  steps.push({ label: 'Toning the cold-press sheet in twilight aubergine', tool: null, special: 'paper' });

  /* ------------------------------------------------------------- SKY */
  add('Laying in the twilight with the side of the stick', 'chalk', () => {
    const rng = R(1);
    return Technique.hatch(chalk, skyRegion, {
      rng, angle: -0.045, spacing: 13, length: [170, 360], size: 52, alpha: 0.72, pressure: 0.85, crumble: 0.01, bow: 0.03, depth: 0.3,
      color: (x, y, r) => vary(skyAt(x, y + r.gauss(0, 10)), r, 0.05),
    });
  });
  add('Rubbing the sky down into the tooth', 'tortillon', () => {
    const rng = R(2);
    return [
      ...Technique.hatch(tortillon, skyRegion, { rng, angle: -0.03, spacing: 20, length: [140, 300], size: 34, alpha: 0.55, color: () => 1, bow: 0.02 }),
      ...Technique.hatch(tortillon, skyRegion, { rng, angle: 0.06, spacing: 26, length: [100, 240], size: 22, alpha: 0.45, color: () => 1, bow: 0.02 }),
    ];
  }, { chunk: 14 });
  add('Second pass — bruised magentas, night indigo', 'chalk', () => {
    const rng = R(3);
    return Technique.hatch(chalk, skyRegion, {
      rng, angle: -0.12, spacing: 9, length: [60, 160], size: 20, alpha: 0.5, pressure: 0.7, crumble: 0.05, jitterAngle: 0.1,
      color: (x, y, r) => {
        let c = skyAt(x, y + r.gauss(0, 26));
        if (r.chance(0.12)) c = mix2(c, r.pick([P.hollyhockRose, P.lavenderHaze, P.twilightMagenta, P.periwinkle]), 0.45);
        return vary(c, r, 0.08);
      },
    });
  });
  add('Cross-hatching the zenith with indigo conté', 'conte', () => {
    const rng = R(4);
    const reg = Region.fn([0, 0, W, horizon * 0.62], (x, y) => y < horizon * (0.32 + 0.28 * smoothstep(0, W * 0.5, Math.abs(x - sun.x) + 200)) - 30 * Math.sin(x * 0.004));
    return Technique.crossHatch(conte, reg, {
      rng, angle: -0.55, cross: 1.05, spacing: 7, length: [22, 60], size: 4.5, alpha: 0.42, pressure: 0.75, hold: 0.7,
      density: (x, y) => 0.55 * (1 - y / (horizon * 0.62)) + 0.1,
      color: (x, y, r) => vary(r.chance(0.75) ? mix2(P.midnightIndigo, P.bruisedViolet, r.next() * 0.5) : P.prussianDusk, r, 0.06),
    });
  });

  add('Building the sun inside the ring', 'chalk', () => {
    const rng = R(5), jobs = [];
    const rings = [
      { r: 360, n: 220, size: 26, col: [P.emberCoral, P.hollyhockRose, P.goldenAmber] },
      { r: 230, n: 200, size: 22, col: [P.goldenAmber, P.emberCoral, P.honeyHalo] },
      { r: 140, n: 170, size: 18, col: [P.honeyHalo, P.goldenAmber] },
      { r: 80, n: 120, size: 14, col: [P.candleCream, P.honeyHalo] },
    ];
    for (const rg of rings) {
      jobs.push(...Technique.scumble(chalk, Region.ellipse(sun.x, sun.y, rg.r * 1.4, rg.r), {
        rng, count: rg.n, radius: [8, 26], size: rg.size, alpha: 0.32, pressure: 0.6, crumble: 0.02,
        color: (x, y, r) => vary(mix2(skyAt(x, y), r.pick(rg.col), 0.55), r, 0.05),
      }));
    }
    jobs.push(...Technique.hatch(wax, Region.ellipse(sun.x, sun.y, sun.r, sun.r), {
      rng, angle: 0.05, spacing: 5, length: [30, 90], size: 12, alpha: 0.95, pressure: 1, sheen: false, minFrac: 0.1,
      color: (x, y, r) => vary(mix2(P.candleCream, P.honeyHalo, Math.hypot(x - sun.x, y - sun.y) / sun.r * 0.8), r, 0.02),
    }));
    return jobs;
  });
  add('Burnishing the glow outward', 'tortillon', () => {
    const rng = R(6), jobs = [];
    for (let i = 0; i < 90; i++) {
      const a = rng.range(0, 6.283), r0 = rng.range(30, 120), r1 = r0 + rng.range(80, 260);
      const p0 = { x: sun.x + Math.cos(a) * r0 * 1.3, y: sun.y + Math.sin(a) * r0 };
      const p1 = { x: sun.x + Math.cos(a) * r1 * 1.3, y: sun.y + Math.sin(a) * r1 };
      jobs.push(() => tortillon.smudge([p0, p1], { radius: rng.range(16, 34), strength: 0.45 }));
    }
    return jobs;
  }, { chunk: 10 });

  add('Aurora — a held breath of electricity', 'chalk', () => {
    const rng = R(7), jobs = [];
    const A = g.aurora;
    for (let i = 0; i < A.length; i++) {
      const p = A[i], u = i / (A.length - 1);
      const env = Math.sin(Math.PI * u) ** 0.7;                 // fades at both ends
      const fold = 0.5 + 0.5 * Math.sin(u * 23 + Math.sin(u * 7) * 2);
      if (rng.next() > 0.35 + 0.65 * env) continue;
      const len = (50 + 170 * fold) * env * rng.range(0.7, 1.1) + 20;
      const sway = Math.sin(u * 31) * 14;
      const top = { x: p.x + rng.gauss(0, 3), y: p.y - len * 0.15 };
      const mid = { x: p.x + sway + len * 0.05, y: p.y + len * 0.45 };
      const bot = { x: p.x + sway * 0.4 + len * 0.12, y: p.y + len };
      const c = vary(fold > 0.6 ? P.auroraMint : rng.chance(0.65) ? P.electricCyan : P.glacierTeal, rng, 0.08);
      jobs.push(() => chalk.stroke([top, mid, bot], { color: c, size: rng.range(9, 18), alpha: 0.2 + 0.18 * env, pressure: 0.6, crumble: 0.02, attack: 0.08, release: 0.75, wobble: 2 }));
      if (fold > 0.7 && rng.chance(0.5)) {
        jobs.push(() => chalk.stroke([{ x: top.x, y: top.y - 26 }, { x: top.x + 2, y: top.y + 8 }], { color: vary(P.hollyhockRose, rng, 0.06), size: 10, alpha: 0.18 * env, pressure: 0.5 }));
      }
    }
    // a bright lower hem where the curtain is densest
    jobs.push(...Technique.contour(chalk, A.map((p, i) => ({ x: p.x + Math.sin(i / A.length * 31) * 12, y: p.y + 4 })), {
      rng, passes: 2, size: 7, alpha: 0.35, segment: 18, color: (x, y, r) => vary(r.chance(0.6) ? P.auroraMint : P.pearl, r, 0.05),
    }));
    for (let i = 0; i < A.length; i += 2) {
      const p = A[i];
      jobs.push(() => tortillon.smudge([{ x: p.x, y: p.y + 170 }, { x: p.x + 8, y: p.y - 30 }], { radius: 16, strength: 0.45 }));
    }
    return jobs;
  });

  add('The towering cumulus, lit from beneath', 'chalk', () => {
    const rng = R(8), jobs = [];
    const puffs = g.puffs;
    const inside = (x, y) => puffs.some((p) => ((x - p.x) / p.rx) ** 2 + ((y - p.y) / p.ry) ** 2 < 1);
    const region = Region.fn([40, 90, 880, 610], inside);
    const lightDir = (x, y) => {
      let best = null, bd = Infinity;
      for (const p of puffs) { const d = ((x - p.x) / p.rx) ** 2 + ((y - p.y) / p.ry) ** 2; if (d < bd) { bd = d; best = p; } }
      const nx = (x - best.x) / best.rx, ny = (y - best.y) / best.ry;
      const lx = sun.x - x, ly = sun.y + 80 - y, ll = Math.hypot(lx, ly);
      return { lit: (nx * lx + ny * ly) / ll, edge: Math.sqrt(bd) };
    };
    const cloudCol = (x, y, r) => {
      const { lit, edge } = lightDir(x, y);
      const h = (y - 140) / 460;
      let c = mix(
        [P.lavenderHaze, P.bruisedViolet, P.twilightMagenta, P.periwinkle],
        [0.55 - h * 0.25, 0.7 - h * 0.2, 0.15 + h * 0.6, 0.35 - h * 0.2],
      );
      if (lit < -0.2) c = mix2(c, P.midnightIndigo, smoothstep(-0.2, -0.9, lit) * 0.55);   // core shadow
      if (lit > 0.1) c = mix2(c, lit > 0.5 && edge > 0.65 ? P.honeyHalo : P.hollyhockRose, smoothstep(0.1, 0.9, lit) * (0.45 + 0.5 * edge));
      if (edge > 0.8 && lit > 0.35 && r.chance(0.4)) c = mix2(c, P.goldenAmber, 0.65);
      return vary(c, r, 0.07);
    };
    jobs.push(...Technique.hatch(chalk, region, { rng, angle: -0.35, spacing: 9, length: [30, 80], size: 28, alpha: 0.7, pressure: 0.85, depth: 0.2, crumble: 0.05, color: cloudCol }));
    jobs.push(...Technique.hatch(chalk, region, { rng, angle: 0.5, spacing: 12, length: [20, 60], size: 16, alpha: 0.5, pressure: 0.7, crumble: 0.05, color: cloudCol }));
    jobs.push(...Technique.scumble(chalk, region, { rng, count: 700, radius: [6, 22], size: 13, alpha: 0.45, pressure: 0.7, crumble: 0.08, color: cloudCol }));
    // rim light: soft chalk scumbled along the sun-facing edges of each puff
    for (const p of puffs) {
      const a0 = Math.atan2(sun.y + 80 - p.y, sun.x - p.x);
      for (let a = a0 - 0.7; a <= a0 + 0.7; a += 0.09) {
        const q = { x: p.x + Math.cos(a) * p.rx * 0.9, y: p.y + Math.sin(a) * p.ry * 0.9 };
        if (puffs.some((o) => o !== p && ((q.x - o.x) / o.rx) ** 2 + ((q.y - o.y) / o.ry) ** 2 < 0.85)) continue;
        const c = vary(mix2(rng.chance(0.6) ? P.honeyHalo : P.peach, P.hollyhockRose, rng.next() * 0.5), rng, 0.05);
        const tx = -Math.sin(a) * 14, ty = Math.cos(a) * 14 * (p.ry / p.rx);
        jobs.push(() => chalk.stroke([{ x: q.x - tx, y: q.y - ty }, { x: q.x + tx, y: q.y + ty }], { color: c, size: 12, alpha: 0.4, pressure: 0.65, crumble: 0.05 }));
      }
    }
    return jobs;
  });
  add('Softening the cloud’s belly', 'tortillon', () => {
    const rng = R(9), jobs = [];
    for (const p of g.puffs) for (let k = 0; k < 10; k++) {
      const a = rng.range(0, 6.28);
      const p0 = { x: p.x + Math.cos(a) * p.rx * 0.4, y: p.y + Math.sin(a) * p.ry * 0.4 };
      jobs.push(() => tortillon.smudge([p0, { x: p0.x + rng.range(-40, 40), y: p0.y + rng.range(-30, 20) }], { radius: 18, strength: 0.35 }));
    }
    return jobs;
  }, { chunk: 10 });

  add('Stratus bands and high cirrus', 'chalk', () => {
    const rng = R(10), jobs = [];
    const low = Region.fn([0, horizon - 210, W, horizon - 10], (x, y) => y > horizon - 210 && y < horizon - 10 && Math.hypot(x - sun.x, y - sun.y) > 70);
    jobs.push(...Technique.hatch(chalk, low, {
      rng, angle: -0.015, spacing: 6, length: [120, 380], size: 9, alpha: 0.55, pressure: 0.7, crumble: 0.03, bow: 0.01, minFrac: 0.5,
      density: (x, y) => smoothstep(0.05, 0.45, pn.noise2(x * 0.0016, y * 0.045)),
      color: (x, y, r) => {
        const w = sunWarmth(x, y);
        const c = r.chance(0.5) ? mix2(P.hollyhockRose, P.goldenAmber, w) : mix2(P.lavenderHaze, P.emberCoral, w * 0.8);
        return vary(mix2(c, P.honeyHalo, w * w * 0.6), r, 0.06);
      },
    }));
    const high = Region.fn([0, 60, W, 360], (x, y) => y > 60 && y < 360);
    jobs.push(...Technique.hatch(conte, high, {
      rng, angle: -0.1, spacing: 7, length: [90, 260], size: 3.2, alpha: 0.5, pressure: 0.7, hold: 0.2, minFrac: 0.6,
      density: (x, y) => smoothstep(0.2, 0.6, pn.noise2(x * 0.0022 + 50, y * 0.03)) * (x > 760 ? 1 : 0.3),
      color: (x, y, r) => vary(r.pick([P.lavenderHaze, P.periwinkle, P.hollyhockRose, P.electricCyan]), r, 0.06),
    }));
    return jobs;
  });

  add('Pricking out the first stars', 'conte', () => {
    const rng = R(11);
    return g.stars.map((s) => () => {
      const c = vary(s.cool ? P.pearl : P.candleCream, rng, 0.04);
      const len = 1 + s.m * 4;
      chalk.stroke([{ x: s.x, y: s.y }, { x: s.x + len * 0.4, y: s.y + len * 0.2 }], { color: c, size: 2.2 + s.m * 4, alpha: 0.6 + s.m * 0.4, pressure: 0.9, crumble: 0 });
    });
  });

  /* --------------------------------------------------------- DISTANT */
  add('Far ridges in atmospheric violet', 'chalk', () => {
    const rng = R(12);
    const reg = Region.fn([0, 380, W, horizon + 40], (x, y) => y > g.ridgeFar(x) && y < horizon + 40);
    const col = (x, y, r) => {
      const d = (y - g.ridgeFar(x)) / 120;
      const haze = skyAt(x, horizon - 40);
      let c = mix([P.periwinkle, P.lavenderHaze, P.bruisedViolet, haze], [0.6, 0.4, 0.2 + d * 0.5, 0.9]);
      const w = sunWarmth(x, y);
      if (d < 0.12) c = mix2(c, P.hollyhockRose, 0.5 * (0.4 + w));
      return vary(mix2(c, P.goldenAmber, w * 0.35), r, 0.05);
    };
    return [
      ...Technique.hatch(chalk, reg, { rng, angle: 0.55, spacing: 7, length: [20, 60], size: 14, alpha: 0.6, pressure: 0.75, color: col }),
      ...Technique.hatch(chalk, reg, { rng, angle: -0.7, spacing: 9, length: [20, 50], size: 10, alpha: 0.4, pressure: 0.6, color: col }),
    ];
  });

  add('Breathing atmosphere over the far ridges', 'tortillon', () => {
    const rng = R(43);
    const reg = Region.fn([0, 380, W, horizon + 30], (x, y) => y > g.ridgeFar(x) + 10 && y < horizon + 30);
    return Technique.hatch(tortillon, reg, { rng, angle: 0.02, spacing: 14, length: [80, 200], size: 18, alpha: 0.5, color: () => 1 });
  }, { chunk: 12 });
  add('The ring — stone backlit by the sun', 'conte', () => {
    const rng = R(13), jobs = [];
    const reg = Region.fn([ring.x - ring.R, ring.y - ring.R, ring.x + ring.R, ring.y + ring.R], (x, y) => {
      const d = Math.hypot(x - ring.x, y - ring.y);
      return d > ring.r && d < ring.R;
    });
    const col = (x, y, r) => {
      const d = Math.hypot(x - ring.x, y - ring.y);
      const f = (d - ring.r) / (ring.R - ring.r);
      const up = (ring.y - y) / ring.R;
      let c = mix([P.midnightIndigo, P.bruisedViolet, P.vineBlack], [0.6, 0.35 + up * 0.3, 0.2]);
      if (f < 0.2) c = mix2(c, f < 0.08 ? P.candleCream : P.goldenAmber, 0.8 - f * 2.5);
      else if (f > 0.85 && up > 0.2) c = mix2(c, P.twilightMagenta, 0.4);
      return vary(c, r, 0.06);
    };
    jobs.push(...Technique.hatch(chalk, reg, { rng, angle: 0.8, spacing: 6, length: [16, 40], size: 12, alpha: 0.85, pressure: 0.9, color: col }));
    jobs.push(...Technique.crossHatch(conte, reg, { rng, angle: -0.4, spacing: 5, length: [14, 34], size: 4, alpha: 0.6, pressure: 0.8, color: col }));
    // the glowing inner lip
    const lip = [];
    for (let a = 0; a <= 6.3; a += 0.05) lip.push({ x: ring.x + Math.cos(a) * (ring.r + 3), y: ring.y + Math.sin(a) * (ring.r + 3) });
    jobs.push(...Technique.contour(wax, lip, { rng, passes: 2, size: 6, alpha: 0.8, color: (x, y, r) => vary(r.chance(0.6) ? P.honeyHalo : P.candleCream, r, 0.04), segment: 16 }));
    return jobs;
  });

  add('Mid ridge, deeper violet', 'chalk', () => {
    const rng = R(14);
    const reg = Region.fn([0, 520, W, horizon + 70], (x, y) => y > g.ridgeMid(x) && y < horizon + 70);
    const col = (x, y, r) => {
      const d = (y - g.ridgeMid(x)) / 60;
      const w = sunWarmth(x, y);
      let c = mix([P.bruisedViolet, P.midnightIndigo, skyAt(x, horizon - 70)], [0.7, 0.3 + d * 0.4, 0.45]);
      if (d < 0.14) c = mix2(c, w > 0.4 ? P.goldenAmber : P.hollyhockRose, 0.55 * (0.3 + w));
      return vary(c, r, 0.06);
    };
    return [
      ...Technique.hatch(chalk, reg, { rng, angle: -0.5, spacing: 6, length: [18, 50], size: 13, alpha: 0.75, pressure: 0.8, color: col }),
      ...Technique.hatch(conte, reg, { rng, angle: 0.65, spacing: 6, length: [14, 36], size: 3.5, alpha: 0.45, pressure: 0.7, color: col }),
    ];
  });
  add('Horizon haze', 'tortillon', () => {
    const rng = R(15);
    const reg = Region.fn([0, horizon - 70, W, horizon + 40], (x, y) => y > horizon - 60 && y < horizon + 30);
    return Technique.hatch(tortillon, reg, { rng, angle: 0, spacing: 14, length: [120, 260], size: 18, alpha: 0.35, color: () => 1 });
  }, { chunk: 10 });

  add('Floating islands — gravity, simply declined', 'conte', () => {
    const rng = R(16), jobs = [];
    for (const isl of g.islands) {
      const s = isl.w / 290;
      const col = (x, y, r) => {
        const depth = (y - isl.top(x)) / isl.d;
        const side = ((x - isl.x) / (isl.w / 2)) * isl.lit;      // + = facing the sun
        let c = mix([P.midnightIndigo, P.bruisedViolet, P.sepia, P.periwinkle], [0.4 + depth * 0.7, 0.6, 0.15, 0.25 * (1 - depth)]);
        if (side > 0) c = mix2(c, side > 0.6 && depth < 0.5 ? P.emberCoral : P.twilightMagenta, side * 0.65 * (1 - depth * 0.6));
        if (side < -0.5) c = mix2(c, P.glacierTeal, 0.18);                         // cool sky bounce
        if (depth < 0.1) c = mix2(c, r.chance(0.5) ? P.sageGlow : P.goldenAmber, 0.7);
        return vary(c, r, 0.06);
      };
      jobs.push(...Technique.hatch(chalk, isl.region, { rng, angle: 1.35, spacing: 5 * Math.max(0.6, s), length: [10 * s + 6, 40 * s + 8], size: 10 * Math.max(0.6, s), alpha: 0.85, pressure: 0.85, color: col }));
      jobs.push(...Technique.crossHatch(conte, isl.region, { rng, angle: -0.35, spacing: 4, length: [8, 30 * s + 6], size: 3, alpha: 0.55, pressure: 0.8, color: col }));
      // sun-gilded crown
      const crown = [];
      for (let x = isl.x - isl.w * 0.48; x <= isl.x + isl.w * 0.48; x += 6) crown.push({ x, y: isl.top(x) + 2 });
      jobs.push(...Technique.contour(wax, crown, { rng, passes: 3, drift: 2.2, size: 7 * Math.max(0.7, s), alpha: 0.85, segment: 10, color: (x, y, r) => vary(((x - isl.x) * isl.lit > 0) ? (r.chance(0.5) ? P.honeyHalo : P.goldenAmber) : P.sageGlow, r, 0.05) }));
    }
    return jobs;
  });
  add('Cascades of light falling from the islands', 'chalk', () => {
    const rng = R(17), jobs = [];
    for (const isl of g.islands.slice(0, 4)) {
      const n = Math.round(isl.w / 30);
      for (let k = 0; k < n; k++) {
        const x = isl.x + rng.range(-0.3, 0.3) * isl.w;
        const y = isl.bottom(x) - 4;
        const len = rng.range(80, 220) * (isl.w / 290 + 0.4);
        const c = vary(rng.chance(0.6) ? P.electricCyan : P.candleCream, rng, 0.05);
        jobs.push(() => chalk.stroke([{ x, y }, { x: x + rng.gauss(0, 4), y: y + len }], { color: c, size: rng.range(3, 7), alpha: 0.45, pressure: 0.6, release: 0.8, attack: 0.04, crumble: 0.15 }));
        jobs.push(() => tortillon.smudge([{ x, y: y + 10 }, { x, y: y + len * 1.1 }], { radius: 7, strength: 0.35 }));
      }
    }
    return jobs;
  });
  add('Crystal spires on the eastern ridge', 'conte', () => {
    const rng = R(18), jobs = [];
    for (const s of g.spires) {
      const tip = { x: s.x + s.lean * s.h, y: s.base - s.h };
      const poly = [{ x: s.x - s.w / 2, y: s.base }, { x: s.x + s.w / 2, y: s.base }, tip];
      const reg = Region.poly(poly);
      jobs.push(...Technique.hatch(conte, reg, { rng, angle: -1.5, spacing: 2.5, length: [10, 50], size: 3, alpha: 0.8, pressure: 0.8, minFrac: 0.1,
        color: (x, y, r) => vary(x < s.x + s.lean * (s.base - y) ? mix2(P.midnightIndigo, P.periwinkle, 0.3) : mix2(P.lavenderHaze, P.hollyhockRose, 0.4), r, 0.05) }));
      jobs.push(() => wax.stroke([{ x: tip.x, y: tip.y + 2 }, { x: tip.x - s.lean * 20, y: tip.y + 16 }], { color: P.electricCyan, size: 3, alpha: 0.9, pressure: 1 }));
    }
    return jobs;
  });

  /* ------------------------------------------------------ MID-GROUND */
  const meadowCol = (x, y, r) => {
    const t = clamp((y - horizon) / (H - horizon));
    const crest = clamp(1 - (y - g.ridgeNear(x)) / 26);
    const w = sunWarmth(x, y);
    const nearRiver = Math.exp(-(((x - riverXAt(g, y)) / (60 + t * 260)) ** 2));
    const band = 0.5 + 0.5 * pn.noise2(x * 0.004, y * 0.012);     // swells of the land
    let c = mix([P.mossNight, P.prussianDusk, P.bruisedViolet, P.midnightIndigo, P.glacierTeal], [0.5, 0.35, 0.3 + 0.35 * (1 - t), t * 0.7, 0.18 * band]);
    c = mix2(c, P.twilightMagenta, w * 0.4 + 0.12 * (1 - band) * (1 - t));
    if (band > 0.62) c = mix2(c, P.lavenderHaze, (band - 0.62) * 0.9 * (1 - t));
    if (crest > 0) c = mix2(c, w > 0.35 ? P.goldenAmber : P.hollyhockRose, crest * 0.75);
    if (nearRiver > 0.2) c = mix2(c, P.emberCoral, nearRiver * 0.35 * (1 - t * 0.5));
    if (r.chance(0.09)) c = mix2(c, r.pick([P.sageGlow, P.glacierTeal, P.lavenderHaze]), 0.45);
    return vary(c, r, 0.07);
  };
  add('Near hills and meadows — the underlayer', 'wax', () => {
    const rng = R(19);
    const reg = Region.fn([0, horizon - 20, W, H], (x, y) => y > g.ridgeNear(x));
    return Technique.hatch(chalk, reg, { rng, angle: -0.08, spacing: 11, length: [100, 260], size: 42, alpha: 0.8, pressure: 0.9, depth: 0.3, crumble: 0.01,
      color: (x, y, r) => vary(mix2(meadowCol(x, y, r), P.midnightIndigo, 0.35), r, 0.04) });
  });
  add('Meadows of warm night, contour-hatched', 'chalk', () => {
    const rng = R(20), jobs = [];
    const reg = Region.fn([0, horizon - 20, W, 1000], (x, y) => y > g.ridgeNear(x) && y < g.fg(x) + 30);
    for (const [ang, size, sp] of [[-0.16, 15, 7], [0.13, 11, 6], [-0.42, 7, 6]]) {
      jobs.push(...Technique.hatch(chalk, reg, { rng, angle: ang, spacing: sp, length: [26, 80], size, alpha: 0.6, pressure: 0.75, crumble: 0.02, bow: 0.12, color: meadowCol }));
    }
    jobs.push(...Technique.scumble(chalk, reg, { rng, count: 500, radius: [4, 14], size: 8, alpha: 0.4, pressure: 0.6, color: meadowCol }));
    return jobs;
  });
  add('Rubbing the meadows into one warm dark', 'tortillon', () => {
    const rng = R(40);
    const reg = Region.fn([0, horizon - 20, W, 1000], (x, y) => y > g.ridgeNear(x) + 4 && y < g.fg(x) + 20 && !g.riverRegion.inside(x, y));
    return Technique.hatch(tortillon, reg, { rng, angle: -0.1, spacing: 16, length: [60, 160], size: 16, alpha: 0.45, color: () => 1, bow: 0.1 });
  }, { chunk: 12 });
  add('Re-stating the meadow light', 'chalk', () => {
    const rng = R(41);
    const reg = Region.fn([0, horizon - 20, W, 1000], (x, y) => y > g.ridgeNear(x) && y < g.fg(x) + 30);
    return Technique.hatch(chalk, reg, { rng, angle: -0.22, spacing: 9, length: [18, 50], size: 6, alpha: 0.55, pressure: 0.7, crumble: 0.04, bow: 0.15,
      density: (x, y) => 0.35 + 0.5 * sunWarmth(x, y),
      color: (x, y, r) => { const c = meadowCol(x, y, r); return mix2(c, r.pick([P.hollyhockRose, P.goldenAmber, P.sageGlow, P.lavenderHaze]), 0.35); } });
  });
  add('Cypress flames', 'conte', () => {
    const rng = R(21), jobs = [];
    for (const t of g.trees) {
      const pts = [];
      for (let k = 0; k <= 24; k++) {
        const u = k / 24;
        const prof = Math.sin(Math.PI * Math.pow(u, 0.7)) * (1 - 0.3 * u);
        pts.push({ x: t.x - t.w / 2 * prof + 2 * pn.noise2(k * 0.5, t.x), y: t.base - u * t.h });
      }
      for (let k = 24; k >= 0; k--) {
        const u = k / 24;
        const prof = Math.sin(Math.PI * Math.pow(u, 0.7)) * (1 - 0.3 * u);
        pts.push({ x: t.x + t.w / 2 * prof + 2 * pn.noise2(k * 0.5 + 9, t.x), y: t.base - u * t.h });
      }
      const reg = Region.poly(pts);
      const col = (x, y, r) => {
        const side = ((x - t.x) / (t.w / 2)) * t.litSide;
        let c = mix([P.midnightIndigo, P.mossNight, P.vineBlack], [0.6, 0.5, 0.2]);
        if (side > 0.45) c = mix2(c, r.chance(0.6) ? P.goldenAmber : P.emberCoral, (side - 0.45) * 1.3);
        return vary(c, r, 0.06);
      };
      jobs.push(...Technique.hatch(chalk, reg, { rng, angle: -1.35, spacing: 4, length: [16, 50], size: 9, alpha: 0.9, pressure: 0.9, minFrac: 0.2, color: col }));
      jobs.push(...Technique.hatch(conte, reg, { rng, angle: -1.9, spacing: 4, length: [10, 30], size: 3, alpha: 0.6, pressure: 0.8, minFrac: 0.2, color: col }));
    }
    return jobs;
  });
  add('Lanterns of light in the meadows', 'wax', () => {
    const rng = R(22), jobs = [];
    for (const l of g.lights) {
      const c = l.warm ? (rng.chance(0.5) ? P.honeyHalo : P.candleCream) : P.electricCyan;
      jobs.push(() => chalk.stroke([{ x: l.x - l.r * 3, y: l.y }, { x: l.x + l.r * 3, y: l.y + 1 }], { color: mix2(c, P.emberCoral, 0.4), size: l.r * 6, alpha: 0.25, pressure: 0.6 }));
      jobs.push(() => wax.stroke([{ x: l.x - l.r * 0.5, y: l.y }, { x: l.x + l.r * 0.5, y: l.y + 0.5 }], { color: c, size: l.r * 2.2, alpha: 1, pressure: 1, sheen: false }));
    }
    return jobs;
  });

  add('The river of light, winding home', 'wax', () => {
    const rng = R(23), jobs = [];
    const reg = g.riverRegion;
    const rCol = (x, y, r) => {
      const yr = horizon - (y - horizon) * 1.25;
      let c = skyAt(x + r.gauss(0, 30), clamp(yr, 0, horizon));
      const col = Math.exp(-(((x - sun.x) / (30 + (y - horizon) * 0.5)) ** 2));
      c = mix2(c, P.midnightIndigo, 0.12);
      c = mix2(c, r.chance(0.5) ? P.honeyHalo : P.candleCream, col * 0.8);
      return vary(c, r, 0.05);
    };
    jobs.push(...Technique.hatch(chalk, reg, { rng, angle: -0.02, spacing: 5, length: [20, 110], size: 14, alpha: 0.75, pressure: 0.8, minFrac: 0.15, color: rCol,
      strokeOpts: (x, y) => ({ size: 5 + (y - horizon) * 0.06 }) }));
    jobs.push(...Technique.hatch(wax, reg, { rng, angle: 0.0, spacing: 7, length: [14, 80], size: 8, alpha: 0.7, pressure: 0.8, minFrac: 0.15, color: rCol,
      density: () => 0.6, strokeOpts: (x, y) => ({ size: 3 + (y - horizon) * 0.035 }) }));
    return jobs;
  });
  add('Polishing the water', 'tortillon', () => {
    const rng = R(24);
    return Technique.hatch(tortillon, g.riverRegion, { rng, angle: 0, spacing: 10, length: [40, 140], size: 10, alpha: 0.4, minFrac: 0.2, color: () => 1,
      strokeOpts: (x, y) => ({ radius: 4 + (y - horizon) * 0.04 }) });
  }, { chunk: 10 });
  add('Glints along the current', 'chalk', () => {
    const rng = R(25), jobs = [];
    for (let i = 0; i < 360; i++) {
      const p = g.river[(rng.next() * g.river.length) | 0];
      const off = rng.range(-0.42, 0.42) * p.w;
      const x = p.x + p.nx * off, y = p.y + p.ny * off;
      const len = 3 + p.w * rng.range(0.04, 0.14);
      const c = vary(rng.chance(0.7) ? P.candleCream : P.electricCyan, rng, 0.04);
      jobs.push(() => chalk.stroke([{ x: x - len, y }, { x: x + len, y: y + rng.gauss(0, 0.5) }], { color: c, size: 2 + p.w * 0.012, alpha: 0.75, pressure: 0.8, crumble: 0 }));
    }
    // dark bank lines
    for (const bank of [g.bankL, g.bankR]) {
      jobs.push(...Technique.contour(conte, bank.filter((_, i) => i % 3 === 0), { rng, passes: 1, size: 4, alpha: 0.65, segment: 10, color: (x, y, r) => vary(mix2(P.vineBlack, P.prussianDusk, 0.4), r, 0.05) }));
    }
    return jobs;
  });

  /* ------------------------------------------------------ FOREGROUND */
  const mound = Region.fn([0, 700, 820, H], (x, y) => y > g.leftMound(x) && x < 820);
  const bank = Region.fn([980, 780, W, H], (x, y) => y > g.rightBank(x) && x > 980);
  const fgCol = (x, y, r, side) => {
    const nestGlow = Math.exp(-(((x - g.nest.x) / 300) ** 2 + ((y - g.nest.y) / 170) ** 2));
    const top = side === 'L' ? g.leftMound(x) : g.rightBank(x);
    const crest = clamp(1 - (y - top) / 22);
    let c = mix([P.vineBlack, P.mossNight, P.midnightIndigo, P.bruisedViolet], [0.4, 0.6, 0.4, 0.25]);
    c = mix2(c, P.sepia, nestGlow * 0.4);
    if (nestGlow > 0.15) c = mix2(c, r.chance(0.5) ? P.goldenAmber : P.emberCoral, nestGlow * 0.45);
    if (crest > 0) c = mix2(c, side === 'L' ? P.glacierTeal : P.hollyhockRose, crest * 0.7);
    if (r.chance(0.08)) c = mix2(c, r.pick([P.sageGlow, P.glacierTeal, P.bruisedViolet]), 0.4);
    return vary(c, r, 0.07);
  };
  add('Foreground — the cozy hollow, a bed of night moss', 'wax', () => {
    const rng = R(26), jobs = [];
    for (const [reg, side] of [[mound, 'L'], [bank, 'R']]) {
      jobs.push(...Technique.hatch(wax, reg, { rng, angle: -0.2, spacing: 12, length: [40, 140], size: 22, alpha: 0.85, pressure: 0.9, sheen: false, color: (x, y, r) => fgCol(x, y, r, side) }));
      jobs.push(...Technique.hatch(chalk, reg, { rng, angle: 0.35, spacing: 8, length: [20, 70], size: 12, alpha: 0.55, pressure: 0.7, crumble: 0.1, color: (x, y, r) => fgCol(x, y, r, side) }));
      jobs.push(...Technique.scumble(chalk, reg, { rng, count: 420, radius: [4, 14], size: 9, alpha: 0.5, pressure: 0.7, crumble: 0.1, color: (x, y, r) => fgCol(x, y, r, side) }));
    }
    return jobs;
  });
  add('Warm light pooling around the nest', 'chalk', () => {
    const rng = R(27), jobs = [];
    jobs.push(...Technique.scumble(chalk, Region.ellipse(g.nest.x, g.nest.y + 10, g.nest.rx * 1.25, g.nest.ry * 1.2), {
      rng, count: 380, radius: [5, 18], size: 14, alpha: 0.3, pressure: 0.55, crumble: 0.05,
      color: (x, y, r) => {
        const d = Math.hypot((x - g.nest.x) / g.nest.rx, (y - g.nest.y) / g.nest.ry);
        return vary(mix2(d < 0.6 ? P.honeyHalo : P.peach, P.emberCoral, clamp(d * 0.8)), r, 0.06);
      },
    }));
    for (let i = 0; i < 40; i++) {
      const a = rng.range(0, 6.28);
      const p0 = { x: g.nest.x + Math.cos(a) * 40, y: g.nest.y + Math.sin(a) * 25 };
      jobs.push(() => tortillon.smudge([p0, { x: p0.x + Math.cos(a) * 140, y: p0.y + Math.sin(a) * 70 }], { radius: 16, strength: 0.4 }));
    }
    return jobs;
  });
  add('Giant fern fronds', 'wax', () => {
    const rng = R(28), jobs = [];
    for (const f of g.fronds) {
      for (const lf of f.leaflets) {
        const lit = lf.side * Math.sign(f.bend) > 0;
        const c = vary(mix([P.mossNight, P.sageGlow, P.glacierTeal, P.periwinkle], [0.45, 0.4 + lf.t * 0.3, 0.3, 0.12]), rng, 0.09);
        jobs.push(() => wax.stroke(lf.pts, { color: c, size: 5 + lf.len * 0.11, alpha: 0.92, pressure: 0.95, sheenColor: lit ? P.honeyHalo : P.electricCyan }));
      }
      jobs.push(() => conte.stroke(f.spine, { color: mix2(P.vineBlack, P.mossNight, 0.4), size: 4, alpha: 0.85, pressure: 0.9, wobble: 0.5 }));
    }
    return jobs;
  });
  add('The fiddlehead, curled like a secret', 'wax', () => {
    const rng = R(29), jobs = [];
    const F = g.fiddle;
    const all = [...F.stem, ...F.spiral];
    for (let pass = 0; pass < 3; pass++) {
      const off = pass * 2.2 - 2.2;
      const pts = all.map((p, i) => {
        const a = i ? Math.atan2(p.y - all[i - 1].y, p.x - all[i - 1].x) : -1.4;
        return { x: p.x - Math.sin(a) * off, y: p.y + Math.cos(a) * off };
      });
      const c = vary(pass === 2 ? P.sageGlow : mix2(P.mossNight, P.sageGlow, 0.3), rng, 0.05);
      for (let i = 0; i < pts.length - 1; i += 10) {
        const piece = pts.slice(i, i + 12);
        const tt = i / pts.length;
        jobs.push(() => wax.stroke(piece, { color: c, size: 16 * (1 - tt * 0.55) * (pass === 2 ? 0.5 : 1), alpha: 0.9, pressure: 0.9, sheenColor: P.honeyHalo }));
      }
    }
    // little curled pinnae along the spiral
    for (let i = 4; i < F.spiral.length - 6; i += 3) {
      const p = F.spiral[i];
      const dx = p.x - F.c.x, dy = p.y - F.c.y, d = Math.hypot(dx, dy) || 1;
      const len = 5 + p.rr * 0.28;
      jobs.push(() => conte.stroke([{ x: p.x, y: p.y }, { x: p.x + (dx / d) * len, y: p.y + (dy / d) * len }], { color: vary(P.sageGlow, rng, 0.08), size: 3, alpha: 0.8, pressure: 0.8 }));
    }
    return jobs;
  });
  add('Night flowers scattered on the bank', 'wax', () => {
    const rng = R(42), jobs = [];
    for (let i = 0; i < 160; i++) {
      const x = rng.range(1000, W - 10), y = rng.range(g.rightBank(x) + 10, H - 20);
      const depth = (y - g.rightBank(x)) / 260;
      const c = vary(rng.pick([P.hollyhockRose, P.electricCyan, P.honeyHalo, P.lavenderHaze, P.peach]), rng, 0.06);
      const s = 2.5 + depth * 4;
      jobs.push(() => wax.stroke([{ x: x - s * 0.4, y }, { x: x + s * 0.4, y: y - s * 0.2 }], { color: c, size: s, alpha: 0.95, pressure: 1, sheen: false }));
    }
    jobs.push(...Technique.scumble(chalk, bank, { rng, count: 160, radius: [8, 26], size: 14, alpha: 0.22, pressure: 0.55,
      color: (x, y, r) => vary(r.chance(0.5) ? P.twilightMagenta : P.glacierTeal, r, 0.06) }));
    return jobs;
  });
  add('Dark grass at the lip of the frame', 'conte', () => {
    const rng = R(30), jobs = [];
    const reg = Region.fn([0, H - 80, W, H], (x, y) => y > H - 70 + 20 * Math.sin(x * 0.01));
    jobs.push(...Technique.hatch(conte, reg, { rng, angle: -1.45, spacing: 4, length: [20, 70], size: 4, alpha: 0.8, pressure: 0.9, jitterAngle: 0.2,
      color: (x, y, r) => vary(r.chance(0.85) ? mix2(P.vineBlack, P.midnightIndigo, r.next()) : P.glacierTeal, r, 0.06) }));
    for (let x = 1000; x < W; x += rng.range(5, 12)) {
      const y0 = g.rightBank(x) + rng.range(0, 160), h = rng.range(30, 90);
      const c = vary(rng.chance(0.75) ? mix2(P.mossNight, P.midnightIndigo, 0.5) : P.hollyhockRose, rng, 0.08);
      jobs.push(() => conte.stroke([{ x, y: y0 }, { x: x + rng.range(-14, 6), y: y0 - h }], { color: c, size: 3, alpha: 0.75, pressure: 0.85, release: 0.6 }));
    }
    return jobs;
  });

  /* ------------------------------------------------------ BOIL LINES */
  for (let k = 0; k < 3; k++) {
    steps.push({ label: `Searching the contours — boil drawing ${k + 1} of 3`, tool: 'willow', target: `boil${k}`, noLoad: true, make: () => boilJobs(g, tools, new RNG(seed * 7 + k * 131)) });
  }
  /* --------------------------------------------------- LIGHT SHAFTS */
  for (let k = 0; k < 3; k++) {
    steps.push({ label: `Breathing light shafts — drawing ${k + 1} of 3`, tool: 'chalk', target: `shaft${k}`, noLoad: true, physicsOff: true, make: () => shaftJobs(g, tools, new RNG(seed * 13 + k * 71)) });
  }
  return steps;
}

export function riverXAt(g, y) {
  let best = g.river[0], bd = Infinity;
  for (let i = 0; i < g.river.length; i += 4) { const d = Math.abs(g.river[i].y - y); if (d < bd) { bd = d; best = g.river[i]; } }
  return best.x;
}

/* The re-searched contours. Run three times with different hands. */
function boilJobs(g, tools, rng) {
  const { chalk, wax, conte, willow } = tools;
  const { W, ring } = g;
  const jobs = [];
  const line = (fn, x0, x1, step = 10) => { const p = []; for (let x = x0; x <= x1; x += step) p.push({ x, y: fn(x) }); return p; };

  jobs.push(...Technique.contour(willow, line(g.ridgeFar, 0, W, 12), { rng, passes: 1, size: 1.8, alpha: 0.35, color: P.lavenderHaze, segment: 16 }));
  jobs.push(...Technique.contour(conte, line(g.ridgeMid, 0, W, 10), { rng, passes: 1, size: 2.4, alpha: 0.5, color: (x) => (Math.abs(x - g.sun.x) < 420 ? P.goldenAmber : P.hollyhockRose), segment: 14 }));
  jobs.push(...Technique.contour(conte, line(g.ridgeNear, 0, W, 9), { rng, passes: 2, size: 2.6, alpha: 0.6, color: (x) => (Math.abs(x - g.sun.x) < 380 ? P.honeyHalo : P.hollyhockRose), segment: 14 }));

  const outer = [], inner = [];
  for (let a = 0; a <= 6.35; a += 0.06) {
    outer.push({ x: ring.x + Math.cos(a) * ring.R, y: ring.y + Math.sin(a) * ring.R });
    inner.push({ x: ring.x + Math.cos(a) * (ring.r + 1), y: ring.y + Math.sin(a) * (ring.r + 1) });
  }
  jobs.push(...Technique.contour(willow, outer.filter((p) => p.y < g.ridgeMid(p.x)), { rng, passes: 2, size: 2.4, alpha: 0.7, color: P.vineBlack, segment: 14 }));
  jobs.push(...Technique.contour(wax, inner.filter((p) => p.y < g.ridgeMid(p.x)), { rng, passes: 1, size: 3, alpha: 0.9, color: P.candleCream, segment: 12 }));

  for (const isl of g.islands) {
    const top = line(isl.top, isl.x - isl.w * 0.49, isl.x + isl.w * 0.49, 6);
    const bot = line(isl.bottom, isl.x - isl.w * 0.49, isl.x + isl.w * 0.49, 6);
    jobs.push(...Technique.contour(conte, top, { rng, passes: 1, size: 2.4, alpha: 0.85, color: P.honeyHalo, segment: 10 }));
    jobs.push(...Technique.contour(willow, bot, { rng, passes: 2, size: 2, alpha: 0.6, color: P.vineBlack, segment: 10 }));
  }
  for (const s of g.spires) {
    jobs.push(() => conte.stroke([{ x: s.x + s.w * 0.4, y: s.base }, { x: s.x + s.lean * s.h, y: s.base - s.h }], { color: P.electricCyan, size: 1.6, alpha: 0.75, pressure: 0.8 }));
  }
  for (const t of g.trees) {
    const side = t.litSide;
    const pts = [];
    for (let k = 0; k <= 12; k++) { const u = k / 12; pts.push({ x: t.x + side * t.w / 2 * Math.sin(Math.PI * Math.pow(u, 0.7)) * (1 - 0.3 * u), y: t.base - u * t.h }); }
    jobs.push(...Technique.contour(conte, pts, { rng, passes: 1, size: 2.2, alpha: 0.8, color: P.goldenAmber, segment: 13 }));
  }
  jobs.push(...Technique.contour(conte, line(g.leftMound, 0, 760, 8), { rng, passes: 2, size: 2.6, alpha: 0.65, color: P.electricCyan, segment: 14 }));
  jobs.push(...Technique.contour(conte, line(g.rightBank, 1000, W, 8), { rng, passes: 2, size: 2.6, alpha: 0.65, color: P.hollyhockRose, segment: 14 }));

  for (const f of g.fronds) {
    jobs.push(...Technique.contour(willow, f.spine, { rng, passes: 1, size: 2.4, alpha: 0.75, color: P.vineBlack, segment: 12 }));
    f.leaflets.forEach((lf, i) => {
      if (i % 3) return;
      const lit = lf.side * Math.sign(f.bend) > 0;
      jobs.push(() => conte.stroke(lf.pts, { color: lit ? P.honeyHalo : P.electricCyan, size: 1.6, alpha: 0.7, pressure: 0.7 }));
    });
  }
  const F = g.fiddle;
  jobs.push(...Technique.contour(willow, [...F.stem, ...F.spiral], { rng, passes: 2, size: 2.4, alpha: 0.75, color: P.vineBlack, segment: 14 }));
  jobs.push(...Technique.contour(wax, F.spiral.map((p) => ({ x: p.x + 2, y: p.y - 3 })), { rng, passes: 1, size: 2.5, alpha: 0.85, color: P.honeyHalo, segment: 12 }));

  for (const b of [g.bankL, g.bankR]) {
    jobs.push(...Technique.contour(willow, b.filter((_, i) => i % 4 === 0), { rng, passes: 1, size: 2, alpha: 0.5, color: P.vineBlack, segment: 10 }));
  }
  // star glints: tiny crossed strokes on the brightest
  for (const s of g.stars) {
    if (s.m < 0.45) continue;
    const L = 4 + s.m * 9;
    jobs.push(() => {
      conte.stroke([{ x: s.x - L, y: s.y }, { x: s.x + L, y: s.y }], { color: P.pearl, size: 1.2, alpha: 0.8, pressure: 0.8, bow: 0.01 });
      conte.stroke([{ x: s.x, y: s.y - L }, { x: s.x, y: s.y + L }], { color: P.pearl, size: 1.2, alpha: 0.8, pressure: 0.8, bow: 0.01 });
    });
  }
  void chalk;
  return jobs;
}

/* Rays from the sun through the aperture of the ring, to be breathed. */
function shaftJobs(g, tools, rng) {
  const { chalk, tortillon } = tools;
  const { sun, ring } = g;
  const jobs = [];
  const n = 30;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI + (i / n) * Math.PI * 2 + rng.gauss(0, 0.04);
    const down = Math.sin(a) > 0;
    const len = (down ? rng.range(140, 360) : rng.range(420, 1050)) * (i % 3 === 0 ? 1.2 : 0.8);
    const r0 = ring.r * 0.6;
    const p0 = { x: sun.x + Math.cos(a) * r0, y: sun.y + Math.sin(a) * r0 };
    const p1 = { x: sun.x + Math.cos(a) * (r0 + len), y: sun.y + Math.sin(a) * (r0 + len) };
    const c = vary(rng.pick([P.honeyHalo, P.goldenAmber, P.peach, P.candleCream]), rng, 0.05);
    const size = rng.range(26, 70);
    jobs.push(() => chalk.stroke([p0, p1], { color: c, size, alpha: 0.16, pressure: 0.6, attack: 0.05, release: 0.85, crumble: 0, bow: 0.005, wobble: 2 }));
    jobs.push(() => chalk.stroke([p0, { x: lerp(p0.x, p1.x, 0.6), y: lerp(p0.y, p1.y, 0.6) }], { color: P.candleCream, size: size * 0.3, alpha: 0.12, pressure: 0.6, attack: 0.05, release: 0.9, crumble: 0, bow: 0.005 }));
    jobs.push(() => tortillon.smudge([p0, p1], { radius: Math.min(60, size * 0.6), strength: 0.5 }));
  }
  shuffle(jobs, rng);
  void smoothstep;
  return jobs;
}
