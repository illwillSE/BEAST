// Autosave to the browser: the manifest (small JSON spine) goes in localStorage,
// the content-addressed cell blobs go in IndexedDB (too big for localStorage).
// On load we read the spine and repopulate cells from IndexedDB by hash. All
// failures are swallowed so persistence never breaks editing.

import { serializeProject, deserializeProject } from './serialize.js'

const MANIFEST_KEY = 'beast.autosave.manifest'
const DB_NAME = 'beast'
const STORE = 'cells'

// Hashes already written this session, so repeat autosaves only put new blobs.
const persisted = new Set()

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function putBlobs(db, entries) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    for (const [hash, buf] of entries) store.put(buf, hash)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function getBlobs(db, hashes) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const out = new Map()
    for (const hash of hashes) {
      const req = store.get(hash)
      req.onsuccess = () => { if (req.result) out.set(hash, req.result) }
    }
    tx.oncomplete = () => resolve(out)
    tx.onerror = () => reject(tx.error)
  })
}

export async function saveAutosave(doc) {
  try {
    const { manifest, blobs } = serializeProject(doc)
    const fresh = [...blobs].filter(([hash]) => !persisted.has(hash))
    if (fresh.length) {
      const db = await openDB()
      await putBlobs(db, fresh)
      db.close()
      for (const [hash] of fresh) persisted.add(hash)
    }
    localStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest))
  } catch (err) {
    console.warn('BEAST autosave failed', err)
  }
}

// Returns the restored document, or null if there's nothing saved / it fails.
export async function loadAutosave() {
  try {
    const raw = localStorage.getItem(MANIFEST_KEY)
    if (!raw) return null
    const manifest = JSON.parse(raw)
    const hashes = new Set()
    for (const sp of manifest.sprites)
      for (const ly of sp.layers)
        for (const hash of ly.cells) hashes.add(hash)

    const db = await openDB()
    const blobs = await getBlobs(db, hashes)
    db.close()
    for (const hash of blobs.keys()) persisted.add(hash)
    return deserializeProject({ manifest, blobs })
  } catch (err) {
    console.warn('BEAST autosave restore failed', err)
    return null
  }
}
