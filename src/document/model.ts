// The serializable pixel-document model. A project holds many sprites; each
// sprite owns a stack of layers and a number of frames. Every (layer, frame)
// pair is one flat RGBA cell — a Uint8ClampedArray of length w*h*4, all zero =
// fully transparent. Cells are the only large binary data and the unit of
// undo/history (see reducer.js).

// A flat RGBA cell: Uint8ClampedArray of length w*h*4.
export type Cell = Uint8ClampedArray
// One RGBA color, 0–255 per channel.
export type RGBA = readonly [number, number, number, number]
// An [x, y] integer cell coordinate.
export type Point = [number, number]
// A brush stamp shape — square/round fill the whole footprint, the line
// shapes are a 1px-thick flat nib at a fixed orientation (calligraphy-style).
export type BrushShape = 'square' | 'round' | 'line-h' | 'line-v' | 'line-diag1' | 'line-diag2'
// How a layer's pixels combine with the composite below it (see compositeFrame).
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'add'

export interface Layer {
  id: string
  name: string
  visible: boolean
  opacity: number
  blendMode: BlendMode
  cells: Cell[]
}

export interface Sprite {
  id: string
  name: string
  w: number
  h: number
  frameCount: number
  layers: Layer[]
}

export interface Doc {
  name: string
  sprites: Sprite[]
  palette: string[]
}

// Seed palette for new/empty documents.
export const DEFAULT_PALETTE = [
  '#0b0d11', '#1e293b', '#475569', '#94a3b8', '#e2e8f0', '#ffffff',
  '#7c2d12', '#b45309', '#f59e0b', '#fbbf24', '#fde68a', '#fef3c7',
  '#14532d', '#15803d', '#34d399', '#6ee7b7', '#0ea5e9', '#7dd3fc',
  '#7f1d1d', '#ef4444', '#f87171', '#fca5a5', '#a21caf', '#e879f9',
]

// Identifies one cell — the (layer, frame) pair within a sprite that tools edit.
export interface CellTarget {
  spriteId: string
  layerId: string
  frameIndex: number
}

export interface CreateSpriteOpts {
  w?: number
  h?: number
  name?: string
  frameCount?: number
  layerNames?: string[]
}

let _seq = 0
const uid = (p: string) => `${p}${++_seq}`

// Bump the id counter past any id already in a loaded document, so freshly
// created sprites/layers (now that CRUD exists) can't collide with ids a
// prior session assigned before this session's counter started at 0.
export function reseedUid(doc: Doc) {
  for (const sp of doc.sprites) {
    _seq = Math.max(_seq, numericSuffix(sp.id))
    for (const ly of sp.layers) _seq = Math.max(_seq, numericSuffix(ly.id))
  }
}

function numericSuffix(id: string) {
  const m = /\d+$/.exec(id)
  return m ? parseInt(m[0], 10) : 0
}

export function createCell(w: number, h: number): Cell {
  return new Uint8ClampedArray(w * h * 4)
}

export function createLayer(w: number, h: number, frameCount: number, name: string): Layer {
  const cells: Cell[] = []
  for (let f = 0; f < frameCount; f++) cells.push(createCell(w, h))
  return { id: uid('ly'), name, visible: true, opacity: 1, blendMode: 'normal', cells }
}

export function createSprite({
  w = 32,
  h = 32,
  name = 'Sprite 1',
  frameCount = 1,
  layerNames = ['Layer 1'],
}: CreateSpriteOpts = {}): Sprite {
  return {
    id: uid('sp'),
    name,
    w,
    h,
    frameCount,
    // Bottom-to-top: later layers composite over earlier ones.
    layers: layerNames.map((n) => createLayer(w, h, frameCount, n)),
  }
}

export function createDocument(): Doc {
  return {
    name: 'Untitled Project',
    sprites: [
      createSprite({ name: 'sprite_1', w: 32, h: 32, frameCount: 4, layerNames: ['Background', 'Character', 'Highlights'] }),
      createSprite({ name: 'sprite_2', w: 16, h: 16, frameCount: 2, layerNames: ['Layer 1', 'Layer 2'] }),
    ],
    palette: [...DEFAULT_PALETTE],
  }
}

// Truly blank starting point for "New Project" — one empty 64x64 sprite.
// Still seeded with one layer since a sprite with zero layers has nothing
// for tools/selection to target.
export function createBlankDocument(): Doc {
  return {
    name: 'Untitled Project',
    sprites: [createSprite({ name: 'sprite_1', w: 64, h: 64, frameCount: 1, layerNames: ['Layer 1'] })],
    palette: [...DEFAULT_PALETTE],
  }
}

export function renameProject(doc: Doc, name: string): Doc {
  return { ...doc, name }
}

// ── sprite CRUD ──────────────────────────────────────────────────────────
export function addSprite(doc: Doc, opts?: CreateSpriteOpts): Doc {
  return { ...doc, sprites: [...doc.sprites, createSprite(opts)] }
}

// A sprite seeded from imported pixel data (e.g. a decoded PNG) instead of a
// blank cell — single layer, single frame.
export function addSpriteFromImage(doc: Doc, name: string, w: number, h: number, cell: Cell): Doc {
  const sprite: Sprite = {
    id: uid('sp'),
    name,
    w,
    h,
    frameCount: 1,
    layers: [{ id: uid('ly'), name: 'Layer 1', visible: true, opacity: 1, blendMode: 'normal', cells: [cell] }],
  }
  return { ...doc, sprites: [...doc.sprites, sprite] }
}

export function renameSprite(doc: Doc, spriteId: string, name: string): Doc {
  return { ...doc, sprites: doc.sprites.map((sp) => (sp.id === spriteId ? { ...sp, name } : sp)) }
}

// No-op if it's the last sprite — a project always keeps at least one.
export function removeSprite(doc: Doc, spriteId: string): Doc {
  return doc.sprites.length <= 1 ? doc : { ...doc, sprites: doc.sprites.filter((sp) => sp.id !== spriteId) }
}

// delta: +1 moves the sprite later in the list, -1 moves it earlier.
export function moveSprite(doc: Doc, spriteId: string, delta: number): Doc {
  const i = doc.sprites.findIndex((sp) => sp.id === spriteId)
  const j = i + delta
  if (i === -1 || j < 0 || j >= doc.sprites.length) return doc
  const sprites = [...doc.sprites]
  ;[sprites[i], sprites[j]] = [sprites[j], sprites[i]]
  return { ...doc, sprites }
}

// Resize a cell's canvas to newW×newH, sliding the old pixels by
// (offsetX, offsetY) and clipping/filling-transparent as needed. Used for
// both growing (extends with transparency) and shrinking (crops) a sprite.
function resizeCell(cell: Cell, w: number, h: number, newW: number, newH: number, offsetX: number, offsetY: number): Cell {
  const out = createCell(newW, newH)
  for (let y = 0; y < h; y++) {
    const dy = y + offsetY
    if (dy < 0 || dy >= newH) continue
    for (let x = 0; x < w; x++) {
      const dx = x + offsetX
      if (dx < 0 || dx >= newW) continue
      const si = (y * w + x) * 4
      const di = (dy * newW + dx) * 4
      out[di] = cell[si]; out[di + 1] = cell[si + 1]; out[di + 2] = cell[si + 2]; out[di + 3] = cell[si + 3]
    }
  }
  return out
}

