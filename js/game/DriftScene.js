/**
 * DriftScene.js — "Drift Home", the playable night.
 *
 * You are a seed of light let out of the glowing nest. The warm night wind
 * of the painting really blows (the same gust field that combs the grass),
 * embers hang over the meadows and the sky, and ink knots wander the air.
 * Gather enough light and the stone ring opens: fly into the sun to get home.
 * Each night asks for more embers, the knots grow bolder and your glow fades
 * faster: impatience is the whole game.
 *
 * Motion is simulated every frame for responsive steering, but every sprite
 * is a hand-drawn chalk drawing that boils on twos, and the spore's trail is
 * pressed into the paper's tooth with Ember Chalk as you fly.
 */
import { RNG, makeCanvas, clamp } from '../engine/Noise.js';
import { P } from '../engine/Palette90sOVA.js';
import { drawText } from './ChalkText.js';
import { STYLE } from './MenuScene.js';

export class DriftScene {
  constructor(game) {
    this.game = game;
    this.g = game.geo;
    this.W = this.g.W; this.H = this.g.H;
    this.trail = makeCanvas(this.W, this.H);
    this.rng = new RNG(game.seed ^ 0xd21f7);
    this.state = 'idle';
    this.score = 0;
    this.night = 1;
    this.boil = 0;
  }

