/**
 * GameMain.js — "Drift Home": orchestrator.
 *
 *   loading   → paper is couched, the world is drawn by the artist (or taken
 *               from the sheet cache), lettering and sprites are hand-drawn
 *   menu      → the living painting through a slow hand-held camera, with
 *               the chalk-lettered main menu (How to play, Settings …)
 *   toGame    → the camera pulls back to the full sheet, on twos
 *   play      → DriftScene; Esc pauses on a chalk card
 *   results   → a card for a night won or lost; next night / retry / menu
 *   toMenu    → the camera leans back in
 *
 * Every visual is made by the same dry-media engine as the gallery piece.
 */
import { makeCanvas, clamp } from '../engine/Noise.js';
import { PaperSubstrate } from '../engine/PaperSubstrate.js';
import { Hand, Studio, createToolkit } from '../engine/DryMediaTools.js';
import { OVAGrade } from '../engine/Palette90sOVA.js';
import { createGeometry, buildPlan } from '../scene/CompositionLayers.js';
import { LivingAnimation } from '../scene/LivingAnimation.js';
import { ChalkText } from './ChalkText.js';
import { ChalkSprites } from './ChalkSprites.js';
import { MainMenu, CardPanel, STYLE } from './MenuScene.js';
import { DriftScene } from './DriftScene.js';
import { Sound } from './Sound.js';
import { loadSettings, saveSettings, loadBest, saveBest, cycle, OPTIONS } from './Settings.js';
import { loadSheet, saveSheet, clearSheets } from './SheetCache.js';

const W = 1920, H = 1080, DRAW_DT = 1 / 12;
const SHEET_VERSION = 'v1';
const params = new URLSearchParams(location.search);
const SEED = parseInt(params.get('seed') || '1990', 10) || 1990;
const MENU_CAM = { x: 1180, y: 520, z: 1.3 };
const GAME_CAM = { x: W / 2, y: H / 2, z: 1 };
const GRAIN = { strong: 0.5, soft: 0.25, off: 0 };
const DETAIL = { high: 1, medium: 0.6, low: 0.35 };
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

class Game {
  constructor() {
    this.seed = SEED;
    this.canvas = document.getElementById('game');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.loadingEl = document.getElementById('loading');
    this.loadingText = document.getElementById('loading-text');
    this.loadingBar = document.getElementById('loading-bar');
    this.live = document.getElementById('live');
    this.settings = loadSettings();
    this.best = loadBest();
    this.sound = new Sound();
    this.sound.enabled = this.settings.sound;
    this.state = 'loading';
    this.t = 0;
    this.shake = 0;
    this.cam = { ...MENU_CAM };
    this.uiFx = [];
    this.input = { left: 0, right: 0, up: 0, down: 0, pointer: null, screen: null, pointerDown: false, any: false };
    this._fit();
    window.addEventListener('resize', () => this._fit());
    this._bindInput();
  }

