/**
 * MenuScene.js — the title screen, drawn and lettered by hand.
 *
 *   ChalkMenu   a column of chalk-lettered choices. The selected one blooms
 *               into warm honey with a chalk halo, an underline is drawn in
 *               under it stroke by stroke (on twos), and the spore hovers
 *               beside it like a cursor. Mouse, touch and keyboard all work.
 *   CardPanel   a scumbled indigo card with a title, body lines and its own
 *               ChalkMenu — used for How to Play, Settings, Pause, Results.
 *   MainMenu    the title screen: the living painting seen through a slow,
 *               hand-held camera, a smudged dark field, the title lettering,
 *               and the menu.
 */
import { P } from '../engine/Palette90sOVA.js';
import { drawText } from './ChalkText.js';
import { OPTIONS } from './Settings.js';

export const STYLE = {
  idle: (size) => ({ size, colors: [P.pearl, P.lavenderHaze], accent: P.periwinkle }),
  hot: (size) => ({ size, colors: [P.candleCream, P.honeyHalo], accent: P.emberCoral, halo: P.twilightMagenta }),
  off: (size) => ({ size, colors: [P.periwinkle, P.bruisedViolet], accent: P.midnightIndigo }),
  title: (size) => ({ size, colors: [P.candleCream, P.emberCoral], accent: P.hollyhockRose, halo: P.twilightMagenta, weight: 500, italic: true }),
  body: (size) => ({ size, colors: [P.pearl, P.lavenderHaze], mode: 'pressed' }),
  warm: (size) => ({ size, colors: [P.honeyHalo, P.goldenAmber], mode: 'pressed' }),
};

export class ChalkMenu {
  constructor(game, { items, x, y, gap = 86, size = 56, align = 'left' }) {
    this.game = game;
    this.items = items;
    this.x = x; this.y = y; this.gap = gap; this.size = size; this.align = align;
    this.sel = this._firstEnabled(0, 1);
    this.selAge = 0;
    this.boil = 0;
    this.memo = new Map();
  }

  _firstEnabled(from, dir) {
    const n = this.items.length;
    for (let k = 0; k < n; k++) {
      const i = (from + k * dir + n * 4) % n;
      if (!this.items[i].disabled) return i;
    }
    return 0;
  }

  _label(it) { return typeof it.label === 'function' ? it.label() : it.label; }

  _entries(i) {
    const it = this.items[i], label = this._label(it);
    const key = label + (it.disabled ? '#off' : '');
    let e = this.memo.get(key);
    if (!e) {
      const T = this.game.text;
      e = it.disabled
        ? { idle: T.get(label, STYLE.off(this.size)), hot: T.get(label, STYLE.off(this.size)) }
        : { idle: T.get(label, STYLE.idle(this.size)), hot: T.get(label, STYLE.hot(this.size)) };
      this.memo.set(key, e);
    }
    return e;
  }

  /** Pre-draw every label (both states) so nothing is lettered mid-animation. */
  warm() { this.items.forEach((_, i) => this._entries(i)); }

  rect(i) {
    const e = this._entries(i).idle;
    const y = this.y + i * this.gap;
    const x0 = this.align === 'center' ? this.x - e.textW / 2 : this.x;
    return { x0: x0 - 70, y0: y - this.size * 0.85, x1: x0 + e.textW + 24, y1: y + this.size * 0.32 };
  }

  hit(px, py) {
    for (let i = 0; i < this.items.length; i++) {
      const r = this.rect(i);
      if (px >= r.x0 && px <= r.x1 && py >= r.y0 && py <= r.y1) return i;
    }
    return -1;
  }

  select(i, quiet = false) {
    if (i < 0 || i === this.sel || this.items[i].disabled) return;
    this.sel = i; this.selAge = 0;
    if (!quiet) this.game.sound.hover(i);
    this.game.announce(this._label(this.items[i]));
  }

  move(dir) { this.select(this._firstEnabled(this.sel + dir, dir)); }

  activate() {
    const it = this.items[this.sel];
    if (!it || it.disabled) return;
    const r = this.rect(this.sel);
    this.game.fxScreen(r.x0 + 40, (r.y0 + r.y1) / 2, it.adjust ? 'cool' : 'warm', 0.8);
    if (it.adjust) { it.adjust(1); this.game.sound.hover(this.sel + 2); }
    else { this.game.sound.select(); it.action && it.action(); }
  }

  adjust(dir) {
    const it = this.items[this.sel];
    if (it && it.adjust) { it.adjust(dir); this.game.sound.hover(this.sel + (dir > 0 ? 3 : 1)); }
  }