// Crop (or extend) a sprite's canvas to the rectangle (x,y,w,h), expressed in
// the existing canvas's coordinate space — pixels outside the rectangle are
// dropped, and area added beyond the old bounds comes in transparent.
export function cropSprite(doc: Doc, spriteId: string, x: number, y: number, newW: number, newH: number): Doc {
  return mapSprite(doc, spriteId, (sp) => ({
    ...sp,
    w: newW,
    h: newH,
    layers: sp.layers.map((l) => ({
      ...l,
      cells: l.cells.map((c) => resizeCell(c, sp.w, sp.h, newW, newH, -x, -y)),
    })),
  }))
}

// Nearest-neighbor scale of a cell to newW×newH — keeps hard pixel edges (no
// blending), unlike resizeCell which pads/crops instead of scaling.
export function stretchCell(cell: Cell, w: number, h: number, newW: number, newH: number): Cell {
  const out = createCell(newW, newH)
  for (let y = 0; y < newH; y++) {
    const sy = Math.min(h - 1, Math.floor((y * h) / newH))
    for (let x = 0; x < newW; x++) {
      const sx = Math.min(w - 1, Math.floor((x * w) / newW))
      const si = (sy * w + sx) * 4
      const di = (y * newW + x) * 4
      out[di] = cell[si]; out[di + 1] = cell[si + 1]; out[di + 2] = cell[si + 2]; out[di + 3] = cell[si + 3]
    }
  }
  return out
}

// Same nearest-neighbor sampling as stretchCell, for a 1-byte-per-pixel
// selection mask instead of an RGBA cell (used to keep a stretched floating
// selection's marquee tracing the right shape).
export function stretchMask(mask: Uint8Array, w: number, h: number, newW: number, newH: number): Uint8Array {
  const out = new Uint8Array(newW * newH)
  for (let y = 0; y < newH; y++) {
    const sy = Math.min(h - 1, Math.floor((y * h) / newH))
    for (let x = 0; x < newW; x++) {
      const sx = Math.min(w - 1, Math.floor((x * w) / newW))
      out[y * newW + x] = mask[sy * w + sx]
    }
  }
  return out
}

// Scale a sprite's whole canvas to newW×newH using nearest-neighbor sampling,
// stretching existing content to fill the new size rather than crop/pad.
export function stretchSprite(doc: Doc, spriteId: string, newW: number, newH: number): Doc {
  return mapSprite(doc, spriteId, (sp) => ({
    ...sp,
    w: newW,
    h: newH,
    layers: sp.layers.map((l) => ({
      ...l,
      cells: l.cells.map((c) => stretchCell(c, sp.w, sp.h, newW, newH)),
    })),
  }))
}

// ── lookups ──────────────────────────────────────────────────────────────
export function findSprite(doc: Doc, spriteId: string): Sprite | undefined {
  return doc.sprites.find((s) => s.id === spriteId)
}

export function getCell(doc: Doc, spriteId: string, layerId: string, frameIndex: number): Cell {
  const sp = findSprite(doc, spriteId)!
  return sp.layers.find((l) => l.id === layerId)!.cells[frameIndex]
}

// Immutably swap one cell, sharing every other sprite/layer/cell by reference.
export function replaceCell(doc: Doc, spriteId: string, layerId: string, frameIndex: number, cell: Cell): Doc {
  return {
    ...doc,
    sprites: doc.sprites.map((sp) =>
      sp.id !== spriteId
        ? sp
        : {
            ...sp,
            layers: sp.layers.map((ly) =>
              ly.id !== layerId
                ? ly
                : { ...ly, cells: ly.cells.map((c, i) => (i === frameIndex ? cell : c)) }
            ),
          }
    ),
  }
}

// ── layer CRUD ───────────────────────────────────────────────────────────
function mapSprite(doc: Doc, spriteId: string, fn: (sp: Sprite) => Sprite): Doc {
  return { ...doc, sprites: doc.sprites.map((sp) => (sp.id === spriteId ? fn(sp) : sp)) }
}

export function addLayer(doc: Doc, spriteId: string, name = 'Layer'): Doc {
  return mapSprite(doc, spriteId, (sp) => ({
    ...sp,
    layers: [...sp.layers, createLayer(sp.w, sp.h, sp.frameCount, name)],
  }))
}

// Inserts the copy directly above the source layer (not necessarily top of stack).
export function duplicateLayer(doc: Doc, spriteId: string, layerId: string): Doc {
  return mapSprite(doc, spriteId, (sp) => {
    const i = sp.layers.findIndex((l) => l.id === layerId)
    if (i === -1) return sp
    const src = sp.layers[i]
    const copy: Layer = {
      id: uid('ly'),
      name: src.name + ' copy',
      visible: src.visible,
      opacity: src.opacity,
      blendMode: src.blendMode,
      cells: src.cells.map((c) => c.slice()),
    }
    const layers = [...sp.layers]
    layers.splice(i + 1, 0, copy)
    return { ...sp, layers }
  })
}

// No-op if it's the last layer — a sprite always keeps at least one.
export function removeLayer(doc: Doc, spriteId: string, layerId: string): Doc {
  return mapSprite(doc, spriteId, (sp) =>
    sp.layers.length <= 1 ? sp : { ...sp, layers: sp.layers.filter((l) => l.id !== layerId) }
  )
}

// delta: +1 moves the layer up the stack (toward the top), -1 moves it down.
export function moveLayer(doc: Doc, spriteId: string, layerId: string, delta: number): Doc {
  return mapSprite(doc, spriteId, (sp) => {
    const i = sp.layers.findIndex((l) => l.id === layerId)
    const j = i + delta
    if (i === -1 || j < 0 || j >= sp.layers.length) return sp
    const layers = [...sp.layers]
    ;[layers[i], layers[j]] = [layers[j], layers[i]]
    return { ...sp, layers }
  })
}

// Lift-and-insert reorder for layer drag-and-drop: the layer at `from` ends up
// at index `to` (both bottom-to-top indices, matching sp.layers order), with
// layers in between shifting to make room — unlike moveLayer's adjacent swap,
// used by the ▲▼ buttons. Mirrors reorderFrame.
export function reorderLayer(doc: Doc, spriteId: string, from: number, to: number): Doc {
  return mapSprite(doc, spriteId, (sp) => {
    if (from === to || from < 0 || from >= sp.layers.length || to < 0 || to >= sp.layers.length) return sp
    const layers = [...sp.layers]
    const [moved] = layers.splice(from, 1)
    layers.splice(to, 0, moved)
    return { ...sp, layers }
  })
}

export function renameLayer(doc: Doc, spriteId: string, layerId: string, name: string): Doc {
  return mapSprite(doc, spriteId, (sp) => ({
    ...sp,
    layers: sp.layers.map((l) => (l.id === layerId ? { ...l, name } : l)),
  }))
}

export function setLayerVisible(doc: Doc, spriteId: string, layerId: string, visible: boolean): Doc {
  return mapSprite(doc, spriteId, (sp) => ({
    ...sp,
    layers: sp.layers.map((l) => (l.id === layerId ? { ...l, visible } : l)),
  }))
}

export function setLayerOpacity(doc: Doc, spriteId: string, layerId: string, opacity: number): Doc {
  return mapSprite(doc, spriteId, (sp) => ({
    ...sp,
    layers: sp.layers.map((l) => (l.id === layerId ? { ...l, opacity } : l)),
  }))
}

