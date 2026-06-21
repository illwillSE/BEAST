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

export interface Layer {
  id: string
  name: string
  visible: boolean
  opacity: number
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
  sprites: Sprite[]
}

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
  return { id: uid('ly'), name, visible: true, opacity: 1, cells }
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
    sprites: [
      createSprite({ name: 'sprite_1', w: 32, h: 32, frameCount: 4, layerNames: ['Background', 'Character', 'Highlights'] }),
      createSprite({ name: 'sprite_2', w: 16, h: 16, frameCount: 2, layerNames: ['Layer 1', 'Layer 2'] }),
    ],
  }
}

// ── sprite CRUD ──────────────────────────────────────────────────────────
export function addSprite(doc: Doc, opts?: CreateSpriteOpts): Doc {
  return { ...doc, sprites: [...doc.sprites, createSprite(opts)] }
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

// Expand each point into a size×size square stamp centered on it, deduped —
// the brush-width primitive shared by strokes/lines/outlines. `size` is
// expected odd (1/3/5/7) so the stamp centers on a single pixel; size<=1 is a
// no-op pass-through.
export function stampPoints(points: Point[], size: number): Point[] {
  if (size <= 1) return points
  const r = (size - 1) / 2
  const seen = new Set<string>()
  const out: Point[] = []
  for (const [x, y] of points) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const px = x + dx, py = y + dy
        const key = `${px},${py}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push([px, py])
      }
    }
  }
  return out
}

export function paintLine(cell: Cell, w: number, h: number, x0: number, y0: number, x1: number, y1: number, rgba: RGBA, size: number) {
  paintPoints(cell, w, h, stampPoints(linePoints(x0, y0, x1, y1), size), rgba)
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

// ── rendering ────────────────────────────────────────────────────────────
// Composite a sprite's frame across its visible layers into `imageData`
// (which must be w*h). src-over, honoring per-layer opacity.
export function compositeFrame(sprite: Sprite, frameIndex: number, imageData: ImageData) {
  const out = imageData.data
  out.fill(0)
  for (const layer of sprite.layers) {
    if (!layer.visible) continue
    const cell = layer.cells[frameIndex]
    const la = layer.opacity
    for (let i = 0; i < out.length; i += 4) {
      const sa = (cell[i + 3] / 255) * la
      if (sa === 0) continue
      const da = out[i + 3] / 255
      const oa = sa + da * (1 - sa)
      if (oa === 0) continue
      out[i] = (cell[i] * sa + out[i] * da * (1 - sa)) / oa
      out[i + 1] = (cell[i + 1] * sa + out[i + 1] * da * (1 - sa)) / oa
      out[i + 2] = (cell[i + 2] * sa + out[i + 2] * da * (1 - sa)) / oa
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
