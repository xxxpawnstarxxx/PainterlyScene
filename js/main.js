/**
 * main.js — the studio and the gallery.
 *
 * 1. Tones and textures a sheet of cold-press paper.
 * 2. Draws the whole landscape progressively, mark by mark, in timed slices
 *    so the visitor watches it being made (press F to hurry the artist).
 * 3. Bakes the static halation, then hands the sheet to the animator:
 *    twelve hand-redrawn drawings a second, composited at up to 30fps
 *    with continuous atmosphere and the OVA print grade.
 * 4. Gallery UI: magnifying loupe, curator's notes on the invented tools,
 *    pause / play, and PNG frame export.
 */
import { makeCanvas } from './engine/Noise.js';
import { PaperSubstrate } from './engine/PaperSubstrate.js';
import { Hand, Studio, createToolkit, TOOL_CARDS } from './engine/DryMediaTools.js';
import { OVAGrade } from './engine/Palette90sOVA.js';
import { createGeometry, buildPlan } from './scene/CompositionLayers.js';
import { LivingAnimation } from './scene/LivingAnimation.js';

const W = 1920, H = 1080;
const params = new URLSearchParams(location.search);
const SEED = parseInt(params.get('seed') || '1990', 10) || 1990;

const $ = (s) => document.querySelector(s);
const ui = {
  canvas: $('#sheet'),
  stage: $('#stage'),
  status: $('#status'),
  statusTool: $('#status-tool'),
  bar: $('#progress-bar'),
  play: $('#btn-play'),
  loupeBtn: $('#btn-loupe'),
  notesBtn: $('#btn-notes'),
  exportBtn: $('#btn-export'),
  hurryBtn: $('#btn-hurry'),
  notes: $('#notes'),
  notesClose: $('#notes-close'),
  tools: $('#tool-cards'),
  loupe: $('#loupe'),
  loupeCanvas: $('#loupe canvas'),
  seed: $('#seed'),
};

const state = {
  phase: 'preparing',          // preparing → drawing → living
  playing: true,
  hurry: params.has('fast'),
  loupe: false,
  pointer: null,
  t: 0,
  activeTool: null,
};

const display = ui.canvas;
display.width = W; display.height = H;
const dctx = display.getContext('2d');
ui.seed.textContent = `sheet no. ${SEED}`;