  pointerMove(px, py) { const i = this.hit(px, py); if (i >= 0) this.select(i); return i >= 0; }
  click(px, py) { const i = this.hit(px, py); if (i >= 0) { this.select(i, true); this.activate(); return true; } return false; }

  key(k) {
    if (k === 'arrowdown' || k === 's') this.move(1);
    else if (k === 'arrowup' || k === 'w') this.move(-1);
    else if (k === 'arrowleft' || k === 'a') this.adjust(-1);
    else if (k === 'arrowright' || k === 'd') this.adjust(1);
    else if (k === 'enter' || k === ' ') this.activate();
    else return false;
    return true;
  }

  drawNext(boilOn) {
    if (boilOn) this.boil = (this.boil + 1 + (Math.random() < 0.5 ? 1 : 0)) % 3;
    this.selAge++;
  }

  render(ctx, t, alpha = 1) {
    const sp = this.game.sprites;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i], e = this._entries(i);
      const y = this.y + i * this.gap;
      const hot = i === this.sel;
      const entry = hot ? e.hot : e.idle;
      const nudge = hot ? Math.min(1, this.selAge / 3) * 14 : 0;     // the selected word leans in
      const x = this.x + (this.align === 'left' ? nudge : 0);
      drawText(ctx, entry, x, y, this.boil + i, this.align, alpha * (it.disabled ? 0.6 : 1));
      if (!hot) continue;
      // the underline is drawn in, a few strokes per drawing
      const ul = sp.underline(entry.textW);
      const reveal = Math.min(1, this.selAge / 4);
      const ux = (this.align === 'center' ? x - entry.textW / 2 : x) - 20;
      ctx.globalAlpha = alpha;
      ctx.drawImage(ul.frames[this.boil], 0, 0, ul.w * reveal, ul.h, ux, y + this.size * 0.12, ul.w * reveal, ul.h);
      // the spore cursor, bobbing in the warm air
      const bob = Math.sin(t * 2.6) * 5;
      const cx = (this.align === 'center' ? x - entry.textW / 2 : x) - 52, cy = y - this.size * 0.33 + bob;
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = alpha * (0.55 + 0.15 * Math.sin(t * 5));
      ctx.drawImage(sp.glow.warm, cx - 60, cy - 60, 120, 120);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;
      const s = sp.spore[this.boil];
      ctx.drawImage(s, cx - s.width * 0.45, cy - s.height * 0.45, s.width * 0.9, s.height * 0.9);
      ctx.globalAlpha = 1;
    }
  }
}

export class CardPanel {
  constructor(game, { title, lines = [], items, w = 900, h, cx = 960, cy = 540, itemSize = 46, itemGap = 70, lineSize = 30 }) {
    this.game = game;
    h = h ?? Math.round(190 + lines.length * lineSize * 1.45 + (lines.length ? 50 : 20) + items.length * itemGap + 40);
    this.w = w; this.h = h; this.cx = cx; this.cy = cy;
    this.title = title; this.lines = lines; this.lineSize = lineSize;
    const top = cy - h / 2;
    this.titleY = top + 104;
    this.linesY = top + 170;
    const menuY = top + 170 + lines.length * lineSize * 1.45 + (lines.length ? 50 : 20);
    this.menu = new ChalkMenu(game, { items, x: cx, y: menuY + itemSize * 0.6, gap: itemGap, size: itemSize, align: 'center' });
  }

  warm() {
    const T = this.game.text;
    this.game.sprites.card(this.w, this.h);
    if (this.title) T.get(this.title, STYLE.title(64));
    for (const l of this.lines) T.get(l, STYLE.body(this.lineSize));
    this.menu.warm();
  }

  drawNext(boilOn) { this.menu.drawNext(boilOn); }

  render(ctx, t, alpha = 1) {
    const T = this.game.text, card = this.game.sprites.card(this.w, this.h);
    ctx.globalAlpha = alpha;
    ctx.drawImage(card.frames[this.menu.boil % card.frames.length], this.cx - this.w / 2 - card.m, this.cy - this.h / 2 - card.m);
    ctx.globalAlpha = 1;
    if (this.title) drawText(ctx, T.get(this.title, STYLE.title(64)), this.cx, this.titleY, this.menu.boil, 'center', alpha);
    this.lines.forEach((l, i) => {
      drawText(ctx, T.get(l, typeof l === 'string' && l.startsWith('✦') ? STYLE.warm(this.lineSize) : STYLE.body(this.lineSize)), this.cx, this.linesY + i * this.lineSize * 1.45, this.menu.boil + i, 'center', alpha);
    });
    this.menu.render(ctx, t, alpha);
  }

  key(k) { return this.menu.key(k); }
  pointerMove(x, y) { return this.menu.pointerMove(x, y); }
  click(x, y) { return this.menu.click(x, y); }
}