  _fit() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = Math.min(vw / W, vh / H);
    this.canvas.style.width = `${Math.floor(W * s)}px`;
    this.canvas.style.height = `${Math.floor(H * s)}px`;
  }

  announce(text) { if (this.live) this.live.textContent = text; }

  _status(text, frac) {
    if (text) this.loadingText.textContent = text;
    if (frac != null) this.loadingBar.style.transform = `scaleX(${clamp(frac)})`;
  }

  /* ============================================================ loading */

  async load() {
    const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
    this._status('Couching the paper against wool felt…', 0.01);
    await frame();
    const fontsReady = Promise.race([
      Promise.all(["500 60px 'Cormorant Garamond'", "italic 500 60px 'Cormorant Garamond'"].map((f) => document.fonts.load(f))),
      new Promise((r) => setTimeout(r, 3000)),
    ]).catch(() => {});

    Hand.init(SEED);
    this.paper = new PaperSubstrate(W, H, { seed: SEED });
    this.paper.buildToothMasks();
    this.paper.renderPaperCanvas();
    this.paper.renderGrainOverlay();
    this.studio = new Studio(this.paper, { seed: SEED });
    this.tools = createToolkit(this.studio, SEED);
    this.geo = createGeometry(W, H, SEED);
    this.grade = new OVAGrade(W, H, this.geo.sun);
    this.layers = { base: makeCanvas(W, H) };
    for (let k = 0; k < 3; k++) { this.layers[`boil${k}`] = makeCanvas(W, H); this.layers[`shaft${k}`] = makeCanvas(W, H); }
    this.ambient = makeCanvas(W, H);
    this._status('Looking for yesterday’s sheet…', 0.04);
    await frame();

    const key = `sheet-${SHEET_VERSION}-${SEED}`;
    const cached = await loadSheet(key, this.layers);
    if (!cached) {
      await this._drawWorld(frame);
      this._status('Fixing the pastel (saving the sheet for next time)…', 0.92);
      saveSheet(key, this.layers);     // fire and forget
    }

    this._status('Lettering the menu by hand…', 0.94);
    await frame();
    await fontsReady;
    this.text = new ChalkText(this.studio, this.tools, SEED);
    this.sprites = new ChalkSprites(this.studio, this.tools, SEED);
    this.sprites.buildAll();
    await frame();
    this.menu = new MainMenu(this);
    this.menu.warm();
    // every settings label the player could cycle through
    for (const k of Object.keys(OPTIONS)) for (const v of OPTIONS[k].values) {
      const label = `${OPTIONS[k].label} · ${OPTIONS[k].show(v)}`;
      this.text.get(label, STYLE.idle(42)); this.text.get(label, STYLE.hot(42));
    }
    this._status('Letting the highlights bleed…', 0.98);
    await frame();
    this.halation = this.grade.buildHalation(this.layers.base);
    this.anim = new LivingAnimation({ geometry: this.geo, studio: this.studio, tools: this.tools, seed: SEED });
    this._applySettings();
    this.anim.drawNext();
    this.drift = new DriftScene(this);
    this.pausePanel = new CardPanel(this, {
      title: 'Paused', w: 760, lines: ['the wind waits for you'],
      items: [
        { id: 'resume', label: 'Resume', action: () => this.resume() },
        { id: 'restart', label: 'Restart this night', action: () => { this.drift.start(this.drift.night, this.drift.night > 1); this.state = 'play'; } },
        { id: 'menu', label: 'Main menu', action: () => this.toMenu() },
      ],
    });
    this.pausePanel.warm();

    this.state = 'menu';
    this.menu.open('main');
    this.loadingEl.classList.add('done');
    this.canvas.focus();
    this.announce('Drift Home. Main menu. Use the arrow keys and Enter, or the mouse.');
    this._loop();
  }

  async _drawWorld(frame) {
    const plan = buildPlan(this.geo, this.tools, SEED);
    const S = this.studio;
    let t0 = performance.now();
    for (let si = 0; si < plan.length; si++) {
      const step = plan[si];
      this._status(`The artist is drawing: ${step.label.toLowerCase()}`, 0.05 + 0.85 * (si / plan.length));
      const target = this.layers[step.target || 'base'];
      if (step.special === 'paper') { target._ctx.drawImage(this.paper.paperCanvas, 0, 0); continue; }
      S.setTarget(target._ctx);
      S.loadEnabled = !step.noLoad; S.physics = !step.physicsOff;
      const jobs = step.make(), chunk = step.chunk || 40;
      for (let i = 0; i < jobs.length; i++) {
        jobs[i]();
        if ((i + 1) % chunk === 0) {
          S.flush();
          if (performance.now() - t0 > 90) {
            this._paintLoading();
            this._status(null, 0.05 + 0.85 * ((si + i / jobs.length) / plan.length));
            await frame(); t0 = performance.now();
          }
        }
      }
      S.flush();
      S.loadEnabled = true; S.physics = true;
    }
  }

  _paintLoading() {
    const c = this.ctx;
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    c.drawImage(this.layers.base, 0, 0);
    c.globalCompositeOperation = 'overlay'; c.globalAlpha = 0.5;
    c.drawImage(this.paper.grainCanvas, 0, 0);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  }

  /* =========================================================== settings */

  _applySettings() {
    const s = this.settings;
    this.sound.enabled = s.sound;
    if (this.anim) { this.anim.maxLod = DETAIL[s.detail] ?? 1; this.anim.boilEnabled = s.boil; }
  }

  changeSetting(k, dir) {
    this.settings[k] = cycle(k, this.settings[k], dir);
    saveSettings(this.settings);
    this._applySettings();
    this.announce(`${OPTIONS[k].label}: ${OPTIONS[k].show(this.settings[k])}`);
  }

  async redrawSheet() {
    this.announce('Clearing the sheet. The artist will draw it again.');
    await clearSheets();
    location.reload();
  }

  toGallery() { location.href = 'index.html'; }

  /* ========================================================= flow */

  startGame() {
    this.state = 'toGame';
    this.trans = { t: 0, dur: 1.4, from: { ...this.cam }, to: { ...GAME_CAM } };
    this.drift.start(1);
  }

  toMenu() {
    if (this.drift.score > this.best) { this.best = this.drift.score; saveBest(this.best); }
    this.state = 'toMenu';
    this.trans = { t: 0, dur: 1.4, from: { ...this.cam }, to: { ...MENU_CAM } };
    this.menu.open('main');
    this.sound.back();
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    this.pausePanel.menu.sel = 0; this.pausePanel.menu.selAge = 0;
    this.sound.back();
    this.announce('Paused.');
  }

  resume() { if (this.state === 'paused') { this.state = 'play'; this.announce('Resumed.'); } }

  showResults(won) {
    if (this.state !== 'play') return;
    const d = this.drift;
    const best = Math.max(this.best, d.score);
    const isBest = d.score > this.best;
    if (isBest) { this.best = d.score; saveBest(this.best); }
    const lines = won
      ? [`embers gathered · ${d.got} of ${d.need}`, `glow & swiftness bonus · ${(d.lastBonus || 0).toLocaleString('en-US')}`, `score · ${d.score.toLocaleString('en-US')}`, isBest ? '✦ a new best night ✦' : `best · ${best.toLocaleString('en-US')}`]
      : [`embers gathered · ${d.got} of ${d.need}`, `score · ${d.score.toLocaleString('en-US')}`, `best · ${best.toLocaleString('en-US')}`];
    this.resultsPanel = new CardPanel(this, {
      title: won ? `Night ${d.night} — home` : 'The light went out',
      w: 880, lines,
      items: won
        ? [{ id: 'next', label: `On to night ${d.night + 1}`, action: () => { d.start(d.night + 1, true); this.state = 'play'; } },
           { id: 'menu', label: 'Main menu', action: () => this.toMenu() }]
        : [{ id: 'retry', label: 'Try again', action: () => { d.start(1); this.state = 'play'; } },
           { id: 'menu', label: 'Main menu', action: () => this.toMenu() }],
    });
    this.resultsPanel.warm();
    this.state = 'results';
    this.announce(won ? `Night ${d.night} complete. Score ${d.score}.` : `The light went out. Score ${d.score}.`);
  }

  fxScreen(x, y, kind = 'warm', scale = 1) { this.uiFx.push({ x, y, kind, scale, t: 0 }); }

  /* ========================================================== input */

  _toScreen(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }
  _toWorld(p) {
    const c = this.cam;
    return { x: c.x + (p.x - W / 2) / c.z, y: c.y + (p.y - H / 2) / c.z };
  }
  _panel() {
    if (this.state === 'menu') return this.menu;
    if (this.state === 'paused') return this.pausePanel;
    if (this.state === 'results') return this.resultsPanel;
    return null;
  }

  _bindInput() {
    const cv = this.canvas;
    cv.addEventListener('pointermove', (e) => {
      const p = this._toScreen(e);
      this.input.screen = p; this.input.pointer = this._toWorld(p);
      const panel = this._panel();
      if (panel) cv.style.cursor = panel.pointerMove(p.x, p.y) ? 'pointer' : 'default';
      else cv.style.cursor = this.state === 'play' ? 'crosshair' : 'default';
    });
    cv.addEventListener('pointerdown', (e) => {
      cv.focus();
      const p = this._toScreen(e);
      this.input.screen = p; this.input.pointer = this._toWorld(p);
      const panel = this._panel();
      if (panel) { panel.click(p.x, p.y); return; }
      if (this.state === 'play') {
        this.input.pointerDown = true; this.input.any = true;
        cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
      }
    });
    const up = () => { this.input.pointerDown = false; };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    const KEYS = { arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down' };
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (this.state === 'play') {
        if (k === 'escape' || k === 'p') { this.pause(); return; }
        if (KEYS[k]) { this.input[KEYS[k]] = 1; this.input.any = true; }
        if (k === 'enter' || k === ' ') this.input.any = true;
        return;
      }
      if (this.state === 'paused' && (k === 'escape' || k === 'p')) { this.resume(); return; }
      const panel = this._panel();
      if (panel) panel.key(k);
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (KEYS[k]) this.input[KEYS[k]] = 0;
    });
    window.addEventListener('blur', () => {
      this.input.left = this.input.right = this.input.up = this.input.down = 0;
      this.input.pointerDown = false;
      this.pause();
    });
  }

  /* =========================================================== loop */

  _loop() {
    let last = performance.now(), drawAcc = 0, uiAcc = 0, lastAmbient = -1, lastFrame = 0;
    const tick = (now) => {
      requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const frozen = this.state === 'paused';
      if (!frozen) this.t += dt;
      const boilOn = this.settings.boil;

      // one new drawing every 1/12 s
      let drew = false;
      if (!frozen) {
        drawAcc += dt;
        if (drawAcc >= DRAW_DT) {
          drawAcc = Math.min(drawAcc - DRAW_DT, DRAW_DT);
          this.anim.drawNext();
          this.drift.drawNext(boilOn);
          drew = true;
        }
      }
      // the lettering keeps its own 12 fps boil, even while the world is paused
      uiAcc += dt;
      if (uiAcc >= DRAW_DT) {
        uiAcc = Math.min(uiAcc - DRAW_DT, DRAW_DT);
        this.menu.drawNext(boilOn);
        const panel = this._panel();
        if (panel && panel !== this.menu) panel.drawNext(boilOn);
      }

      // camera transitions, stepped on twos like a hand-animated camera move
      if (this.trans) {
        this.trans.t += dt;
        const u = clamp(Math.floor((this.trans.t / this.trans.dur) * 12 * this.trans.dur) / (12 * this.trans.dur));
        const e = ease(u), a = this.trans.from, b = this.trans.to;
        this.cam = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, z: a.z + (b.z - a.z) * e };
        if (this.trans.t >= this.trans.dur) {
          this.cam = { ...b };
          this.state = this.state === 'toGame' ? 'play' : 'menu';
          this.trans = null;
        }
      } else if (this.state === 'menu' && drew) {
        // the hand-held camera: a slow, breathing drift
        const k = Math.floor(this.t * 12) / 12;
        this.cam = { x: MENU_CAM.x + Math.sin(k * 0.13) * 40, y: MENU_CAM.y + Math.sin(k * 0.09 + 1) * 18, z: MENU_CAM.z + Math.sin(k * 0.07) * 0.025 };
      }

      if (this.state === 'play') {
        if (this.input.screen) this.input.pointer = this._toWorld(this.input.screen);
        this.drift.update(dt, this.input);
        this.input.any = false;
      }
      for (const f of this.uiFx) f.t += dt;
      this.uiFx = this.uiFx.filter((f) => f.t < 1);
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);

      // composite: every frame while playing (responsive), otherwise ~30 fps
      const playing = this.state === 'play' || this.state === 'toGame';
      if (!playing && now - lastFrame < 1000 / 30) return;
      lastFrame = now;
      if (now - lastAmbient > 1000 / 30 || drew) { this._composeAmbient(); lastAmbient = now; }
      this._composeDisplay();
    };
    requestAnimationFrame(tick);
  }

  _composeAmbient() {
    const a = this.ambient._ctx, L = this.layers;
    a.globalCompositeOperation = 'source-over'; a.globalAlpha = 1;
    a.drawImage(L.base, 0, 0);
    this.anim.composite(a, this.t, { boils: [L.boil0, L.boil1, L.boil2], shafts: [L.shaft0, L.shaft1, L.shaft2] });
    a.save();
    a.globalCompositeOperation = 'screen'; a.globalAlpha = 0.55;
    a.drawImage(this.halation, 0, 0, W, H);
    const g = GRAIN[this.settings.grain] ?? 0.5;
    if (g > 0) { a.globalCompositeOperation = 'overlay'; a.globalAlpha = g; a.drawImage(this.paper.grainCanvas, 0, 0); }
    a.restore();
  }

  _composeDisplay() {
    const c = this.ctx, cam = this.cam;
    const sh = this.shake > 0 ? this.shake * 18 : 0;
    const sx0 = cam.x - W / (2 * cam.z) + (sh ? (Math.random() - 0.5) * sh : 0);
    const sy0 = cam.y - H / (2 * cam.z) + (sh ? (Math.random() - 0.5) * sh : 0);
    const sw = W / cam.z, shh = H / cam.z;
    const sx = clamp(sx0, 0, W - sw), sy = clamp(sy0, 0, H - shh);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    c.fillStyle = '#120d1c'; c.fillRect(0, 0, W, H);
    c.drawImage(this.ambient, sx, sy, sw, shh, 0, 0, W, H);

    const inGame = ['play', 'paused', 'results', 'toGame', 'toMenu'].includes(this.state);
    if (inGame) {
      c.setTransform(cam.z, 0, 0, cam.z, -sx * cam.z, -sy * cam.z);
      this.drift.render(c, this.t);
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
    this.grade.apply(c, { halation: null, vignette: this.state === 'menu' ? 0.75 : 0.6 });

    // UI layers (screen space, above the grade so the lettering keeps its colour)
    if (this.state === 'menu' || this.state === 'toMenu' || this.state === 'toGame') {
      const u = this.trans ? clamp(this.trans.t / (this.trans.dur * 0.6)) : 1;
      const alpha = this.state === 'toGame' ? 1 - u : this.state === 'toMenu' ? u : 1;
      if (alpha > 0.01) this.menu.render(c, this.t, alpha);
    }
    if (this.state === 'play' || this.state === 'paused' || this.state === 'results') this.drift.hud(c, this.t);
    if (this.state === 'paused' || this.state === 'results') {
      c.fillStyle = 'rgba(14,9,26,0.45)'; c.fillRect(0, 0, W, H);
      (this.state === 'paused' ? this.pausePanel : this.resultsPanel).render(c, this.t, 1);
    }
    for (const f of this.uiFx) {
      const frames = this.sprites.burst[f.kind];
      const k = Math.min(frames.length - 1, Math.floor(f.t * 12));
      const z = frames[k].width * f.scale;
      c.globalCompositeOperation = 'screen';
      c.drawImage(frames[k], f.x - z / 2, f.y - z / 2, z, z);
    }
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  }
}

const game = new Game();
window.__game = game;
game.load().catch((err) => {
  console.error(err);
  game._status('The sheet tore: ' + err.message, 1);
});
