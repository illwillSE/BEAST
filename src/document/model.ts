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

export function paintPoints(cell: Cell, w: number, h: number, points: Point[], rgba: RGBA) {
  for (const [x, y] of points) paintPixel(cell, w, h, x, y, rgba)
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

export function paintLine(cell: Cell, w: number, h: number, x0: number, y0: number, x1: number, y1: number, rgba: RGBA, size: number, shape: BrushShape = 'square') {
  paintPoints(cell, w, h, stampPoints(linePoints(x0, y0, x1, y1), size, shape), rgba)
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

// 4-connected flood fill from (x,y): replace the contiguous region matching the
// clicked pixel's RGBA with `rgba`. Mutates the cell in place.
export function floodFill(cell: Cell, w: number, h: number, x: number, y: number, rgba: RGBA) {
  const region = floodMask(cell, w, h, x, y)
  if (!region) return
  const [fr, fg, fb, fa] = rgba
  if (region.tr === fr && region.tg === fg && region.tb === fb && region.ta === fa) return
  for (let i = 0; i < region.mask.length; i++) {
    if (!region.mask[i]) continue
    const o = i * 4
    cell[o] = fr; cell[o + 1] = fg; cell[o + 2] = fb; cell[o + 3] = fa
  }
}

// Flood-fill the region from (x0,y0), fading from `rgba0` at (x0,y0) to
// `rgba1` at (x1,y1) — a two-stop gradient (fg → bg).
export function gradientFill(cell: Cell, w: number, h: number, x0: number, y0: number, x1: number, y1: number, rgba0: RGBA, rgba1: RGBA) {
  const region = floodMask(cell, w, h, x0, y0)
  if (!region) return
  const [r0, g0, b0, a0] = rgba0
  const [r1, g1, b1, a1] = rgba1
  const dx = x1 - x0, dy = y1 - y0
  const lenSq = dx * dx + dy * dy || 1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!region.mask[i]) continue
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / lenSq))
      const o = i * 4
      cell[o] = Math.round(r0 + (r1 - r0) * t)
      cell[o + 1] = Math.round(g0 + (g1 - g0) * t)
      cell[o + 2] = Math.round(b0 + (b1 - b0) * t)
      cell[o + 3] = Math.round(a0 + (a1 - a0) * t)
    }
  }
}

// ── region ops (move / cut / copy / paste) ──────────────────────────────────
// Zero out a rectangular region in place, clipped to bounds.
export function clearRegion(cell: Cell, w: number, h: number, rx: number, ry: number, rw: number, rh: number) {
  for (let y = Math.max(0, ry); y < Math.min(h, ry + rh); y++) {
    for (let x = Math.max(0, rx); x < Math.min(w, rx + rw); x++) {
      const i = (y * w + x) * 4
      cell[i] = 0; cell[i + 1] = 0; cell[i + 2] = 0; cell[i + 3] = 0
    }
  }
}

// Sample a rectangular region into a new buffer (out-of-bounds samples stay
// transparent). Does not mutate `cell`.
export function copyRegion(cell: Cell, w: number, h: number, rx: number, ry: number, rw: number, rh: number): Cell {
  const out = new Uint8ClampedArray(rw * rh * 4)
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
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
