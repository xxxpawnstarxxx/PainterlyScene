/**
 * Noise.js — the shared "hand" of chance.
 * Seeded randomness and smooth noise so every mark is unpredictable
 * yet the painting is reproducible stroke-for-stroke from a seed.
 */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = 1) { this._r = mulberry32(seed); }
  next() { return this._r(); }
  range(a, b) { return a + (b - a) * this._r(); }
  int(a, b) { return Math.floor(a + (b - a + 1) * this._r()); }
  chance(p) { return this._r() < p; }
  pick(arr) { return arr[Math.floor(this._r() * arr.length)]; }
  sign() { return this._r() < 0.5 ? -1 : 1; }
  gauss(mean = 0, sd = 1) {
    const u = 1 - this._r(), v = this._r();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v);
  }
  fork(salt = 0) { return new RNG(((this._r() * 4294967296) ^ (salt * 2654435761)) >>> 0); }
}

/** Classic 2D gradient (Perlin) noise, output roughly in [-1, 1]. */
export class Perlin {
  constructor(seed = 1) {
    const r = new RNG(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r.next() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  static _grad(h, x, y) {
    switch (h & 7) {
      case 0: return x + y; case 1: return -x + y;
      case 2: return x - y; case 3: return -x - y;
      case 4: return x; case 5: return -x;
      case 6: return y; default: return -y;
    }
  }
  noise2(x, y) {
    const P = this.perm;
    const xi = Math.floor(x), yi = Math.floor(y);
    const X = xi & 255, Y = yi & 255;
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const aa = P[P[X] + Y], ab = P[P[X] + Y + 1];
    const ba = P[P[X + 1] + Y], bb = P[P[X + 1] + Y + 1];
    const x1 = Perlin._grad(aa, xf, yf) + u * (Perlin._grad(ba, xf - 1, yf) - Perlin._grad(aa, xf, yf));
    const x2 = Perlin._grad(ab, xf, yf - 1) + u * (Perlin._grad(bb, xf - 1, yf - 1) - Perlin._grad(ab, xf, yf - 1));
    return (x1 + v * (x2 - x1)) * 0.92;
  }
  fbm(x, y, oct = 4, lac = 2.03, gain = 0.5) {
    let s = 0, a = 1, f = 1, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * this.noise2(x * f, y * f);
      n += a; a *= gain; f *= lac;
    }
    return s / n;
  }
}

/**
 * Fast smooth value-noise field (bilinear + smoothstep over a random lattice),
 * values in [0, 1]. Used for paper tooth and sprite grain.
 */
export function valueField(w, h, cell, rng) {
  const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2;
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = rng.next();
  const out = new Float32Array(w * h);
  const ixs = new Int32Array(w), sxs = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const fx = x / cell, ix = fx | 0, t = fx - ix;
    ixs[x] = ix; sxs[x] = t * t * (3 - 2 * t);
  }
  for (let y = 0; y < h; y++) {
    const fy = y / cell, iy = fy | 0, ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
    const r0 = iy * gw, r1 = r0 + gw, row = y * w;
    for (let x = 0; x < w; x++) {
      const ix = ixs[x], sx = sxs[x];
      const a = g[r0 + ix], b = g[r0 + ix + 1], c = g[r1 + ix], d = g[r1 + ix + 1];
      out[row + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
export const TAU = Math.PI * 2;

export function makeCanvas(w, h, readback = false) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  c._ctx = c.getContext('2d', readback ? { willReadFrequently: true } : undefined);
  return c;
}
