// Project (de)serialization — the shared foundation under both ZIP save/load
// and autosave. A project splits into a small JSON spine (the manifest) plus
// content-addressed cell blobs: every pixel buffer is hashed, the manifest
// references cells by hash, and identical buffers (e.g. all the empty cells)
// dedupe to a single blob. Reconstruction repopulates cells from the blob set,
// like BLAST's sample cache.

import type { Cell, Doc } from '../document/model.js'

const VERSION = 1

interface ManifestLayer {
  id: string
  name: string
  visible: boolean
  opacity: number
  cells: string[]
}

interface ManifestSprite {
  id: string
  name: string
  w: number
  h: number
  frameCount: number
  layers: ManifestLayer[]
}

export interface Manifest {
  version: number
  sprites: ManifestSprite[]
}

// cyrb53 — a fast non-cryptographic hash over the cell bytes. Good enough for
// in-project content addressing; not collision-proof (see TODO).
function hashCell(cell: Cell): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < cell.length; i++) {
    const ch = cell[i]
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

function toClamped(raw: Uint8Array | Uint8ClampedArray): Uint8ClampedArray {
  return raw instanceof Uint8ClampedArray ? raw : new Uint8ClampedArray(raw)
}

// doc -> { manifest, blobs: Map<hash, Uint8ClampedArray> }
export function serializeProject(doc: Doc): { manifest: Manifest; blobs: Map<string, Cell> } {
  const blobs = new Map<string, Cell>()
  const sprites = doc.sprites.map((sp) => ({
    id: sp.id,
    name: sp.name,
    w: sp.w,
    h: sp.h,
    frameCount: sp.frameCount,
    layers: sp.layers.map((ly) => ({
      id: ly.id,
      name: ly.name,
      visible: ly.visible,
      opacity: ly.opacity,
      cells: ly.cells.map((cell) => {
        const hash = hashCell(cell)
        if (!blobs.has(hash)) blobs.set(hash, cell)
        return hash
      }),
    })),
  }))
  return { manifest: { version: VERSION, sprites }, blobs }
}

// { manifest, blobs: Map<hash, Uint8Array|Uint8ClampedArray> } -> doc.
// Missing/wrong-sized blobs fall back to a transparent cell so a partially
// corrupt file still loads.
export function deserializeProject({
  manifest,
  blobs,
}: {
  manifest: Manifest
  blobs: Map<string, Uint8Array | Uint8ClampedArray>
}): Doc {
  const cache = new Map<string, Cell>()
  return {
    sprites: manifest.sprites.map((sp) => {
      const len = sp.w * sp.h * 4
      const cellFor = (hash: string): Cell => {
        const cached = cache.get(hash)
        if (cached && cached.length === len) return cached
        const raw = blobs.get(hash)
        const cell = raw && raw.length === len ? toClamped(raw) : new Uint8ClampedArray(len)
        cache.set(hash, cell)
        return cell
      }
      return {
        id: sp.id,
        name: sp.name,
        w: sp.w,
        h: sp.h,
        frameCount: sp.frameCount,
        layers: sp.layers.map((ly) => ({
          id: ly.id,
          name: ly.name,
          visible: ly.visible,
          opacity: ly.opacity,
          cells: ly.cells.map(cellFor),
        })),
      }
    }),
  }
}
