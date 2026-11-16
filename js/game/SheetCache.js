/**
 * SheetCache.js — the finished sheet is kept in IndexedDB, so the artist only
 * has to draw the world once per browser. Each layer is stored as a PNG blob.
 * Any failure (private mode, quota, old browser) just means "draw it again".
 */
const DB = 'drift-home', STORE = 'sheets';

function openDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('no indexedDB')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function loadSheet(key, layers) {
  try {
    const db = await openDB();
    const rec = await new Promise((res) => {
      const q = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      q.onsuccess = () => res(q.result || null);
      q.onerror = () => res(null);
    });
    if (!rec) return false;
    for (const name of Object.keys(layers)) {
      if (!rec[name]) return false;
      const bmp = await createImageBitmap(rec[name]);
      const ctx = layers[name]._ctx;
      ctx.clearRect(0, 0, layers[name].width, layers[name].height);
      ctx.drawImage(bmp, 0, 0);
      bmp.close && bmp.close();
    }
    return true;
  } catch { return false; }
}

export async function saveSheet(key, layers) {
  try {
    const rec = {};
    for (const [name, canvas] of Object.entries(layers)) {
      rec[name] = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      if (!rec[name]) return false;
    }
    const db = await openDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();          // keep only the current sheet
      tx.objectStore(STORE).put(rec, key);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    return true;
  } catch { return false; }
}

export async function clearSheets() {
  try {
    const db = await openDB();
    await new Promise((res) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear(); tx.oncomplete = res; tx.onerror = res; });
  } catch { /* nothing to clear */ }
}
