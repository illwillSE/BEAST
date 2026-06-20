// The serializable pixel-document model. A project holds many sprites; each
// sprite owns a stack of layers and a number of frames. Every (layer, frame)
// pair is one flat RGBA cell — a Uint8ClampedArray of length w*h*4, all zero =
// fully transparent. Cells are the only large binary data and the unit of
// undo/history (see reducer.js).

let _seq = 0
const uid = (p) => `${p}${++_seq}`

// Bump the id counter past any id already in a loaded document, so freshly
// created sprites/layers (now that CRUD exists) can't collide with ids a
// prior session assigned before this session's counter started at 0.
export function reseedUid(doc) {
  for (const sp of doc.sprites) {
    _seq = Math.max(_seq, numericSuffix(sp.id))
    for (const ly of sp.layers) _seq = Math.max(_seq, numericSuffix(ly.id))
  }
}

function numericSuffix(id) {
  const m = /\d+$/.exec(id)
  return m ? parseInt(m[0], 10) : 0
}

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

// ── sprite CRUD ──────────────────────────────────────────────────────────
export function addSprite(doc, opts) {
  return { ...doc, sprites: [...doc.sprites, createSprite(opts)] }
}

export function renameSprite(doc, spriteId, name) {
  return { ...doc, sprites: doc.sprites.map((sp) => (sp.id === spriteId ? { ...sp, name } : sp)) }
}

// No-op if it's the last sprite — a project always keeps at least one.
export function removeSprite(doc, spriteId) {
  return doc.sprites.length <= 1 ? doc : { ...doc, sprites: doc.sprites.filter((sp) => sp.id !== spriteId) }
}

// delta: +1 moves the sprite later in the list, -1 moves it earlier.
export function moveSprite(doc, spriteId, delta) {
  const i = doc.sprites.findIndex((sp) => sp.id === spriteId)
  const j = i + delta
  if (i === -1 || j < 0 || j >= doc.sprites.length) return doc
  const sprites = [...doc.sprites]
  ;[sprites[i], sprites[j]] = [sprites[j], sprites[i]]
  return { ...doc, sprites }
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

// ── layer CRUD ───────────────────────────────────────────────────────────
function mapSprite(doc, spriteId, fn) {
  return { ...doc, sprites: doc.sprites.map((sp) => (sp.id === spriteId ? fn(sp) : sp)) }
}

export function addLayer(doc, spriteId, name = 'Layer') {
  return mapSprite(doc, spriteId, (sp) => ({
    ...sp,
    layers: [...sp.layers, createLayer(sp.w, sp.h, sp.frameCount, name)],
  }))
}

// Inserts the copy directly above the source layer (not necessarily top of stack).
export function duplicateLayer(doc, spriteId, layerId) {
  return mapSprite(doc, spriteId, (sp) => {
    const i = sp.layers.findIndex((l) => l.id === layerId)
    if (i === -1) return sp
    const src = sp.layers[i]
    const copy = {
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
export function removeLayer(doc, spriteId, layerId) {
  return mapSprite(doc, spriteId, (sp) =>
    sp.layers.length <= 1 ? sp : { ...sp, layers: sp.layers.filter((l) => l.id !== layerId) }
  )
}

// delta: +1 moves the layer up the stack (toward the top), -1 moves it down.
export function moveLayer(doc, spriteId, layerId, delta) {
  return mapSprite(doc, spriteId, (sp) => {
    const i = sp.layers.findIndex((l) => l.id === layerId)
    const j = i + delta
    if (i === -1 || j < 0 || j >= sp.layers.length) return sp
    const layers = [...sp.layers]
    ;[layers[i], layers[j]] = [layers[j], layers[i]]
    return { ...sp, layers }
  })
}

export function setLayerVisible(doc, spriteId, layerId, visible) {
  return mapSprite(doc, spriteId, (sp) => ({
    ...sp,
    layers: sp.layers.map((l) => (l.id === layerId ? { ...l, visible } : l)),
  }))
}

export function setLayerOpacity(doc, spriteId, layerId, opacity) {
  return mapSprite(doc, spriteId, (sp) => ({
    ...sp,
    layers: sp.layers.map((l) => (l.id === layerId ? { ...l, opacity } : l)),
  }))
}

// ── frame CRUD ───────────────────────────────────────────────────────────
// Every layer keeps one cell per frame, so frame CRUD touches every layer's
// cells array in lockstep and updates the sprite's frameCount.
export function addFrame(doc, spriteId, atIndex) {
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

export function duplicateFrame(doc, spriteId, frameIndex) {
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
export function removeFrame(doc, spriteId, frameIndex) {
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
export function moveFrame(doc, spriteId, frameIndex, delta) {
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