/* -------------------------------------------------------- notes panel */
function buildNotes() {
  ui.tools.innerHTML = TOOL_CARDS.map((c, i) => `
    <article class="tool-card" data-tool="${c.id}">
      <header><span class="tool-no">${['I', 'II', 'III', 'IV', 'V'][i]}</span><h3>${c.name}</h3></header>
      <p class="tool-medium">${c.medium}</p>
      <p class="tool-recipe">${c.recipe}</p>
      <p>${c.behaviour}</p>
    </article>`).join('');
}
function setActiveTool(id) {
  if (state.activeTool === id) return;
  state.activeTool = id;
  ui.tools.querySelectorAll('.tool-card').forEach((el) => el.classList.toggle('active', el.dataset.tool === id));
  const card = TOOL_CARDS.find((c) => c.id === id);
  ui.statusTool.textContent = card ? card.name : '';
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/* --------------------------------------------------------------- build */
async function main() {
  buildNotes();
  setStatus('Couching the paper against wool felt…', 0);
  await nextFrame(); await nextFrame();

  Hand.init(SEED);
  const paper = new PaperSubstrate(W, H, { seed: SEED });
  setStatus('Pressing the tooth…', 0.01); await nextFrame();
  paper.buildToothMasks();
  paper.renderPaperCanvas();
  paper.renderGrainOverlay();
  setStatus('Laying out the sticks…', 0.02); await nextFrame();

  const studio = new Studio(paper, { seed: SEED });
  const tools = createToolkit(studio, SEED);
  const geo = createGeometry(W, H, SEED);
  const plan = buildPlan(geo, tools, SEED);
  const grade = new OVAGrade(W, H, geo.sun);

  const layers = { base: makeCanvas(W, H) };
  for (let k = 0; k < 3; k++) { layers[`boil${k}`] = makeCanvas(W, H); layers[`shaft${k}`] = makeCanvas(W, H); }

  const view = { paper, studio, tools, geo, grade, layers, halation: null, anim: null };
  window.__painting = view;   // for the curious, in the console

  state.phase = 'drawing';
  await runPlan(plan, view);

  setStatus('Letting the highlights bleed (halation)…', 0.99); await nextFrame();
  view.halation = grade.buildHalation(layers.base);
  view.anim = new LivingAnimation({ geometry: geo, studio, tools, seed: SEED });
  view.anim.drawNext();
  state.phase = 'living';
  document.body.classList.add('living');
  setStatus('', 1);
  setActiveTool(null);
  ui.statusTool.textContent = '';
  ui.status.textContent = 'Living pastel on paper — drawn on twos';
  startLoop(view);
}

async function runPlan(plan, view) {
  const { studio, layers, paper } = view;
  const total = plan.length;
  let frameStart = performance.now();
  for (let si = 0; si < total; si++) {
    const step = plan[si];
    setStatus(step.label, si / total);
    setActiveTool(step.tool);
    const target = layers[step.target || 'base'];
    if (step.special === 'paper') {
      target._ctx.drawImage(paper.paperCanvas, 0, 0);
      paintBuild(view); await nextFrame();
      continue;
    }
    studio.setTarget(target._ctx);
    studio.loadEnabled = !step.noLoad;
    studio.physics = !step.physicsOff;
    const jobs = step.make();
    const chunk = step.chunk || 40;
    for (let i = 0; i < jobs.length; i++) {
      jobs[i]();
      if ((i + 1) % chunk === 0) {
        studio.flush();
        const budget = state.hurry ? 250 : 30;
        if (performance.now() - frameStart > budget) {
          ui.bar.style.transform = `scaleX(${(si + i / jobs.length) / total})`;
          paintBuild(view, step.target);
          await nextFrame();
          frameStart = performance.now();
        }
      }
    }
    studio.flush();
    studio.loadEnabled = true; studio.physics = true;
    paintBuild(view, step.target);
    await nextFrame();
    frameStart = performance.now();
  }
}

/** While drawing: show the sheet, plus any overlay drawing in progress. */
function paintBuild(view, target) {
  const { layers, paper } = view;
  dctx.globalCompositeOperation = 'source-over';
  dctx.globalAlpha = 1;
  dctx.drawImage(layers.base, 0, 0);
  if (target && target.startsWith('boil')) dctx.drawImage(layers[target], 0, 0);
  if (target && target.startsWith('shaft')) { dctx.globalCompositeOperation = 'screen'; dctx.globalAlpha = 0.6; dctx.drawImage(layers[target], 0, 0); }
  dctx.globalCompositeOperation = 'overlay';
  dctx.globalAlpha = 0.5;
  dctx.drawImage(paper.grainCanvas, 0, 0);
  dctx.globalCompositeOperation = 'source-over';
  dctx.globalAlpha = 1;
  drawLoupe();
}

/* ---------------------------------------------------------------- loop */
function startLoop(view) {
  const { anim, layers, grade, paper } = view;
  const boils = [layers.boil0, layers.boil1, layers.boil2];
  const shafts = [layers.shaft0, layers.shaft1, layers.shaft2];
  let last = performance.now(), drawAcc = 0, lastComposite = 0;
  view.compose = () => {
    dctx.save();
    dctx.globalCompositeOperation = 'source-over';
    dctx.globalAlpha = 1;
    dctx.drawImage(layers.base, 0, 0);
    anim.composite(dctx, state.t, { boils, shafts });
    dctx.globalCompositeOperation = 'overlay';
    dctx.globalAlpha = 0.5;
    dctx.drawImage(paper.grainCanvas, 0, 0);
    dctx.restore();
    grade.apply(dctx, { halation: view.halation, halationAlpha: 0.55 });
  };
  view.compose();
  const tick = (now) => {
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    let changed = false;
    if (state.playing) {
      state.t += dt;
      drawAcc += dt;
      if (drawAcc >= 1 / 12) { anim.drawNext(); drawAcc = Math.min(drawAcc - 1 / 12, 1 / 12); }
      changed = true;
    }
    if (!changed && !state.dirty) return;
    if (now - lastComposite < 1000 / 30 && !state.dirty) return;
    lastComposite = now;
    state.dirty = false;
    view.compose();
    drawLoupe();
  };
  requestAnimationFrame(tick);
}

/* --------------------------------------------------------------- loupe */
const LOUPE_CSS = 300, LOUPE_ZOOM = 2.2;       // 2.2 screen px per paper px
function sizeLoupe() {
  const dpr = window.devicePixelRatio || 1;
  ui.loupeCanvas.width = LOUPE_CSS * dpr;
  ui.loupeCanvas.height = LOUPE_CSS * dpr;
}
function drawLoupe() {
  if (!state.loupe || !state.pointer) return;
  const { u, v } = state.pointer;
  const src = LOUPE_CSS / LOUPE_ZOOM;
  const x = u * W - src / 2, y = v * H - src / 2;
  const c = ui.loupeCanvas._ctx || (ui.loupeCanvas._ctx = ui.loupeCanvas.getContext('2d'));
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.fillStyle = '#0b0910';
  c.fillRect(0, 0, ui.loupeCanvas.width, ui.loupeCanvas.height);
  c.drawImage(display, x, y, src, src, 0, 0, ui.loupeCanvas.width, ui.loupeCanvas.height);
}
ui.stage.addEventListener('pointermove', (e) => {
  const r = display.getBoundingClientRect();
  const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
  const inside = u >= 0 && u <= 1 && v >= 0 && v <= 1;
  state.pointer = inside ? { u, v } : null;
  ui.loupe.classList.toggle('visible', state.loupe && inside);
  if (state.loupe && inside) {
    ui.loupe.style.transform = `translate(${e.clientX - LOUPE_CSS / 2}px, ${e.clientY - LOUPE_CSS / 2}px)`;
    drawLoupe();
  }
});
ui.stage.addEventListener('pointerleave', () => { state.pointer = null; ui.loupe.classList.remove('visible'); });

/* ------------------------------------------------------------ controls */
function togglePlay() {
  if (state.phase !== 'living') return;
  state.playing = !state.playing;
  ui.play.textContent = state.playing ? 'Pause' : 'Play';
  ui.play.setAttribute('aria-pressed', String(!state.playing));
  state.dirty = true;
}
function toggleLoupe() {
  state.loupe = !state.loupe;
  ui.loupeBtn.classList.toggle('on', state.loupe);
  ui.loupeBtn.setAttribute('aria-pressed', String(state.loupe));
  document.body.classList.toggle('loupe-on', state.loupe);
  if (!state.loupe) ui.loupe.classList.remove('visible');
}
function toggleNotes(force) {
  const open = force ?? !ui.notes.classList.contains('open');
  ui.notes.classList.toggle('open', open);
  ui.notesBtn.setAttribute('aria-expanded', String(open));
}
function exportFrame() {
  display.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const stamp = state.phase === 'living' ? `t${state.t.toFixed(2)}s` : 'in-progress';
    a.download = `unlocked-at-dusk_sheet${SEED}_${stamp}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}
function hurry() { state.hurry = true; ui.hurryBtn.disabled = true; }

ui.play.addEventListener('click', togglePlay);
ui.loupeBtn.addEventListener('click', toggleLoupe);
ui.notesBtn.addEventListener('click', () => toggleNotes());
ui.notesClose.addEventListener('click', () => toggleNotes(false));
ui.exportBtn.addEventListener('click', exportFrame);
ui.hurryBtn.addEventListener('click', hurry);
window.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, textarea')) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); togglePlay(); }
  else if (k === 'l') toggleLoupe();
  else if (k === 'n') toggleNotes();
  else if (k === 's') exportFrame();
  else if (k === 'f') hurry();
  else if (k === 'escape') toggleNotes(false);
});
window.addEventListener('resize', sizeLoupe);
sizeLoupe();

function setStatus(text, frac) {
  if (text) ui.status.textContent = text;
  ui.bar.style.transform = `scaleX(${frac})`;
}

main().catch((err) => {
  console.error(err);
  ui.status.textContent = 'The sheet tore: ' + err.message;
});