export function setLayerBlendMode(doc: Doc, spriteId: string, layerId: string, blendMode: BlendMode): Doc {
  return mapSprite(doc, spriteId, (sp) => ({
    ...sp,
    layers: sp.layers.map((l) => (l.id === layerId ? { ...l, blendMode } : l)),
  }))
}

// Bake a stack of layers down into one cell per frame by compositing them
// (honoring each layer's opacity + blend mode) against a transparent backdrop,
// reusing compositeFrame — the same math the canvas and exporters use. The
// result is a plain normal/opacity-1 layer. Note: blend modes are defined
// against everything beneath, so a merged layer only looks identical if its
// whole backdrop was part of the merge (see mergeLayerDown's caveat).
function flattenCells(layers: Layer[], w: number, h: number, frameCount: number): Cell[] {
  const fake = { id: '', name: '', w, h, frameCount, layers } as Sprite
  const out: Cell[] = []
  for (let f = 0; f < frameCount; f++) {
    const img = new ImageData(w, h)
    compositeFrame(fake, f, img)
    out.push(img.data)
  }
  return out
}

// Merge the layer at `layerId` into the one directly below it, leaving the
// result in the lower layer's slot. No-op if it's the bottom layer. Both are
// composited as visible so hiding a layer never silently drops its pixels; the
// lower layer keeps its visibility. Caveat: if either layer used a non-'normal'
// blend mode it blended against the layers further down too, which aren't part
// of the merge — so a merged non-normal layer can shift appearance.
export function mergeLayerDown(doc: Doc, spriteId: string, layerId: string): Doc {
  return mapSprite(doc, spriteId, (sp) => {
    const i = sp.layers.findIndex((l) => l.id === layerId)
    if (i <= 0) return sp
    const lower = sp.layers[i - 1]
    const upper = sp.layers[i]
    const merged: Layer = {
      id: uid('ly'),
      name: upper.name,
      visible: lower.visible,
      opacity: 1,
      blendMode: 'normal',
      cells: flattenCells([{ ...lower, visible: true }, { ...upper, visible: true }], sp.w, sp.h, sp.frameCount),
    }
    const layers = [...sp.layers]
    layers.splice(i - 1, 2, merged)
    return { ...sp, layers }
  })
}

// Collapse all visible layers into one, left in the bottom-most visible layer's
// slot; hidden layers are kept untouched in place. No-op with fewer than two
// visible layers.
export function mergeVisibleLayers(doc: Doc, spriteId: string, layerId: string): Doc {
  return mapSprite(doc, spriteId, (sp) => {
    const visible = sp.layers.filter((l) => l.visible)
    if (visible.length <= 1) return sp
    const merged: Layer = {
      id: uid('ly'),
      name: (sp.layers.find((l) => l.id === layerId) ?? visible[0]).name,
      visible: true,
      opacity: 1,
      blendMode: 'normal',
      cells: flattenCells(visible, sp.w, sp.h, sp.frameCount),
    }
    let inserted = false
    const layers: Layer[] = []
    for (const l of sp.layers) {
      if (l.visible) {
        if (!inserted) { layers.push(merged); inserted = true }
      } else {
        layers.push(l)
      }
    }
    return { ...sp, layers }
  })
}

// Collapse the whole sprite to a single layer: composite the visible layers and
// discard the hidden ones (true flatten). No-op if there's already one layer.
export function flattenSprite(doc: Doc, spriteId: string, layerId: string): Doc {
  return mapSprite(doc, spriteId, (sp) => {
    if (sp.layers.length <= 1) return sp
    const visible = sp.layers.filter((l) => l.visible)
    const merged: Layer = {
      id: uid('ly'),
      name: (sp.layers.find((l) => l.id === layerId) ?? visible[0] ?? sp.layers[0]).name,
      visible: true,
      opacity: 1,
      blendMode: 'normal',
      cells: flattenCells(visible, sp.w, sp.h, sp.frameCount),
    }
    return { ...sp, layers: [merged] }
  })
}

// ── frame CRUD ───────────────────────────────────────────────────────────
// Every layer keeps one cell per frame, so frame CRUD touches every layer's
// cells array in lockstep and updates the sprite's frameCount.
export function addFrame(doc: Doc, spriteId: string, atIndex: number): Doc {
  return mapSprite(doc, spriteId, (sp) => ({
    ...sp,
    frameCount: sp.frameCount + 1,
    layers: sp.layers.map((l) => {
      const cells = [...l.cells]
      cells.splice(atIndex, 0, createCell(sp.w, sp.h))
      return { ...l, cells }
    }),
  }))
}

export function duplicateFrame(doc: Doc, spriteId: string, frameIndex: number): Doc {
  return mapSprite(doc, spriteId, (sp) => ({
    ...sp,
    frameCount: sp.frameCount + 1,
    layers: sp.layers.map((l) => {
      const cells = [...l.cells]
      cells.splice(frameIndex + 1, 0, l.cells[frameIndex].slice())
      return { ...l, cells }
    }),
  }))
}

// No-op if it's the last frame — a sprite always keeps at least one.
export function removeFrame(doc: Doc, spriteId: string, frameIndex: number): Doc {
  return mapSprite(doc, spriteId, (sp) =>
    sp.frameCount <= 1
      ? sp
      : {
          ...sp,
          frameCount: sp.frameCount - 1,
          layers: sp.layers.map((l) => ({ ...l, cells: l.cells.filter((_, i) => i !== frameIndex) })),
        }
  )
}

// delta: +1 moves the frame later in the timeline, -1 moves it earlier.
export function moveFrame(doc: Doc, spriteId: string, frameIndex: number, delta: number): Doc {
  return mapSprite(doc, spriteId, (sp) => {
    const j = frameIndex + delta
    if (j < 0 || j >= sp.frameCount) return sp
    return {
      ...sp,
      layers: sp.layers.map((l) => {
        const cells = [...l.cells]
        ;[cells[frameIndex], cells[j]] = [cells[j], cells[frameIndex]]
        return { ...l, cells }
      }),
    }
  })
}

// Lift-and-insert reorder for frame drag-and-drop: the frame at `from` ends up
// at index `to`, with frames in between shifting to make room — unlike
// moveFrame's adjacent swap, used by the ◂▸ buttons.
export function reorderFrame(doc: Doc, spriteId: string, from: number, to: number): Doc {
  return mapSprite(doc, spriteId, (sp) => {
    if (from === to || from < 0 || from >= sp.frameCount || to < 0 || to >= sp.frameCount) return sp
    return {
      ...sp,
      layers: sp.layers.map((l) => {
        const cells = [...l.cells]
        const [moved] = cells.splice(from, 1)
        cells.splice(to, 0, moved)
        return { ...l, cells }
      }),
    }
  })
}

// ── pixel writes (mutate a cell in place) ────────────────────────────────
export function paintPixel(cell: Cell, w: number, h: number, x: number, y: number, rgba: RGBA) {
  if (x < 0 || y < 0 || x >= w || y >= h) return
  const i = (y * w + x) * 4
  cell[i] = rgba[0]
  cell[i + 1] = rgba[1]
  cell[i + 2] = rgba[2]
  cell[i + 3] = rgba[3]
}

// Bresenham — every cell on the segment, so fast drags/shape tools leave no gaps.
export function linePoints(x0: number, y0: number, x1: number, y1: number): Point[] {
  const pts: Point[] = []
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  for (;;) {
    pts.push([x0, y0])
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 > -dy) { err -= dy; x0 += sx }
    if (e2 < dx) { err += dx; y0 += sy }
  }
  return pts
}

