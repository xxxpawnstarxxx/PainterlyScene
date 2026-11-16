/**
 * Settings.js — the player's preferences and best score, kept in localStorage.
 * Every read and write is guarded: private windows and blocked storage simply
 * fall back to defaults.
 */
const KEY = 'drift-home-settings-v1';
const BEST = 'drift-home-best-v1';

export const DEFAULTS = { boil: true, detail: 'high', grain: 'strong', sound: true };

export const OPTIONS = {
  boil:   { label: 'Line boil',   values: [true, false],              show: (v) => (v ? 'alive' : 'still') },
  detail: { label: 'Living detail', values: ['high', 'medium', 'low'], show: (v) => v },
  grain:  { label: 'Paper grain', values: ['strong', 'soft', 'off'],  show: (v) => v },
  sound:  { label: 'Sound',       values: [true, false],              show: (v) => (v ? 'on' : 'off') },
};

export function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}
export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
export function loadBest() {
  try { return parseInt(localStorage.getItem(BEST) || '0', 10) || 0; } catch { return 0; }
}
export function saveBest(v) {
  try { localStorage.setItem(BEST, String(v)); } catch { /* storage unavailable */ }
}
export function cycle(key, value, dir = 1) {
  const vals = OPTIONS[key].values;
  const i = vals.indexOf(value);
  return vals[(i + dir + vals.length) % vals.length];
}
