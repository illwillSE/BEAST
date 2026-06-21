// Autosave to the browser: the manifest (small JSON spine) goes in localStorage,
// the content-addressed cell blobs go in IndexedDB (too big for localStorage).
// On load we read the spine and repopulate cells from IndexedDB by hash. All
// failures are swallowed so persistence never breaks editing.

import { serializeProject, deserializeProject } from './serialize.js'
import type { Doc, Cell } from '../document/model.js'

const MANIFEST_KEY = 'beast.autosave.manifest'
const DB_NAME = 'beast'
const STORE = 'cells'

// Hashes already written this session, so repeat autosaves only put new blobs.
const persisted = new Set<string>()

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function putBlobs(db: IDBDatabase, entries: [string, Cell][]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    for (const [hash, buf] of entries) store.put(buf, hash)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function getBlobs(db: IDBDatabase, hashes: Iterable<string>): Promise<Map<string, Cell>> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const out = new Map<string, Cell>()
    for (const hash of hashes) {
      const req = store.get(hash)
      req.onsuccess = () => { if (req.result) out.set(hash, req.result) }
    }
    tx.oncomplete = () => resolve(out)
    tx.onerror = () => reject(tx.error)
  })
}

function getAllKeys(db: IDBDatabase): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).getAllKeys()
    req.onsuccess = () => resolve(req.result as string[])
    req.onerror = () => reject(req.error)
  })
}

function deleteBlobs(db: IDBDatabase, hashes: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    for (const hash of hashes) store.delete(hash)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function saveAutosave(doc: Doc): Promise<void> {
  try {
    const { manifest, blobs } = serializeProject(doc)
    const fresh = [...blobs].filter(([hash]) => !persisted.has(hash))
    const db = await openDB()
    if (fresh.length) {
      await putBlobs(db, fresh)
      for (const [hash] of fresh) persisted.add(hash)
    }
    const keep = new Set(blobs.keys())
    const allKeys = await getAllKeys(db)
    const orphans = allKeys.filter((key) => !keep.has(key))
    if (orphans.length) await deleteBlobs(db, orphans)
    db.close()
    for (const hash of orphans) persisted.delete(hash)
    localStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest))
  } catch (err) {
    console.warn('BEAST autosave failed', err)
  }
}

// Returns the restored document, or null if there's nothing saved / it fails.
export async function loadAutosave(): Promise<Doc | null> {
  try {
    const raw = localStorage.getItem(MANIFEST_KEY)
    if (!raw) return null
    const manifest = JSON.parse(raw)
    const hashes = new Set<string>()
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