// Rectangle from corner (x0,y0) to corner (x1,y1), either filled or 1px outline.
export function rectPoints(x0: number, y0: number, x1: number, y1: number, filled: boolean): Point[] {
  const left = Math.min(x0, x1), right = Math.max(x0, x1)
  const top = Math.min(y0, y1), bottom = Math.max(y0, y1)
  const pts: Point[] = []
  if (filled) {
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) pts.push([x, y])
    return pts
  }
  for (let x = left; x <= right; x++) {
    pts.push([x, top])
    if (bottom !== top) pts.push([x, bottom])
  }
  for (let y = top + 1; y < bottom; y++) {
    pts.push([left, y])
    if (right !== left) pts.push([right, y])
  }
  return pts
}

// Ellipse inscribed in the box spanned by (x0,y0)-(x1,y1). Brute-force over the
// bounding box (sprites are small, so this is cheap) testing each pixel center
// against the ellipse equation; outline keeps only boundary pixels (inside with
// an outside 4-neighbor).
export function ellipsePoints(x0: number, y0: number, x1: number, y1: number, filled: boolean): Point[] {
  const left = Math.min(x0, x1), right = Math.max(x0, x1)
  const top = Math.min(y0, y1), bottom = Math.max(y0, y1)
  const cx = (left + right + 1) / 2, cy = (top + bottom + 1) / 2
  const rx = (right - left + 1) / 2, ry = (bottom - top + 1) / 2
  const inside = (px: number, py: number) => {
    const nx = (px + 0.5 - cx) / rx
    const ny = (py + 0.5 - cy) / ry
    return nx * nx + ny * ny <= 1
  }
  const pts: Point[] = []
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (!inside(x, y)) continue
      if (filled || !inside(x + 1, y) || !inside(x - 1, y) || !inside(x, y + 1) || !inside(x, y - 1)) {
        pts.push([x, y])
      }
    }
  }
  return pts
}

// `clip` (if given) restricts writes to the active selection — the same gating
// fillRegion/clearRegion apply, here for freehand strokes/lines/shapes/outlines.
export function paintPoints(cell: Cell, w: number, h: number, points: Point[], rgba: RGBA, clip?: Selection) {
  for (const [x, y] of points) {
    if (clip && !selectionContains(clip, x, y)) continue
    paintPixel(cell, w, h, x, y, rgba)
  }
}

// The dx/dy offsets of one brush stamp, relative to its anchor point. Sizes
// 1-20, including even sizes which have no single center pixel — every shape
// shares one bias convention for that case (lo..hi skews toward -x/-y).
export function shapeOffsets(size: number, shape: BrushShape): Point[] {
  if (size <= 1) return [[0, 0]]
  const lo = -Math.floor(size / 2)
  const hi = Math.ceil(size / 2) - 1
  const out: Point[] = []
  if (shape === 'line-h') {
    for (let dx = lo; dx <= hi; dx++) out.push([dx, 0])
  } else if (shape === 'line-v') {
    for (let dy = lo; dy <= hi; dy++) out.push([0, dy])
  } else if (shape === 'line-diag1') {
    for (let t = lo; t <= hi; t++) out.push([t, t])
  } else if (shape === 'line-diag2') {
    for (let t = lo; t <= hi; t++) out.push([t, -t])
  } else if (shape === 'round') {
    const center = (lo + hi) / 2
    const r = size / 2
    for (let dy = lo; dy <= hi; dy++) {
      for (let dx = lo; dx <= hi; dx++) {
        if ((dx - center) ** 2 + (dy - center) ** 2 <= r * r) out.push([dx, dy])
      }
    }
  } else {
    for (let dy = lo; dy <= hi; dy++) {
      for (let dx = lo; dx <= hi; dx++) out.push([dx, dy])
    }
  }
  return out
}