/* ===================================================================== */

export class MainMenu {
  constructor(game) {
    this.game = game;
    this.screen = 'main';
    this.age = 0;
    const g = game;
    this.main = new ChalkMenu(g, {
      x: 210, y: 560, gap: 92, size: 60,
      items: [
        { id: 'begin', label: 'Begin the drift', action: () => g.startGame() },
        { id: 'howto', label: 'How to play', action: () => this.open('howto') },
        { id: 'settings', label: 'Settings', action: () => this.open('settings') },
        { id: 'gallery', label: 'Visit the gallery', action: () => g.toGallery() },
      ],
    });
    this.howto = new CardPanel(g, {
      title: 'How to drift home', w: 1040, h: 700,
      lines: [
        'You are a seed of light, just let out of the nest.',
        'Steer by holding the mouse or a finger — or use WASD / arrows.',
        'Gather embers. Each one feeds your glow.',
        'Your glow fades while you dawdle, so don’t.',
        'Ink knots smudge your light — slip past them.',
        '✦ Gather enough and the ring opens. Fly into the sun. ✦',
      ],
      items: [{ id: 'back', label: 'Back', action: () => this.open('main') }],
    });
    this.settings = new CardPanel(g, {
      title: 'Settings', w: 900, h: 690, lines: ['← → or click to change'],
      items: [
        ...Object.keys(OPTIONS).map((k) => ({
          id: k,
          label: () => `${OPTIONS[k].label} · ${OPTIONS[k].show(g.settings[k])}`,
          adjust: (dir) => g.changeSetting(k, dir),
        })),
        { id: 'redraw', label: 'Redraw the sheet', action: () => g.redrawSheet() },
        { id: 'back', label: 'Back', action: () => this.open('main') },
      ],
      itemSize: 42, itemGap: 62,
    });
  }

  warm() {
    const T = this.game.text;
    T.get('Drift Home', STYLE.title(150));
    T.get('a night inside “Unlocked, at Dusk”', { ...STYLE.body(32), italic: true });
    T.get('↑ ↓ choose · Enter to go · the mouse works too', { ...STYLE.body(26), colors: [P.pearl, P.lavenderHaze] });
    this.main.warm(); this.howto.warm(); this.settings.warm();
  }

  open(screen) {
    if (screen !== this.screen) this.game.sound[screen === 'main' ? 'back' : 'select']();
    this.screen = screen;
    this.age = 0;
    const panel = this._panel();
    panel.menu ? (panel.menu.selAge = 0) : (panel.selAge = 0);
    this.game.announce(screen === 'main' ? 'Main menu' : screen === 'howto' ? 'How to play' : 'Settings');
  }

  _panel() { return this.screen === 'main' ? this.main : this[this.screen]; }

  drawNext(boilOn) { this.age++; this._panel().drawNext(boilOn); }

  key(k) {
    if (k === 'escape' || k === 'backspace') { if (this.screen !== 'main') { this.open('main'); return true; } return false; }
    return this._panel().key(k);
  }
  pointerMove(x, y) { return this._panel().pointerMove(x, y); }
  click(x, y) { return this._panel().click(x, y); }

  render(ctx, t, alpha = 1) {
    const g = this.game, T = g.text, sp = g.sprites;
    const fade = Math.min(1, this.age / 8) * alpha;
    const boil = this.main.boil;
    // the smudged dark field the words sit on
    ctx.globalAlpha = alpha;
    ctx.drawImage(sp.shade, 0, 0);
    ctx.globalAlpha = 1;

    const titleA = this.screen === 'main' ? alpha : alpha * 0.35;
    // a slow warm breath behind the title
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = titleA * (0.22 + 0.06 * Math.sin(t * 0.9));
    ctx.drawImage(sp.glow.ember, 60, 120, 820, 380);
    ctx.globalCompositeOperation = 'source-over';
    drawText(ctx, T.get('Drift Home', STYLE.title(150)), 150, 330, boil, 'left', titleA);
    drawText(ctx, T.get('a night inside “Unlocked, at Dusk”', { ...STYLE.body(32), italic: true }), 168, 400, boil, 'left', titleA);

    if (this.screen === 'main') {
      this.main.render(ctx, t, fade);
      drawText(ctx, T.get('↑ ↓ choose · Enter to go · the mouse works too', { ...STYLE.body(26), colors: [P.pearl, P.lavenderHaze] }), 170, 1000, boil, 'left', fade * 0.8);
      if (g.best > 0) drawText(ctx, T.get(`best night · ${g.best.toLocaleString('en-US')}`, STYLE.warm(28)), 170, 950, boil, 'left', fade * 0.9);
    } else {
      this._panel().render(ctx, t, fade);
    }
  }
}
