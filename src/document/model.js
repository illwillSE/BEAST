// The serializable pixel-document model. A project holds many sprites; each
// sprite owns a stack of layers and a number of frames. Every (layer, frame)
// pair is one flat RGBA cell — a Uint8ClampedArray of length w*h*4, all zero =
// fully transparent. Cells are the only large binary data and the unit of
// undo/history (see reducer.js).

let _seq = 0
const uid = (p) => `${p}${++_seq}`

export function createCell(w, h) {
  return new Uint8ClampedArray(w * h * 4)
}

export function createLayer(w, h, frameCount, name) {
  const cells = []
  for (let f = 0; f < frameCount; f++) cells.push(createCell(w, h))
  return { id: uid('ly'), name, visible: true, opacity: 1, cells }
}

export function createSprite({
  w = 32,
  h = 32,
  name = 'Sprite 1',
  frameCount = 1,
  layerNames = ['Layer 1'],
} = {}) {
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

export function createDocument() {
  return {
    sprites: [
      createSprite({ name: 'sprite_1', w: 32, h: 32, frameCount: 4, layerNames: ['Background', 'Character', 'Highlights'] }),
      createSprite({ name: 'sprite_2', w: 16, h: 16, frameCount: 2, layerNames: ['Layer 1', 'Layer 2'] }),
    ],
  }
}

// ── lookups ──────────────────────────────────────────────────────────────
export function findSprite(doc, spriteId) {
  return doc.sprites.find((s) => s.id === spriteId)
}

export function getCell(doc, spriteId, layerId, frameIndex) {
  const sp = findSprite(doc, spriteId)
  return sp.layers.find((l) => l.id === layerId).cells[frameIndex]
}

// Immutably swap one cell, sharing every other sprite/layer/cell by reference.
export function replaceCell(doc, spriteId, layerId, frameIndex, cell) {
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

// ── pixel writes (mutate a cell in place) ────────────────────────────────
export function paintPixel(cell, w, h, x, y, rgba) {
  if (x < 0 || y < 0 || x >= w || y >= h) return
  const i = (y * w + x) * 4
  cell[i] = rgba[0]
  cell[i + 1] = rgba[1]
  cell[i + 2] = rgba[2]
  cell[i + 3] = rgba[3]
}

// Bresenham — paint every cell on the segment so fast drags leave no gaps.
export function paintLine(cell, w, h, x0, y0, x1, y1, rgba) {
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  for (;;) {
    paintPixel(cell, w, h, x0, y0, rgba)
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 > -dy) { err -= dy; x0 += sx }
    if (e2 < dx) { err += dx; y0 += sy }
  }
}

// 4-connected flood fill from (x,y): replace the contiguous region matching the
// clicked pixel's RGBA with `rgba`. Mutates the cell in place.
export function floodFill(cell, w, h, x, y, rgba) {
  if (x < 0 || y < 0 || x >= w || y >= h) return
  const at = (px, py) => (py * w + px) * 4
  const t = at(x, y)
  const tr = cell[t], tg = cell[t + 1], tb = cell[t + 2], ta = cell[t + 3]
  const [fr, fg, fb, fa] = rgba
  if (tr === fr && tg === fg && tb === fb && ta === fa) return // already that color
  const stack = [[x, y]]
  while (stack.length) {
    const [cx, cy] = stack.pop()
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue
    const i = at(cx, cy)
    if (cell[i] !== tr || cell[i + 1] !== tg || cell[i + 2] !== tb || cell[i + 3] !== ta) continue
    cell[i] = fr; cell[i + 1] = fg; cell[i + 2] = fb; cell[i + 3] = fa
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1])
  }
}

// ── rendering ────────────────────────────────────────────────────────────
// Composite a sprite's frame across its visible layers into `imageData`
// (which must be w*h). src-over, honoring per-layer opacity.
export function compositeFrame(sprite, frameIndex, imageData) {
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
export function hexToRgba(hex) {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255]
}

export function rgbaToHex([r, g, b]) {
  const c = (n) => n.toString(16).padStart(2, '0')
  return '#' + c(r) + c(g) + c(b)
}