// Expand each point into a brush stamp centered (or even-size biased) on it,
// deduped — the brush-width primitive shared by strokes/lines/outlines.
export function stampPoints(points: Point[], size: number, shape: BrushShape = 'square'): Point[] {
  if (size <= 1) return points
  const offsets = shapeOffsets(size, shape)
  const seen = new Set<string>()
  const out: Point[] = []
  for (const [x, y] of points) {
    for (const [dx, dy] of offsets) {
      const px = x + dx, py = y + dy
      const key = `${px},${py}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push([px, py])
    }
  }
  return out
}

export function paintLine(cell: Cell, w: number, h: number, x0: number, y0: number, x1: number, y1: number, rgba: RGBA, size: number, shape: BrushShape = 'square', clip?: Selection) {
  paintPoints(cell, w, h, stampPoints(linePoints(x0, y0, x1, y1), size, shape), rgba, clip)
}

// Compute the 4-connected region matching the RGBA at (x,y), without mutating.
// Shared by floodFill (apply one color) and gradientFill (apply per-pixel color).
function floodMask(cell: Cell, w: number, h: number, x: number, y: number) {
  if (x < 0 || y < 0 || x >= w || y >= h) return null
  const at = (px: number, py: number) => (py * w + px) * 4
  const t = at(x, y)
  const tr = cell[t], tg = cell[t + 1], tb = cell[t + 2], ta = cell[t + 3]
  const mask = new Uint8Array(w * h)
  const stack: Point[] = [[x, y]]
  while (stack.length) {
    const [cx, cy] = stack.pop()!
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue
    const mi = cy * w + cx
    if (mask[mi]) continue
    const i = at(cx, cy)
    if (cell[i] !== tr || cell[i + 1] !== tg || cell[i + 2] !== tb || cell[i + 3] !== ta) continue
    mask[mi] = 1
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1])
  }
  return { mask, tr, tg, tb, ta }
}

export interface Mirror {
  v: boolean
  h: boolean
}

// A painted pixel — used to thread flood/gradient regions through the mirror
// resolver below.
interface FillPixel {
  x: number
  y: number
  rgba: RGBA
}

// The mirror-orbit of (x,y): itself plus its reflection across each active
// axis (deduped, so a pixel on a center axis doesn't list itself twice).
function mirrorOrbit(x: number, y: number, w: number, h: number, mirror: Mirror): Point[] {
  const out: Point[] = []
  const seen = new Set<number>()
  const add = (px: number, py: number) => { const k = py * w + px; if (!seen.has(k)) { seen.add(k); out.push([px, py]) } }
  add(x, y)
  if (mirror.v) add(w - 1 - x, y)
  if (mirror.h) add(x, h - 1 - y)
  if (mirror.v && mirror.h) add(w - 1 - x, h - 1 - y)
  return out
}

// How far an orbit member sits from the anchor's side of each active axis: 0
// when it's on the same side as the anchor (ax,ay), higher once it crosses one.
// The lowest-rank member of an orbit is its canonical source. The anchor is the
// flood origin (the gradient's start / the bucket click), so the half the user
// is actually drawing from is the one that's kept and mirrored onto the others —
// otherwise a gradient dragged toward the primary side (e.g. NE→SW with a
// vertical axis, start on the right) would be sourced from the wrong half and
// come out flipped. A pixel exactly on a center axis counts as the anchor's side.
function mirrorRank(x: number, y: number, ax: number, ay: number, w: number, h: number, mirror: Mirror): number {
  const sameV = mirror.v ? (x <= w - 1 - x) === (ax <= w - 1 - ax) : true
  const sameH = mirror.h ? (y <= h - 1 - y) === (ay <= h - 1 - ay) : true
  return (sameV ? 0 : 1) + (sameH ? 0 : 2)
}

// Resolve a flood/gradient region into the actual pixels to paint under
// symmetry. Each mirror-orbit is painted from a single canonical source — the
// lowest-rank member (relative to the anchor, see mirrorRank) that's actually
// in the region — so the result is symmetric and order-independent. This is why
// mirroring a flood fill can't just re-run the fill from a flipped coordinate or
// stamp every orbit member independently: when the matched region spans/straddles
// an axis (e.g. an open background fills the whole canvas), naive copies overlap
// and whichever is written last wins, wiping the side the user drew. Sourcing
// each orbit from the anchor's half keeps that half intact and mirrors it onto
// the rest; (ax,ay) is the flood origin so drawing from either side works.
export function mirroredFill(region: FillPixel[], ax: number, ay: number, w: number, h: number, mirror?: Mirror): FillPixel[] {
  if (!mirror || (!mirror.v && !mirror.h)) return region
  const inRegion = new Set(region.map((p) => p.y * w + p.x))
  const out: FillPixel[] = []
  for (const p of region) {
    const orbit = mirrorOrbit(p.x, p.y, w, h, mirror)
    let bestRank = Infinity
    let bestKey = -1
    for (const [ox, oy] of orbit) {
      const k = oy * w + ox
      if (!inRegion.has(k)) continue
      const r = mirrorRank(ox, oy, ax, ay, w, h, mirror)
      if (r < bestRank) { bestRank = r; bestKey = k }
    }
    if (bestKey !== p.y * w + p.x) continue
    for (const [ox, oy] of orbit) out.push({ x: ox, y: oy, rgba: p.rgba })
  }
  return out
}

// 4-connected flood fill from (x,y): replace the contiguous region matching the
// clicked pixel's RGBA with `rgba`. Mutates the cell in place. `mirror` reflects
// the fill across the active symmetry axes — see mirroredFill.
export function floodFill(cell: Cell, w: number, h: number, x: number, y: number, rgba: RGBA, mirror?: Mirror, clip?: Selection) {
  const region = floodMask(cell, w, h, x, y)
  if (!region) return
  const [fr, fg, fb, fa] = rgba
  if (region.tr === fr && region.tg === fg && region.tb === fb && region.ta === fa) return
  if (!mirror || (!mirror.v && !mirror.h)) {
    for (let i = 0; i < region.mask.length; i++) {
      if (!region.mask[i]) continue
      if (clip && !selectionContains(clip, i % w, (i / w) | 0)) continue
      const o = i * 4
      cell[o] = fr; cell[o + 1] = fg; cell[o + 2] = fb; cell[o + 3] = fa
    }
    return
  }
  const pts: FillPixel[] = []
  for (let i = 0; i < region.mask.length; i++) {
    if (region.mask[i]) pts.push({ x: i % w, y: (i / w) | 0, rgba })
  }
  for (const { x: px, y: py } of mirroredFill(pts, x, y, w, h, mirror)) {
    if (clip && !selectionContains(clip, px, py)) continue
    const o = (py * w + px) * 4
    cell[o] = fr; cell[o + 1] = fg; cell[o + 2] = fb; cell[o + 3] = fa
  }
}

// The 8-connected region of opaque pixels ("the object") reachable from
// (x,y) — unlike floodMask, matches on alpha>0 rather than exact RGBA, and is
// always 8-connected (diagonal touches count as the same object) regardless
// of the outline tool's Fat/Fine border variant, which only changes how the
// border around this mask gets traced (see objectBorderPoints). Returns null
// if (x,y) is out of bounds or already transparent — nothing to outline.
function floodObjectMask(cell: Cell, w: number, h: number, x: number, y: number): Uint8Array | null {
  if (x < 0 || y < 0 || x >= w || y >= h) return null
  if (cell[(y * w + x) * 4 + 3] === 0) return null
  const mask = new Uint8Array(w * h)
  const stack: Point[] = [[x, y]]
  while (stack.length) {
    const [cx, cy] = stack.pop()!
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue
    const mi = cy * w + cx
    if (mask[mi]) continue
    if (cell[mi * 4 + 3] === 0) continue
    mask[mi] = 1
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1], [cx + 1, cy + 1], [cx + 1, cy - 1], [cx - 1, cy + 1], [cx - 1, cy - 1])
  }
  return mask
}

const ORTHOGONAL_DIRS: Point[] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const DIAGONAL_DIRS: Point[] = [[1, 1], [1, -1], [-1, 1], [-1, -1]]

// The pixels just outside an object mask — its border. `fat` picks 8- vs
// 4-connected neighbor checks (the outline tool's Fat/Fine variant): Fat
// includes diagonal neighbors too, so a lone pixel's or a touching pair's
// border has no diagonal gaps and a filled shape's outline corners stay
// closed; Fine checks only N/S/E/W, hugging tighter (a lone pixel outlines to
// 4 instead of 8) at the cost of also leaving ordinary shapes' corners open.
// Since the mask is always 8-connected (a superset of the 4 orthogonal
// directions), any orthogonally-adjacent opaque pixel is already inside it —
// so border points are guaranteed transparent in both modes, never an
// unrelated shape's pixels.
function objectBorderPoints(mask: Uint8Array, w: number, h: number, fat: boolean): Point[] {
  const dirs = fat ? [...ORTHOGONAL_DIRS, ...DIAGONAL_DIRS] : ORTHOGONAL_DIRS
  const seen = new Set<number>()
  const out: Point[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        if (mask[ny * w + nx]) continue
        const k = ny * w + nx
        if (seen.has(k)) continue
        seen.add(k)
        out.push([nx, ny])
      }
    }
  }
  return out
}

// Draws a `size`/`shape` brush stroke (see stampPoints) in `rgba` around the
// 8-connected object touching (x,y) — the outline tool. `fat` is the
// Fat/Fine border variant (see objectBorderPoints); `mirror` reflects across
// the active symmetry axes, same as floodFill.
export function outlineObject(cell: Cell, w: number, h: number, x: number, y: number, rgba: RGBA, size: number, shape: BrushShape, fat: boolean, mirror?: Mirror, clip?: Selection) {
  const mask = floodObjectMask(cell, w, h, x, y)
  if (!mask) return
  const border = objectBorderPoints(mask, w, h, fat)
  if (!border.length) return
  const pts: FillPixel[] = border.map(([px, py]) => ({ x: px, y: py, rgba }))
  const resolved = mirroredFill(pts, x, y, w, h, mirror)
  const stamped = stampPoints(resolved.map(({ x: px, y: py }): Point => [px, py]), size, shape)
  paintPoints(cell, w, h, stamped, rgba, clip)
}

// Per-pixel result of a gradient fill over the flood-connected region from
// (x0,y0), fading from `rgba0` to `rgba1`. Linear fades along the
// (x0,y0)→(x1,y1) vector; radial fades by distance from (x0,y0), with
// (x1,y1) setting the radius. Shared by gradientFill (mutates the cell) and
// gradientFillPreview (read-only, for the gradient tool's live drag preview).
function gradientPoints(cell: Cell, w: number, h: number, x0: number, y0: number, x1: number, y1: number, rgba0: RGBA, rgba1: RGBA, radial: boolean): { x: number; y: number; rgba: RGBA }[] {
  const seedX = Math.max(0, Math.min(w - 1, x0))
  const seedY = Math.max(0, Math.min(h - 1, y0))
  const region = floodMask(cell, w, h, seedX, seedY)
  if (!region) return []
  const [r0, g0, b0, a0] = rgba0
  const [r1, g1, b1, a1] = rgba1
  const dx = x1 - x0, dy = y1 - y0
  const lenSq = dx * dx + dy * dy || 1
  const radius = Math.sqrt(lenSq)
  const out: { x: number; y: number; rgba: RGBA }[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!region.mask[i]) continue
      const t = radial
        ? Math.max(0, Math.min(1, Math.hypot(x - x0, y - y0) / radius))
        : Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / lenSq))
      out.push({
        x, y,
        rgba: [
          Math.round(r0 + (r1 - r0) * t),
          Math.round(g0 + (g1 - g0) * t),
          Math.round(b0 + (b1 - b0) * t),
          Math.round(a0 + (a1 - a0) * t),
        ],
      })
    }
  }
  return out
}

// Mutates the cell in place. `mirror` reflects the gradient across the active
// symmetry axes — see mirroredFill.
export function gradientFill(cell: Cell, w: number, h: number, x0: number, y0: number, x1: number, y1: number, rgba0: RGBA, rgba1: RGBA, radial: boolean, mirror?: Mirror, clip?: Selection) {
  const points = gradientPoints(cell, w, h, x0, y0, x1, y1, rgba0, rgba1, radial)
  for (const { x, y, rgba } of mirroredFill(points, x0, y0, w, h, mirror)) {
    if (clip && !selectionContains(clip, x, y)) continue
    const o = (y * w + x) * 4
    const sA = rgba[3] / 255
    const dA = cell[o + 3] / 255
    const outA = sA + dA * (1 - sA)
    if (outA === 0) { cell[o] = 0; cell[o + 1] = 0; cell[o + 2] = 0; cell[o + 3] = 0; continue }
    cell[o]     = Math.round((rgba[0] * sA + cell[o]     * dA * (1 - sA)) / outA)
    cell[o + 1] = Math.round((rgba[1] * sA + cell[o + 1] * dA * (1 - sA)) / outA)
    cell[o + 2] = Math.round((rgba[2] * sA + cell[o + 2] * dA * (1 - sA)) / outA)
    cell[o + 3] = Math.round(outA * 255)
  }
}

export function gradientFillPreview(cell: Cell, w: number, h: number, x0: number, y0: number, x1: number, y1: number, rgba0: RGBA, rgba1: RGBA, radial: boolean) {
  return gradientPoints(cell, w, h, x0, y0, x1, y1, rgba0, rgba1, radial)
}

// ── region ops (move / cut / copy / paste) ──────────────────────────────────
// A selected region: a bounding box plus an optional per-pixel mask (1 byte
// per pixel within the box, local-indexed [ly*w+lx], 1 = selected). No mask
// means "every pixel in the box is selected" — the common rectangular-marquee
// case. A mask only appears after inverting a selection (see
// invertSelectionMask), since the complement of a rectangle generally isn't
// itself a rectangle.
export interface Selection {
  x: number
  y: number
  w: number
  h: number
  mask?: Uint8Array
}

// Whether canvas pixel (x, y) is selected.
export function selectionContains(sel: Selection, x: number, y: number): boolean {
  const lx = x - sel.x, ly = y - sel.y
  if (lx < 0 || ly < 0 || lx >= sel.w || ly >= sel.h) return false
  return !sel.mask || sel.mask[ly * sel.w + lx] === 1
}

// All pixels matching the RGBA at (x,y), as a canvas-sized selection (mask
// indexed gy*w+gx). global=false selects only the 4-connected region (reuse
// floodMask); global=true selects every matching pixel on the layer. Null if
// (x,y) is out of bounds.
export function selectByColor(cell: Cell, w: number, h: number, x: number, y: number, global: boolean): Selection | null {
  if (x < 0 || y < 0 || x >= w || y >= h) return null
  if (!global) {
    const region = floodMask(cell, w, h, x, y)
    return region ? { x: 0, y: 0, w, h, mask: region.mask } : null
  }
  const t = (y * w + x) * 4
  const tr = cell[t], tg = cell[t + 1], tb = cell[t + 2], ta = cell[t + 3]
  const mask = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    if (cell[o] === tr && cell[o + 1] === tg && cell[o + 2] === tb && cell[o + 3] === ta) mask[i] = 1
  }
  return { x: 0, y: 0, w, h, mask }
}

// Union of an existing selection (or none) with `add`, as a canvas-sized
// selection — Shift+select to grow the selection.
export function unionSelections(base: Selection | null, add: Selection, w: number, h: number): Selection {
  const mask = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((base && selectionContains(base, x, y)) || selectionContains(add, x, y)) mask[y * w + x] = 1
    }
  }
  return { x: 0, y: 0, w, h, mask }
}

// `base` minus `sub`, as a canvas-sized selection — Ctrl/Cmd+Shift+select to
// shrink the selection. Null if nothing remains (or there was no base).
export function subtractSelection(base: Selection | null, sub: Selection, w: number, h: number): Selection | null {
  if (!base) return null
  const mask = new Uint8Array(w * h)
  let any = false
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (selectionContains(base, x, y) && !selectionContains(sub, x, y)) { mask[y * w + x] = 1; any = true }
    }
  }
  return any ? { x: 0, y: 0, w, h, mask } : null
}

// The complement of `sel` over a canvasW×canvasH canvas, as a fresh
// canvas-sized mask. Returns null if the result selects nothing (e.g.
// inverting a selection that already covers the whole canvas).
export function invertSelectionMask(sel: Selection, canvasW: number, canvasH: number): Selection | null {
  const mask = new Uint8Array(canvasW * canvasH)
  let any = false
  for (let y = 0; y < canvasH; y++) {
    for (let x = 0; x < canvasW; x++) {
      if (!selectionContains(sel, x, y)) { mask[y * canvasW + x] = 1; any = true }
    }
  }
  return any ? { x: 0, y: 0, w: canvasW, h: canvasH, mask } : null
}

// The marching-ants outline of a selection, as merged horizontal/vertical
// runs (one run per contiguous edge instead of one per pixel, so a plain
// rectangular selection comes back as exactly 4 segments like before).
export function selectionOutline(sel: Selection): {
  top: { x0: number; x1: number; y: number }[]
  bottom: { x0: number; x1: number; y: number }[]
  left: { y0: number; y1: number; x: number }[]
  right: { y0: number; y1: number; x: number }[]
} {
  const { x: ox, y: oy, w: bw, h: bh, mask } = sel
  const at = (lx: number, ly: number) => lx >= 0 && ly >= 0 && lx < bw && ly < bh && (!mask || mask[ly * bw + lx] === 1)
  const topByRow = new Map<number, number[]>()
  const bottomByRow = new Map<number, number[]>()
  const leftByCol = new Map<number, number[]>()
  const rightByCol = new Map<number, number[]>()
  const push = (m: Map<number, number[]>, k: number, v: number) => {
    const a = m.get(k)
    if (a) a.push(v); else m.set(k, [v])
  }
  for (let ly = 0; ly < bh; ly++) {
    for (let lx = 0; lx < bw; lx++) {
      if (!at(lx, ly)) continue
      const gx = ox + lx, gy = oy + ly
      if (!at(lx, ly - 1)) push(topByRow, gy, gx)
      if (!at(lx, ly + 1)) push(bottomByRow, gy + 1, gx)
      if (!at(lx - 1, ly)) push(leftByCol, gx, gy)
      if (!at(lx + 1, ly)) push(rightByCol, gx + 1, gy)
    }
  }
  const mergeRuns = (vs: number[]): [number, number][] => {
    const sorted = [...vs].sort((a, b) => a - b)
    const runs: [number, number][] = []
    for (const v of sorted) {
      const last = runs[runs.length - 1]
      if (last && last[1] === v) last[1] = v + 1
      else runs.push([v, v + 1])
    }
    return runs
  }
  return {
    top: [...topByRow.entries()].flatMap(([y, xs]) => mergeRuns(xs).map(([x0, x1]) => ({ x0, x1, y }))),
    bottom: [...bottomByRow.entries()].flatMap(([y, xs]) => mergeRuns(xs).map(([x0, x1]) => ({ x0, x1, y }))),
    left: [...leftByCol.entries()].flatMap(([x, ys]) => mergeRuns(ys).map(([y0, y1]) => ({ y0, y1, x }))),
    right: [...rightByCol.entries()].flatMap(([x, ys]) => mergeRuns(ys).map(([y0, y1]) => ({ y0, y1, x }))),
  }
}

// Zero out a rectangular region in place, clipped to bounds. `mask` (if given,
// local-indexed to the rw×rh region) restricts this to selected pixels only.
export function clearRegion(cell: Cell, w: number, h: number, rx: number, ry: number, rw: number, rh: number, mask?: Uint8Array) {
  for (let y = Math.max(0, ry); y < Math.min(h, ry + rh); y++) {
    for (let x = Math.max(0, rx); x < Math.min(w, rx + rw); x++) {
      if (mask && mask[(y - ry) * rw + (x - rx)] !== 1) continue
      const i = (y * w + x) * 4
      cell[i] = 0; cell[i + 1] = 0; cell[i + 2] = 0; cell[i + 3] = 0
    }
  }
}

// Fill a rectangular region in place with a solid color, clipped to bounds.
// `mask` (if given, local-indexed to the rw×rh region) restricts this to
// selected pixels only.
export function fillRegion(cell: Cell, w: number, h: number, rx: number, ry: number, rw: number, rh: number, rgba: RGBA, mask?: Uint8Array) {
  for (let y = Math.max(0, ry); y < Math.min(h, ry + rh); y++) {
    for (let x = Math.max(0, rx); x < Math.min(w, rx + rw); x++) {
      if (mask && mask[(y - ry) * rw + (x - rx)] !== 1) continue
      const i = (y * w + x) * 4
      cell[i] = rgba[0]; cell[i + 1] = rgba[1]; cell[i + 2] = rgba[2]; cell[i + 3] = rgba[3]
    }
  }
}

// Sample a rectangular region into a new buffer (out-of-bounds samples stay
// transparent). Does not mutate `cell`. `mask` (if given, local-indexed to the
// rw×rh region) leaves unselected pixels transparent in the output, so
// pasteRegion's alpha-skip naturally reproduces a non-rectangular shape.
export function copyRegion(cell: Cell, w: number, h: number, rx: number, ry: number, rw: number, rh: number, mask?: Uint8Array): Cell {
  const out = new Uint8ClampedArray(rw * rh * 4)
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      if (mask && mask[y * rw + x] !== 1) continue
      const sx = rx + x, sy = ry + y
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue
      const si = (sy * w + sx) * 4, di = (y * rw + x) * 4
      out[di] = cell[si]; out[di + 1] = cell[si + 1]; out[di + 2] = cell[si + 2]; out[di + 3] = cell[si + 3]
    }
  }
  return out
}

// Src-over composite `data` (rw×rh RGBA) onto `cell` at (rx,ry), clipped to bounds.
export function pasteRegion(cell: Cell, w: number, h: number, rx: number, ry: number, rw: number, rh: number, data: Cell) {
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const dx = rx + x, dy = ry + y
      if (dx < 0 || dy < 0 || dx >= w || dy >= h) continue
      const si = (y * rw + x) * 4, di = (dy * w + dx) * 4
      const sa = data[si + 3] / 255
      if (sa === 0) continue
      const da = cell[di + 3] / 255
      const oa = sa + da * (1 - sa)
      if (oa === 0) continue
      cell[di] = (data[si] * sa + cell[di] * da * (1 - sa)) / oa
      cell[di + 1] = (data[si + 1] * sa + cell[di + 1] * da * (1 - sa)) / oa
      cell[di + 2] = (data[si + 2] * sa + cell[di + 2] * da * (1 - sa)) / oa
      cell[di + 3] = oa * 255
    }
  }
}

// Per-channel blend function (0-255 in/out) for non-'normal' blend modes —
// see blendChannel below for the alpha-compositing step that wraps this.
function blendChannel(mode: BlendMode, cs: number, cb: number): number {
  switch (mode) {
    case 'multiply':
      return (cs * cb) / 255
    case 'screen':
      return 255 - ((255 - cs) * (255 - cb)) / 255
    case 'overlay':
      return cb <= 127.5 ? (2 * cs * cb) / 255 : 255 - (2 * (255 - cs) * (255 - cb)) / 255
    case 'add':
      return Math.min(cs + cb, 255)
    default:
      return cs
  }
}

// ── rendering ────────────────────────────────────────────────────────────
// Composite a sprite's frame across its visible layers into `imageData`
// (which must be w*h). src-over, honoring per-layer opacity and blend mode
// (W3C compositing: blend the source against the backdrop, then alpha-mix
// the blended color in with the usual src-over weights).
export function compositeFrame(sprite: Sprite, frameIndex: number, imageData: ImageData) {
  const out = imageData.data
  out.fill(0)
  for (const layer of sprite.layers) {
    if (!layer.visible) continue
    const cell = layer.cells[frameIndex]
    const la = layer.opacity
    const mode = layer.blendMode
    for (let i = 0; i < out.length; i += 4) {
      const sa = (cell[i + 3] / 255) * la
      if (sa === 0) continue
      const da = out[i + 3] / 255
      const oa = sa + da * (1 - sa)
      if (oa === 0) continue
      const cr = mode === 'normal' ? cell[i] : (1 - da) * cell[i] + da * blendChannel(mode, cell[i], out[i])
      const cg = mode === 'normal' ? cell[i + 1] : (1 - da) * cell[i + 1] + da * blendChannel(mode, cell[i + 1], out[i + 1])
      const cbl = mode === 'normal' ? cell[i + 2] : (1 - da) * cell[i + 2] + da * blendChannel(mode, cell[i + 2], out[i + 2])
      out[i] = (cr * sa + out[i] * da * (1 - sa)) / oa
      out[i + 1] = (cg * sa + out[i + 1] * da * (1 - sa)) / oa
      out[i + 2] = (cbl * sa + out[i + 2] * da * (1 - sa)) / oa
      out[i + 3] = oa * 255
    }
  }
}

// ── color ────────────────────────────────────────────────────────────────
export function hexToRgba(hex: string): RGBA {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), a]
}

// 8-digit (#RRGGBBAA) when there's real transparency, 6-digit otherwise — so
// fully-opaque colors keep the plain hex callers already expect.
export function rgbaToHex([r, g, b, a]: RGBA): string {
  const c = (n: number) => n.toString(16).padStart(2, '0')
  return '#' + c(r) + c(g) + c(b) + (a < 255 ? c(a) : '')
}

// RGB (0–255) ↔ HSV (h 0–360, s/v 0–1). Shared by the color picker and the
// hue/saturation/brightness adjustment.
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return [h, max === 0 ? 0 : d / max, max]
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0, g = 0, b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

// Flip pixels horizontally within the selection bounding box (or the whole cell).
export function flipCellH(cell: Cell, w: number, h: number, clip?: Selection) {
  const rx = clip?.x ?? 0, ry = clip?.y ?? 0
  const rw = clip?.w ?? w, rh = clip?.h ?? h
  for (let y = ry; y < ry + rh; y++) {
    for (let lx = 0; lx < Math.floor(rw / 2); lx++) {
      const x = rx + lx, mx = rx + rw - 1 - lx
      const ai = (y * w + x) * 4, bi = (y * w + mx) * 4
      for (let c = 0; c < 4; c++) { const t = cell[ai + c]; cell[ai + c] = cell[bi + c]; cell[bi + c] = t }
    }
  }
}

// Flip pixels vertically within the selection bounding box (or the whole cell).
export function flipCellV(cell: Cell, w: number, h: number, clip?: Selection) {
  const rx = clip?.x ?? 0, ry = clip?.y ?? 0
  const rw = clip?.w ?? w, rh = clip?.h ?? h
  for (let ly = 0; ly < Math.floor(rh / 2); ly++) {
    const y = ry + ly, my = ry + rh - 1 - ly
    for (let x = rx; x < rx + rw; x++) {
      const ai = (y * w + x) * 4, bi = (my * w + x) * 4
      for (let c = 0; c < 4; c++) { const t = cell[ai + c]; cell[ai + c] = cell[bi + c]; cell[bi + c] = t }
    }
  }
}

// Wrap-around (torus) shift: every pixel at (x,y) moves to ((x+dx)%w, (y+dy)%h).
export function shiftCell(cell: Cell, w: number, h: number, dx: number, dy: number) {
  const src = cell.slice()
  for (let y = 0; y < h; y++) {
    const ny = ((y + dy) % h + h) % h
    for (let x = 0; x < w; x++) {
      const nx = ((x + dx) % w + w) % w
      const si = (y * w + x) * 4, di = (ny * w + nx) * 4
      cell[di] = src[si]; cell[di + 1] = src[si + 1]; cell[di + 2] = src[si + 2]; cell[di + 3] = src[si + 3]
    }
  }
}

// Rotate selection content 90° CW (cw=true) or CCW within the bounding box.
// For non-square regions, content that would land outside the bounding box is
// dropped and vacated corners become transparent.
export function rotateCell90(cell: Cell, w: number, h: number, clip: Selection, cw: boolean) {
  const { x: rx, y: ry, w: rw, h: rh } = clip
  const src = copyRegion(cell, w, h, rx, ry, rw, rh)
  clearRegion(cell, w, h, rx, ry, rw, rh)
  for (let ly = 0; ly < rh; ly++) {
    for (let lx = 0; lx < rw; lx++) {
      const si = (ly * rw + lx) * 4
      if (src[si + 3] === 0) continue
      // CW: (lx,ly) → (rh-1-ly, lx) in a rh×rw space, clipped to rw×rh
      // CCW: (lx,ly) → (ly, rw-1-lx)
      const [dlx, dly] = cw ? [rh - 1 - ly, lx] : [ly, rw - 1 - lx]
      if (dlx >= rw || dly >= rh) continue
      const cx = rx + dlx, cy = ry + dly
      if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue
      const di = (cy * w + cx) * 4
      cell[di] = src[si]; cell[di + 1] = src[si + 1]; cell[di + 2] = src[si + 2]; cell[di + 3] = src[si + 3]
    }
  }
}

// Shift hue (degrees) and scale saturation/value (percent, multiplicative) of
// every opaque pixel, optionally clipped to a selection. Transparent pixels are
// left untouched so they don't pick up a color.
export function adjustHsl(cell: Cell, w: number, h: number, dh: number, ds: number, dv: number, clip?: Selection) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (clip && !selectionContains(clip, x, y)) continue
      const i = (y * w + x) * 4
      if (cell[i + 3] === 0) continue
      let [hh, ss, vv] = rgbToHsv(cell[i], cell[i + 1], cell[i + 2])
      hh = ((hh + dh) % 360 + 360) % 360
      ss = Math.min(1, Math.max(0, ss * (1 + ds / 100)))
      vv = Math.min(1, Math.max(0, vv * (1 + dv / 100)))
      const [r, g, b] = hsvToRgb(hh, ss, vv)
      cell[i] = r; cell[i + 1] = g; cell[i + 2] = b
    }
  }
}

// ── palette CRUD ─────────────────────────────────────────────────────────
export function addSwatch(doc: Doc, hex: string): Doc {
  return doc.palette.includes(hex) ? doc : { ...doc, palette: [...doc.palette, hex] }
}

export function removeSwatch(doc: Doc, index: number): Doc {
  return { ...doc, palette: doc.palette.filter((_, i) => i !== index) }
}

// Overwrites the swatch at `index` in place, rather than appending.
export function editSwatch(doc: Doc, index: number, hex: string): Doc {
  return { ...doc, palette: doc.palette.map((c, i) => (i === index ? hex : c)) }
}

export function setPalette(doc: Doc, palette: string[]): Doc {
  return { ...doc, palette }
}

export function reorderSwatch(doc: Doc, from: number, to: number): Doc {
  if (from === to) return doc
  const palette = [...doc.palette]
  const [moved] = palette.splice(from, 1)
  palette.splice(to, 0, moved)
  return { ...doc, palette }
}

// Merges `colors` into the palette, skipping ones already present (in the
// palette or earlier in `colors`) — used by both "import from image" and
// "import from another project".
export function mergeSwatches(doc: Doc, colors: string[]): Doc {
  const seen = new Set(doc.palette)
  const fresh: string[] = []
  for (const c of colors) {
    if (seen.has(c)) continue
    seen.add(c)
    fresh.push(c)
  }
  return fresh.length ? { ...doc, palette: [...doc.palette, ...fresh] } : doc
}

export type PaletteSortKey = 'hue' | 'saturation' | 'brightness' | 'red' | 'green' | 'blue' | 'alpha'

function paletteSortValue(hex: string, key: PaletteSortKey): number {
  const [r, g, b, a] = hexToRgba(hex)
  if (key === 'red') return r
  if (key === 'green') return g
  if (key === 'blue') return b
  if (key === 'alpha') return a
  const rf = r / 255, gf = g / 255, bf = b / 255
  const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf)
  const d = max - min
  if (key === 'brightness') return max
  if (key === 'saturation') return max === 0 ? 0 : d / max
  if (d === 0) return 0
  let h = max === rf ? ((gf - bf) / d) % 6 : max === gf ? (bf - rf) / d + 2 : (rf - gf) / d + 4
  h *= 60
  return h < 0 ? h + 360 : h
}

export function sortPalette(doc: Doc, key: PaletteSortKey): Doc {
  return { ...doc, palette: [...doc.palette].sort((a, b) => paletteSortValue(a, key) - paletteSortValue(b, key)) }
}

export function reversePalette(doc: Doc): Doc {
  return { ...doc, palette: [...doc.palette].reverse() }
}