  start(night = 1, keepScore = false) {
    const g = this.g, r = this.rng;
    this.night = night;
    if (!keepScore) this.score = 0;
    this.need = Math.min(22, 7 + night * 3);
    this.got = 0;
    this.glow = 1;
    this.drain = 0.03 + night * 0.007;
    this.time = 0;
    this.stateTime = 0;
    this.state = 'intro';
    this.gateOpen = false;
    this.message = null;
    this.fx = [];
    this.trail._ctx.clearRect(0, 0, this.W, this.H);
    this.player = { x: g.nest.x + 10, y: g.nest.y - 70, vx: 40, vy: -60, inv: 0, hist: [] };

    // embers: spread over sky and meadow, never too close to each other or the nest
    this.embers = [];
    let guard = 0;
    while (this.embers.length < this.need + 4 && guard++ < 4000) {
      const x = r.range(90, this.W - 90), y = r.range(90, this.H - 150);
      if (Math.hypot(x - g.nest.x, y - g.nest.y) < 220) continue;
      if (Math.hypot(x - g.sun.x, y - g.sun.y) < g.ring.R + 30) continue;
      if (this.embers.some((e) => Math.hypot(e.x - x, e.y - y) < 120)) continue;
      this.embers.push({ x, y, ph: r.range(0, 6.28), alive: true });
    }
    // ink knots
    const knots = Math.min(11, 2 + Math.floor(night * 1.6));
    this.knots = [];
    guard = 0;
    while (this.knots.length < knots && guard++ < 2000) {
      const x = r.range(120, this.W - 120), y = r.range(110, this.H - 170);
      if (Math.hypot(x - this.player.x, y - this.player.y) < 480) continue;
      const a = r.range(0, 6.28), sp = r.range(55, 85) + night * 10;
      this.knots.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, sp, rot: r.range(0, 6.28), spin: r.range(-1.2, 1.2), r: r.range(40, 54), ph: r.range(0, 6.28) });
    }
    this.game.announce(`Night ${night}. Gather ${this.need} embers.`);
  }

  /* ----------------------------------------------------------- update */

  update(dt, input) {
    const g = this.g, p = this.player;
    this.time += dt; this.stateTime += dt;
    if (p.inv > 0) p.inv -= dt;
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < 1.0);

    if (this.state === 'intro') {
      p.x += Math.sin(this.time * 2) * 10 * dt; p.y += Math.cos(this.time * 1.6) * 8 * dt;
      if (this.stateTime > 2.2 || (input.any && this.stateTime > 0.6)) this._set('play');
      return;
    }
    if (this.state === 'won') {
      // drawn into the sun
      p.x += (g.sun.x - p.x) * Math.min(1, dt * 3); p.y += (g.sun.y - p.y) * Math.min(1, dt * 3);
      if (this.stateTime > 2.6) this.game.showResults(true);
      return;
    }
    if (this.state === 'lost') {
      p.vy += 30 * dt; p.y += p.vy * dt * 0.3;
      if (this.stateTime > 2.2) this.game.showResults(false);
      return;
    }
    if (this.state !== 'play') return;

    // steering
    let ax = 0, ay = 0;
    if (input.pointerDown && input.pointer) {
      const dx = input.pointer.x - p.x, dy = input.pointer.y - p.y, d = Math.hypot(dx, dy) || 1;
      const k = clamp(d / 140) * 1500;
      ax += (dx / d) * k; ay += (dy / d) * k;
    }
    ax += (input.right - input.left) * 1350;
    ay += (input.down - input.up) * 1350;
    // the painting's wind, and a seed's lift
    const w = this.game.anim._wind(p.x, p.y, this.game.anim.time);
    ax += w * 260 + 20; ay -= 36;
    p.vx += ax * dt; p.vy += ay * dt;
    const drag = Math.exp(-2.4 * dt);
    p.vx *= drag; p.vy *= drag;
    const sp = Math.hypot(p.vx, p.vy), max = 470;
    if (sp > max) { p.vx *= max / sp; p.vy *= max / sp; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.x < 30) { p.x = 30; p.vx = Math.abs(p.vx) * 0.5; }
    if (p.x > this.W - 30) { p.x = this.W - 30; p.vx = -Math.abs(p.vx) * 0.5; }
    if (p.y < 30) { p.y = 30; p.vy = Math.abs(p.vy) * 0.5; }
    if (p.y > this.H - 40) { p.y = this.H - 40; p.vy = -Math.abs(p.vy) * 0.5; }
    p.hist.push({ x: p.x, y: p.y });

    // impatience
    this.glow -= this.drain * dt;
    if (this.glow <= 0) { this.glow = 0; this._set('lost'); this.game.sound.lose(); this.addFx(p.x, p.y, 'ink', 1.2); this.game.announce('The light went out.'); return; }

    // embers
    for (const e of this.embers) {
      if (!e.alive) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) < 40) {
        e.alive = false;
        this.got++;
        this.glow = Math.min(1, this.glow + 0.17);
        this.score += 100 * this.night;
        this.addFx(e.x, e.y, this.got % 3 ? 'warm' : 'rose', 0.7);
        this.game.sound.collect(this.got - 1);
        if (this.got >= this.need && !this.gateOpen) this._openGate();
      }
    }
    // a few more embers drift in if the field runs thin
    if (this.embers.filter((e) => e.alive).length < 3 && this.got < this.need + 6) {
      const r = this.rng;
      this.embers.push({ x: r.range(90, this.W - 90), y: r.range(90, this.H - 160), ph: r.range(0, 6.28), alive: true });
    }

    // ink knots wander, and smudge you
    for (const k of this.knots) {
      const turn = Math.sin(this.time * 0.7 + k.ph) * 0.9 * dt;
      const c = Math.cos(turn), s = Math.sin(turn);
      [k.vx, k.vy] = [k.vx * c - k.vy * s, k.vx * s + k.vy * c];
      // knots drift a little toward the light you carry, more each night
      const dx = p.x - k.x, dy = p.y - k.y, d = Math.hypot(dx, dy) || 1;
      if (d < 520) { k.vx += (dx / d) * (10 + this.night * 6) * dt; k.vy += (dy / d) * (10 + this.night * 6) * dt; }
      const v = Math.hypot(k.vx, k.vy) || 1;
      k.vx *= k.sp / v; k.vy *= k.sp / v;
      k.x += k.vx * dt; k.y += k.vy * dt; k.rot += k.spin * dt;
      if (k.x < 60 || k.x > this.W - 60) { k.vx *= -1; k.x = clamp(k.x, 60, this.W - 60); }
      if (k.y < 60 || k.y > this.H - 120) { k.vy *= -1; k.y = clamp(k.y, 60, this.H - 120); }
      if (p.inv <= 0 && d < k.r * 0.8 + 12) {
        this.glow -= 0.24;
        p.inv = 1.4;
        p.vx = (-dx / d) * 520; p.vy = (-dy / d) * 520;
        this.addFx(p.x, p.y, 'ink', 0.9);
        this.game.sound.hurt();
        this.game.shake = 0.35;
      }
    }

    // home
    if (this.gateOpen && Math.hypot(p.x - g.sun.x, p.y - g.sun.y) < g.ring.r * 0.75) {
      const bonus = Math.round(this.glow * 1000) + Math.max(0, Math.round((60 - this.time) * 20));
      this.score += bonus;
      this.lastBonus = bonus;
      this._set('won');
      this.game.sound.win();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * 6.283;
        this.addFx(g.sun.x + Math.cos(a) * g.ring.R, g.sun.y + Math.sin(a) * g.ring.R, i % 2 ? 'warm' : 'cool', 1.4, i * 0.12);
      }
      this.game.announce(`Home. Night ${this.night} complete.`);
    }
  }

  _set(s) { this.state = s; this.stateTime = 0; }

  _openGate() {
    const g = this.g;
    this.gateOpen = true;
    this.message = { text: 'The ring is open — fly home!', t: 0 };
    this.game.sound.open();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.283;
      this.addFx(g.ring.x + Math.cos(a) * g.ring.r, g.ring.y + Math.sin(a) * g.ring.r, i % 2 ? 'warm' : 'rose', 1, i * 0.08);
    }
    this.game.announce('The ring is open. Fly into the sun.');
  }

  addFx(x, y, kind, scale = 1, delay = 0) { this.fx.push({ x, y, kind, scale, t: -delay }); }

  /* -------------------------------------------------------- drawings */

  /** Once per drawing (12 fps): advance the boil and press the trail into the paper. */
  drawNext(boilOn) {
    if (boilOn) this.boil = (this.boil + 1 + (this.rng.chance(0.5) ? 1 : 0)) % 3;
    const p = this.player;
    if (!p) return;
    const tctx = this.trail._ctx;
    // the trail slowly lifts off the sheet
    tctx.globalCompositeOperation = 'destination-out';
    tctx.globalAlpha = 0.16;
    tctx.fillStyle = '#000';
    tctx.fillRect(0, 0, this.W, this.H);
    tctx.globalCompositeOperation = 'source-over';
    tctx.globalAlpha = 1;
    if (p.hist.length > 1 && this.state === 'play') {
      const S = this.game.studio, { chalk } = this.game.tools;
      const prev = { target: S.target, physics: S.physics, load: S.loadEnabled, coarse: S.coarse };
      S.setTarget(tctx); S.physics = false; S.loadEnabled = false; S.coarse = true;
      const pts = p.hist.filter((_, i) => i % 2 === 0 || i === p.hist.length - 1);
      if (pts.length > 1) {
        const glowCol = this.glow > 0.4 ? P.honeyHalo : P.peach;
        chalk.stroke(pts, { color: glowCol, size: 5 + this.glow * 7, alpha: 0.5, pressure: 0.75, crumble: 0.25, attack: 0.02, release: 0.02 });
        chalk.stroke(pts, { color: P.candleCream, size: 2.5, alpha: 0.5, pressure: 0.8, crumble: 0 });
      }
      S.flush();
      S.physics = prev.physics; S.loadEnabled = prev.load; S.coarse = prev.coarse;
      if (prev.target) S.setTarget(prev.target);
    }
    p.hist = p.hist.length ? [p.hist[p.hist.length - 1]] : [];
    if (this.message) this.message.t += 1 / 12;
  }

  /* ------------------------------------------------------------ render */

  /** World-space layer (drawn under the grade). */
  render(ctx, t) {
    const g = this.g, sp = this.game.sprites, p = this.player, b = this.boil;
    if (!p) return;
    ctx.save();
    // the open ring: a gate of warm light
    if (this.gateOpen) {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.5 + 0.25 * Math.sin(t * 3);
      const z = g.ring.R * 3.4;
      ctx.drawImage(sp.glow.warm, g.ring.x - z / 2, g.ring.y - z / 2, z, z);
      ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 4.4);
      ctx.drawImage(sp.glow.cream, g.sun.x - 120, g.sun.y - 120, 240, 240);
    }
    // trail
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 1;
    ctx.drawImage(this.trail, 0, 0);
    // embers
    for (const e of this.embers) {
      if (!e.alive) continue;
      const bob = Math.sin(t * 2 + e.ph) * 6;
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.45 + 0.2 * Math.sin(t * 5 + e.ph);
      ctx.drawImage(sp.glow.warm, e.x - 50, e.y + bob - 50, 100, 100);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      const s = sp.ember[(b + (e.ph * 10 | 0)) % 3];
      ctx.drawImage(s, e.x - s.width / 2, e.y + bob - s.height / 2);
    }
    // ink knots
    for (const k of this.knots) {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.3;
      ctx.drawImage(sp.glow.violet, k.x - k.r * 1.8, k.y - k.r * 1.8, k.r * 3.6, k.r * 3.6);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      const s = sp.knot[(b + (k.ph * 10 | 0)) % 3];
      const sc = (k.r * 2.2) / s.width;
      ctx.translate(k.x, k.y); ctx.rotate(k.rot); ctx.scale(sc, sc);
      ctx.drawImage(s, -s.width / 2, -s.height / 2);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    // the spore
    const lostFade = this.state === 'lost' ? Math.max(0, 1 - this.stateTime / 1.8) : 1;
    const homeShrink = this.state === 'won' ? Math.max(0.1, 1 - this.stateTime / 1.6) : 1;
    const flick = p.inv > 0 && Math.floor(p.inv * 12) % 2 === 0 ? 0.35 : 1;
    const gl = (0.5 + 0.7 * this.glow) * homeShrink;
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = (0.5 + 0.4 * this.glow) * lostFade;
    const gz = 150 * gl + 40;
    ctx.drawImage(sp.glow.warm, p.x - gz / 2, p.y - gz / 2, gz, gz);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = flick * lostFade;
    const s = sp.spore[b], tilt = clamp(p.vx / 900, -0.4, 0.4);
    const ss = 0.8 + 0.35 * this.glow;
    ctx.translate(p.x, p.y); ctx.rotate(tilt); ctx.scale(ss * homeShrink, ss * homeShrink);
    ctx.drawImage(s, -s.width / 2, -s.height / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // bursts (each is a 12-drawing chalk bloom)
    for (const f of this.fx) {
      if (f.t < 0) continue;
      const frames = sp.burst[f.kind];
      const k = Math.min(frames.length - 1, Math.floor(f.t * 12));
      const z = frames[k].width * f.scale;
      ctx.globalCompositeOperation = f.kind === 'ink' ? 'source-over' : 'screen';
      ctx.globalAlpha = 1;
      ctx.drawImage(frames[k], f.x - z / 2, f.y - z / 2, z, z);
    }
    ctx.restore();
  }

  /** Screen-space HUD (drawn above the grade, in display pixels). */
  hud(ctx, t) {
    if (!this.player) return;
    const T = this.game.text, sp = this.game.sprites, b = this.boil;
    drawText(ctx, T.get(`Night ${this.night}`, STYLE.title(48)), 64, 86, b);
    // glow meter
    const mf = sp.meterFrame[b];
    ctx.drawImage(mf, 52, 104);
    const fill = sp.meterFill[b], fw = Math.max(0, fill.width * this.glow);
    if (fw > 1) ctx.drawImage(fill, 0, 0, fw, fill.height, 52 + 12 + 10, 104 + 12 + 6, fw, fill.height);
    if (this.glow < 0.25 && this.state === 'play') {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.3 + 0.3 * Math.sin(t * 10);
      ctx.drawImage(sp.glow.ember, 40, 70, 420, 110);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    // embers gathered
    const e = sp.ember[b];
    ctx.drawImage(e, 52, 158, 60, 60);
    drawText(ctx, T.get(`${Math.min(this.got, this.need)} / ${this.need}`, STYLE.warm(34)), 118, 200, b);
    // score
    drawText(ctx, T.get(this.score.toLocaleString('en-US'), STYLE.title(48)), this.W - 70, 86, b, 'right');
    drawText(ctx, T.get('Esc · pause', STYLE.body(22)), this.W - 70, 124, b, 'right', 0.75);

    // title cards & messages
    if (this.state === 'intro') {
      const a = Math.min(1, this.stateTime * 2) * Math.min(1, (2.2 - this.stateTime) * 2);
      drawText(ctx, T.get(`Night ${this.night}`, STYLE.title(110)), 960, 470, b, 'center', a);
      drawText(ctx, T.get(`gather ${this.need} embers, then fly into the sun`, { ...STYLE.body(34), italic: true }), 960, 540, b, 'center', a);
    }
    if (this.message && this.message.t < 3) {
      const a = Math.min(1, this.message.t * 3) * Math.min(1, (3 - this.message.t) * 2);
      drawText(ctx, T.get(this.message.text, STYLE.hot(52)), 960, 230, b, 'center', a);
    }
  }
}
