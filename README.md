# Unlocked, at Dusk

A living, hand-drawn pastel landscape. Pure vanilla JavaScript (ES modules) and the 2D Canvas API, with no libraries, images or build step.

Every mark is made by a simulated hand pushing simulated dry pigment through a simulated sheet of toned cold-press paper. The world is drawn mark by mark while you watch, then comes alive at twelve hand-redrawn drawings a second ("on twos").

## Run

ES modules need to be served over HTTP:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Add `?fast` to hurry the artist, or `?seed=2024` for a different sheet.

**Keys:** `Space` pause/play · `L` loupe · `N` curator's notes · `S` export PNG frame · `F` hurry the drawing

## Drift Home — the game

`game.html` is a small game set inside the painting, drawn by the same engine. It has a hand-lettered interactive main menu (Begin, How to play, Settings, Visit the gallery), and the camera drifts slowly across the living painting behind it.

You play a seed of light let out of the glowing nest. Gather embers to feed your glow before it fades. Avoid the charcoal ink knots. Once you have gathered enough embers, the stone ring opens and you fly into the sun to get home. Each night needs more embers and fades faster.

- **Controls:** hold the mouse or a finger to steer, or use WASD or the arrow keys. `Esc` pauses. Menus work with the arrow keys, Enter and the mouse.
- **Settings** (saved in the browser): line boil, living detail, paper grain and sound. *Redraw the sheet* clears the cached painting.
- **First visit:** the world is drawn stroke by stroke and then cached in IndexedDB, so later visits open straight to the menu.

| File | Role |
| --- | --- |
| `game.html`, `css/game.css` | Full-bleed stage and loading veil |
| `js/game/GameMain.js` | Loading and sheet cache, state machine, on-twos camera moves, input, compositing |
| `js/game/MenuScene.js` | `ChalkMenu` (chalk lettering, drawn-in underline, spore cursor), `CardPanel`, main menu |
| `js/game/DriftScene.js` | Gameplay: wind-driven flight, embers, ink knots, the ring gate, the HUD |
| `js/game/ChalkText.js` | Hand lettering: hatched display type and pressed body type, three boil drawings |
| `js/game/ChalkSprites.js` | Hand-drawn spore, ember, ink knot, chalk bursts, meter, cards |
| `js/game/Sound.js` | Synthesized Web Audio chimes (no sound files) |
| `js/game/Settings.js`, `js/game/SheetCache.js` | Preferences and best score; IndexedDB sheet cache |

## Architecture

| File | Role |
| --- | --- |
| `index.html` | Gallery viewport, framed canvas, wall label, notes panel |
| `css/gallery.css` | Dark museum room, loupe, typography |
| `js/engine/Noise.js` | Seeded RNG, Perlin and value noise (shared utility) |
| `js/engine/PaperSubstrate.js` | Cold-press heightmap (felt nodules, rag fibres), pressure tooth masks, raked toned sheet, grain overlay |
| `js/engine/DryMediaTools.js` | The Hand (wrist arc, tremor, pressure envelope), Studio (tooth filtering, tooth loading), the five tools, hatching/scumble/contour techniques |
| `js/engine/Palette90sOVA.js` | Hand-ground pigments, Kubelka–Munk subtractive mixing, OVA grade and halation |
| `js/scene/CompositionLayers.js` | Scene geometry and the ordered, multi-plane drawing plan, including the boil and light-shaft drawings |
| `js/scene/LivingAnimation.js` | 12fps redraw of living elements, three-drawing boil, continuous atmosphere |
| `js/main.js` | Orchestrator: progressive build, animation loop, loupe, notes, pause, export |

## The five tools

1. **Ember Chalk** (soft pastel). It crumbles, skips the tooth under light pressure, drops crumbs, and loads the tooth.
2. **Lantern Wax** (oil pastel). It fills the tooth deep, seals it against later layers, and throws a sheen ridge.
3. **Dusk Conté** (square crayon). It's held at a fixed angle, so the contact width changes with the stroke direction. Used for crisp hatching.
4. **Willow Ash** (vine charcoal). It's fragile and scratchy, skates over wax, and leaves dust. Its contours are searched for in two or three passes.
5. **Tortillon** (blending stump). It adds no pigment. It drags the pigment already on the sheet in the direction of travel.
