import { describe, it, expect, beforeEach } from 'vitest'
import {
  hexToRgba, rgbaToHex,
  rgbToHsv, hsvToRgb,
  linePoints,
  createCell, createBlankDocument, createSprite,
  paintPixel, floodFill, gradientFill,
  addLayer, removeLayer, setLayerVisible,
  addFrame, removeFrame,
  selectionContains, copyRegion, clearRegion,
  compositeFrame, mergeLayerDown, mergeVisibleLayers,
} from './model.js'
import type { Doc, Selection } from './model.js'

// ── color conversions ─────────────────────────────────────────────────────

describe('hexToRgba', () => {
  it('parses 6-digit hex', () => {
    expect(hexToRgba('#ff8800')).toEqual([255, 136, 0, 255])
  })
  it('expands 3-digit shorthand', () => {
    expect(hexToRgba('#f80')).toEqual([255, 136, 0, 255])
  })
  it('parses 8-digit hex with alpha', () => {
    expect(hexToRgba('#ff880080')).toEqual([255, 136, 0, 128])
  })
})

describe('rgbaToHex', () => {
  it('produces 6-digit output for opaque colors', () => {
    expect(rgbaToHex([255, 136, 0, 255])).toBe('#ff8800')
  })
  it('produces 8-digit output when alpha < 255', () => {
    expect(rgbaToHex([255, 136, 0, 128])).toBe('#ff880080')
  })
  it('roundtrips through hexToRgba', () => {
    expect(rgbaToHex(hexToRgba('#3a7bc8'))).toBe('#3a7bc8')
  })
})

describe('rgbToHsv / hsvToRgb', () => {
  it('pure red roundtrips', () => {
    const [h, s, v] = rgbToHsv(255, 0, 0)
    expect(hsvToRgb(h, s, v)).toEqual([255, 0, 0])
  })
  it('pure blue roundtrips', () => {
    const [h, s, v] = rgbToHsv(0, 0, 255)
    expect(hsvToRgb(h, s, v)).toEqual([0, 0, 255])
  })
  it('grey has saturation 0', () => {
    const [, s] = rgbToHsv(128, 128, 128)
    expect(s).toBe(0)
  })
  it('black has value 0', () => {
    const [, , v] = rgbToHsv(0, 0, 0)
    expect(v).toBe(0)
  })
})

// ── linePoints ────────────────────────────────────────────────────────────

describe('linePoints', () => {
  it('returns a single point when start equals end', () => {
    expect(linePoints(3, 3, 3, 3)).toEqual([[3, 3]])
  })
  it('covers every x for a horizontal line', () => {
    const pts = linePoints(0, 0, 3, 0)
    expect(pts).toHaveLength(4)
    expect(pts.map(([x]) => x)).toEqual([0, 1, 2, 3])
  })
  it('covers every y for a vertical line', () => {
    const pts = linePoints(0, 0, 0, 3)
    expect(pts).toHaveLength(4)
    expect(pts.map(([, y]) => y)).toEqual([0, 1, 2, 3])
  })
  it('consecutive points are always connected (max 1px step each axis)', () => {
    const pts = linePoints(0, 0, 7, 5)
    for (let i = 1; i < pts.length; i++) {
      expect(Math.abs(pts[i][0] - pts[i - 1][0])).toBeLessThanOrEqual(1)
      expect(Math.abs(pts[i][1] - pts[i - 1][1])).toBeLessThanOrEqual(1)
    }
  })
  it('diagonal includes both endpoints', () => {
    const pts = linePoints(0, 0, 5, 5)
    expect(pts).toContainEqual([0, 0])
    expect(pts).toContainEqual([5, 5])
  })
})

// ── paintPixel + floodFill ────────────────────────────────────────────────

describe('paintPixel', () => {
  it('sets RGBA at the correct offset', () => {
    const cell = createCell(4, 4)
    paintPixel(cell, 4, 4, 2, 1, [10, 20, 30, 255])
    const i = (1 * 4 + 2) * 4
    expect([cell[i], cell[i + 1], cell[i + 2], cell[i + 3]]).toEqual([10, 20, 30, 255])
  })
  it('ignores out-of-bounds coordinates', () => {
    const cell = createCell(4, 4)
    const before = cell.slice()
    paintPixel(cell, 4, 4, 10, 10, [255, 0, 0, 255])
    expect(cell).toEqual(before)
  })
})

describe('floodFill', () => {
  it('fills all transparent pixels in an empty cell', () => {
    const cell = createCell(3, 3)
    floodFill(cell, 3, 3, 1, 1, [255, 0, 0, 255])
    for (let i = 0; i < 3 * 3 * 4; i += 4) {
      expect(cell[i]).toBe(255)
      expect(cell[i + 3]).toBe(255)
    }
  })
  it('is a no-op when fill color equals the target color', () => {
    const cell = createCell(4, 4)
    const before = cell.slice()
    floodFill(cell, 4, 4, 0, 0, [0, 0, 0, 0])
    expect(cell).toEqual(before)
  })
  it('stops at differently-colored boundary pixels', () => {
    const cell = createCell(4, 4)
    // vertical wall at x=2
    for (let y = 0; y < 4; y++) paintPixel(cell, 4, 4, 2, y, [0, 0, 0, 255])
    floodFill(cell, 4, 4, 0, 0, [255, 0, 0, 255])
    // pixel to the right of the wall stays transparent
    const i = (0 * 4 + 3) * 4
    expect(cell[i + 3]).toBe(0)
  })
})

// ── layer CRUD ────────────────────────────────────────────────────────────

describe('layer CRUD', () => {
  let doc: Doc

  beforeEach(() => { doc = createBlankDocument() })

  it('addLayer appends a new layer', () => {
    const sp = doc.sprites[0]
    const doc2 = addLayer(doc, sp.id, 'Overlay')
    expect(doc2.sprites[0].layers).toHaveLength(2)
    expect(doc2.sprites[0].layers[1].name).toBe('Overlay')
  })

  it('addLayer leaves existing layers by reference', () => {
    const sp = doc.sprites[0]
    const doc2 = addLayer(doc, sp.id, 'Overlay')
    expect(doc2.sprites[0].layers[0]).toBe(sp.layers[0])
  })

  it('removeLayer is a no-op when only one layer exists', () => {
    const sp = doc.sprites[0]
    const doc2 = removeLayer(doc, sp.id, sp.layers[0].id)
    expect(doc2.sprites[0].layers).toHaveLength(1)
  })

  it('removeLayer removes a non-last layer', () => {
    const sp = doc.sprites[0]
    const doc2 = addLayer(doc, sp.id, 'Layer 2')
    const toRemove = doc2.sprites[0].layers[1].id
    const doc3 = removeLayer(doc2, sp.id, toRemove)
    expect(doc3.sprites[0].layers).toHaveLength(1)
  })
})

// ── frame CRUD ────────────────────────────────────────────────────────────

describe('frame CRUD', () => {
  let doc: Doc

  beforeEach(() => { doc = createBlankDocument() })

  it('addFrame increments frameCount', () => {
    const sp = doc.sprites[0]
    const doc2 = addFrame(doc, sp.id, 1)
    expect(doc2.sprites[0].frameCount).toBe(2)
  })

  it('addFrame adds a cell to every layer', () => {
    const sp = doc.sprites[0]
    const doc2 = addFrame(doc, sp.id, 1)
    expect(doc2.sprites[0].layers[0].cells).toHaveLength(2)
  })

  it('removeFrame is a no-op when only one frame exists', () => {
    const sp = doc.sprites[0]
    const doc2 = removeFrame(doc, sp.id, 0)
    expect(doc2.sprites[0].frameCount).toBe(1)
  })

  it('removeFrame decrements frameCount and removes cells', () => {
    const sp = doc.sprites[0]
    const doc2 = addFrame(doc, sp.id, 1)
    const doc3 = removeFrame(doc2, sp.id, 1)
    expect(doc3.sprites[0].frameCount).toBe(1)
    expect(doc3.sprites[0].layers[0].cells).toHaveLength(1)
  })
})

// ── selectionContains ─────────────────────────────────────────────────────

describe('selectionContains', () => {
  it('covers the full bounding box with no mask', () => {
    const sel: Selection = { x: 2, y: 2, w: 3, h: 3 }
    expect(selectionContains(sel, 2, 2)).toBe(true)
    expect(selectionContains(sel, 4, 4)).toBe(true)
  })
  it('rejects pixels outside the bounding box', () => {
    const sel: Selection = { x: 2, y: 2, w: 3, h: 3 }
    expect(selectionContains(sel, 5, 2)).toBe(false)
    expect(selectionContains(sel, 2, 1)).toBe(false)
  })
  it('mask excludes pixels where mask byte is 0', () => {
    // 2×2 mask: only top-left (0,0) and bottom-right (1,1) selected
    const mask = new Uint8Array([1, 0, 0, 1])
    const sel: Selection = { x: 0, y: 0, w: 2, h: 2, mask }
    expect(selectionContains(sel, 0, 0)).toBe(true)
    expect(selectionContains(sel, 1, 0)).toBe(false)
    expect(selectionContains(sel, 0, 1)).toBe(false)
    expect(selectionContains(sel, 1, 1)).toBe(true)
  })
})

// ── copyRegion / clearRegion ───────────────────────────────────────────────

describe('copyRegion', () => {
  it('copies the correct pixel into the new buffer', () => {
    const cell = createCell(4, 4)
    paintPixel(cell, 4, 4, 1, 1, [10, 20, 30, 255])
    // copy 2×2 region starting at (1,1)
    const copy = copyRegion(cell, 4, 4, 1, 1, 2, 2)
    expect(copy[0]).toBe(10)
    expect(copy[1]).toBe(20)
    expect(copy[2]).toBe(30)
    expect(copy[3]).toBe(255)
  })
  it('returns all zeros for a fully out-of-bounds region', () => {
    const cell = createCell(4, 4)
    const copy = copyRegion(cell, 4, 4, 10, 10, 2, 2)
    expect(Array.from(copy).every(v => v === 0)).toBe(true)
  })
})

describe('clearRegion', () => {
  it('zeroes pixels inside the region', () => {
    const cell = createCell(4, 4)
    paintPixel(cell, 4, 4, 2, 2, [255, 0, 0, 255])
    clearRegion(cell, 4, 4, 2, 2, 2, 2)
    const i = (2 * 4 + 2) * 4
    expect(cell[i + 3]).toBe(0)
  })
  it('leaves pixels outside the region untouched', () => {
    const cell = createCell(4, 4)
    paintPixel(cell, 4, 4, 0, 0, [255, 0, 0, 255])
    clearRegion(cell, 4, 4, 2, 2, 2, 2)
    const i = 0
    expect(cell[i + 3]).toBe(255)
  })
})

// ── compositeFrame ────────────────────────────────────────────────────────

describe('compositeFrame', () => {
  it('single opaque layer passes pixels through unchanged', () => {
    const sp = createSprite({ w: 2, h: 2, frameCount: 1 })
    paintPixel(sp.layers[0].cells[0], 2, 2, 0, 0, [200, 100, 50, 255])
    const img = new ImageData(2, 2)
    compositeFrame(sp, 0, img)
    expect([img.data[0], img.data[1], img.data[2], img.data[3]]).toEqual([200, 100, 50, 255])
  })

  it('hidden layer produces transparent output', () => {
    const sp = createSprite({ w: 2, h: 2, frameCount: 1 })
    paintPixel(sp.layers[0].cells[0], 2, 2, 0, 0, [255, 0, 0, 255])
    // hide the layer
    sp.layers[0].visible = false
    const img = new ImageData(2, 2)
    compositeFrame(sp, 0, img)
    expect(img.data[3]).toBe(0)
  })

  it('fully transparent cell produces transparent output', () => {
    const sp = createSprite({ w: 2, h: 2, frameCount: 1 })
    // cell is all zeros by default
    const img = new ImageData(2, 2)
    compositeFrame(sp, 0, img)
    expect(Array.from(img.data).every(v => v === 0)).toBe(true)
  })

  it('50% opacity layer halves the output alpha', () => {
    const sp = createSprite({ w: 2, h: 2, frameCount: 1 })
    paintPixel(sp.layers[0].cells[0], 2, 2, 0, 0, [255, 0, 0, 255])
    sp.layers[0].opacity = 0.5
    const img = new ImageData(2, 2)
    compositeFrame(sp, 0, img)
    // alpha out = sa + da*(1-sa); sa = 1*0.5 = 0.5, da = 0 → oa = 0.5 → 127/128
    expect(img.data[3]).toBeCloseTo(128, 0)
  })
})

// ── mergeLayerDown ────────────────────────────────────────────────────────

describe('mergeLayerDown', () => {
  let doc: Doc

  beforeEach(() => {
    doc = createBlankDocument()
    const sp = doc.sprites[0]
    doc = addLayer(doc, sp.id, 'Top')
  })

  it('reduces layer count by 1', () => {
    const sp = doc.sprites[0]
    const topId = sp.layers[1].id
    const doc2 = mergeLayerDown(doc, sp.id, topId)
    expect(doc2.sprites[0].layers).toHaveLength(1)
  })

  it('is a no-op for the bottom layer', () => {
    const sp = doc.sprites[0]
    const bottomId = sp.layers[0].id
    const doc2 = mergeLayerDown(doc, sp.id, bottomId)
    expect(doc2.sprites[0].layers).toHaveLength(2)
  })

  it('merged layer composites both layers correctly', () => {
    const sp = doc.sprites[0]
    // paint a red pixel on the bottom layer
    paintPixel(sp.layers[0].cells[0], sp.w, sp.h, 0, 0, [255, 0, 0, 255])
    const topId = sp.layers[1].id
    const doc2 = mergeLayerDown(doc, sp.id, topId)
    const merged = doc2.sprites[0].layers[0]
    // pixel (0,0) in merged cell should be red
    const i = 0
    expect(merged.cells[0][i]).toBe(255)     // R
    expect(merged.cells[0][i + 3]).toBe(255) // A
  })
})

// ── mergeVisibleLayers ────────────────────────────────────────────────────

describe('mergeVisibleLayers', () => {
  let doc: Doc

  beforeEach(() => {
    doc = createBlankDocument()
    const sp = doc.sprites[0]
    doc = addLayer(doc, sp.id, 'Layer 2')
  })

  it('collapses visible layers into one', () => {
    const sp = doc.sprites[0]
    const doc2 = mergeVisibleLayers(doc, sp.id, sp.layers[0].id)
    expect(doc2.sprites[0].layers).toHaveLength(1)
  })

  it('keeps hidden layers untouched', () => {
    const sp = doc.sprites[0]
    // hide the bottom layer
    doc = setLayerVisible(doc, sp.id, sp.layers[0].id, false)
    const sp2 = doc.sprites[0]
    const doc2 = mergeVisibleLayers(doc, sp2.id, sp2.layers[1].id)
    // 1 visible merged into 1, plus 1 hidden = 2 total
    expect(doc2.sprites[0].layers).toHaveLength(2)
  })

  it('is a no-op with only one visible layer', () => {
    const sp = doc.sprites[0]
    doc = setLayerVisible(doc, sp.id, sp.layers[1].id, false)
    const sp2 = doc.sprites[0]
    const doc2 = mergeVisibleLayers(doc, sp2.id, sp2.layers[0].id)
    expect(doc2.sprites[0].layers).toHaveLength(2)
  })
})

// ── gradientFill ──────────────────────────────────────────────────────────

// Helper: read pixel [r,g,b,a] from a cell at (x,y)
const px = (cell: ReturnType<typeof createCell>, w: number, x: number, y: number) => {
  const i = (y * w + x) * 4
  return [cell[i], cell[i + 1], cell[i + 2], cell[i + 3]]
}

describe('gradientFill — linear, no mirror', () => {
  // 4×1 cell, red→blue left-to-right
  const RED = [255, 0, 0, 255] as const
  const BLUE = [0, 0, 255, 255] as const

  it('start pixel gets rgba0', () => {
    const cell = createCell(4, 1)
    gradientFill(cell, 4, 1, 0, 0, 3, 0, RED, BLUE, false)
    expect(px(cell, 4, 0, 0)).toEqual([255, 0, 0, 255])
  })

  it('end pixel gets rgba1', () => {
    const cell = createCell(4, 1)
    gradientFill(cell, 4, 1, 0, 0, 3, 0, RED, BLUE, false)
    expect(px(cell, 4, 3, 0)).toEqual([0, 0, 255, 255])
  })

  it('interpolates midpoint correctly (t=1/3)', () => {
    const cell = createCell(4, 1)
    gradientFill(cell, 4, 1, 0, 0, 3, 0, RED, BLUE, false)
    // t at x=1: ((1)*3)/9 = 1/3
    const [r, , b] = px(cell, 4, 1, 0)
    expect(r).toBe(Math.round(255 * (1 - 1 / 3)))
    expect(b).toBe(Math.round(255 * (1 / 3)))
  })

  it('pixels beyond end are clamped to rgba1', () => {
    // gradient from x=0 to x=1 on a 4-wide cell — x=2,3 clamp to blue
    const cell = createCell(4, 1)
    gradientFill(cell, 4, 1, 0, 0, 1, 0, RED, BLUE, false)
    expect(px(cell, 4, 2, 0)).toEqual([0, 0, 255, 255])
    expect(px(cell, 4, 3, 0)).toEqual([0, 0, 255, 255])
  })
})

describe('gradientFill — radial, no mirror', () => {
  // 3×3 cell, center (1,1), radius to (1,0) = distance 1
  const WHITE = [255, 255, 255, 255] as const
  const BLACK = [0, 0, 0, 255] as const

  it('center pixel gets rgba0', () => {
    const cell = createCell(3, 3)
    gradientFill(cell, 3, 3, 1, 1, 1, 0, WHITE, BLACK, true)
    expect(px(cell, 3, 1, 1)).toEqual([255, 255, 255, 255])
  })

  it('pixel at radius distance gets rgba1', () => {
    const cell = createCell(3, 3)
    gradientFill(cell, 3, 3, 1, 1, 1, 0, WHITE, BLACK, true)
    // distance from (1,1) to (1,0) = 1 = radius → t=1 → BLACK
    expect(px(cell, 3, 1, 0)).toEqual([0, 0, 0, 255])
  })

  it('pixel beyond radius is clamped to rgba1', () => {
    // (0,0): distance = sqrt(2) > 1, clamped to t=1 → BLACK
    const cell = createCell(3, 3)
    gradientFill(cell, 3, 3, 1, 1, 1, 0, WHITE, BLACK, true)
    expect(px(cell, 3, 0, 0)).toEqual([0, 0, 0, 255])
  })
})

describe('gradientFill — vertical mirror (v=true)', () => {
  // 4×1 cell, RED→BLUE from (0,0) to (1,0).
  // Orbits: {(0,0),(3,0)} canonical=(0,0)=red; {(1,0),(2,0)} canonical=(1,0)=blue.
  // Expected: [red, blue, blue, red]
  const RED = [255, 0, 0, 255] as const
  const BLUE = [0, 0, 255, 255] as const

  it('anchor-side pixel (0,0) is red', () => {
    const cell = createCell(4, 1)
    gradientFill(cell, 4, 1, 0, 0, 1, 0, RED, BLUE, false, { v: true, h: false })
    expect(px(cell, 4, 0, 0)).toEqual([255, 0, 0, 255])
  })

  it('mirrored edge (3,0) gets the same color as anchor (0,0)', () => {
    const cell = createCell(4, 1)
    gradientFill(cell, 4, 1, 0, 0, 1, 0, RED, BLUE, false, { v: true, h: false })
    expect(px(cell, 4, 3, 0)).toEqual([255, 0, 0, 255])
  })

  it('inner pixels (1,0) and (2,0) are both blue', () => {
    const cell = createCell(4, 1)
    gradientFill(cell, 4, 1, 0, 0, 1, 0, RED, BLUE, false, { v: true, h: false })
    expect(px(cell, 4, 1, 0)).toEqual([0, 0, 255, 255])
    expect(px(cell, 4, 2, 0)).toEqual([0, 0, 255, 255])
  })

  it('drawing from the opposite corner (3,0) produces the same pixel colors', () => {
    // gradient from right: (3,0)→(2,0), anchor on right side
    const left = createCell(4, 1)
    const right = createCell(4, 1)
    gradientFill(left,  4, 1, 0, 0, 1, 0, RED, BLUE, false, { v: true, h: false })
    gradientFill(right, 4, 1, 3, 0, 2, 0, RED, BLUE, false, { v: true, h: false })
    for (let x = 0; x < 4; x++) {
      expect(px(right, 4, x, 0)).toEqual(px(left, 4, x, 0))
    }
  })
})

describe('gradientFill — horizontal mirror (h=true)', () => {
  // 1×4 cell, RED→BLUE from (0,0) to (0,1).
  // Orbits: {(0,0),(0,3)} canonical=(0,0)=red; {(0,1),(0,2)} canonical=(0,1)=blue.
  // Expected column: [red, blue, blue, red]
  const RED = [255, 0, 0, 255] as const
  const BLUE = [0, 0, 255, 255] as const

  it('anchor-side pixel (0,0) is red', () => {
    const cell = createCell(1, 4)
    gradientFill(cell, 1, 4, 0, 0, 0, 1, RED, BLUE, false, { v: false, h: true })
    expect(px(cell, 1, 0, 0)).toEqual([255, 0, 0, 255])
  })

  it('mirrored edge (0,3) gets the same color as anchor (0,0)', () => {
    const cell = createCell(1, 4)
    gradientFill(cell, 1, 4, 0, 0, 0, 1, RED, BLUE, false, { v: false, h: true })
    expect(px(cell, 1, 0, 3)).toEqual([255, 0, 0, 255])
  })

  it('inner pixels (0,1) and (0,2) are both blue', () => {
    const cell = createCell(1, 4)
    gradientFill(cell, 1, 4, 0, 0, 0, 1, RED, BLUE, false, { v: false, h: true })
    expect(px(cell, 1, 0, 1)).toEqual([0, 0, 255, 255])
    expect(px(cell, 1, 0, 2)).toEqual([0, 0, 255, 255])
  })
})

describe('gradientFill — v+h mirror, 16×16 canvas, corner→center', () => {
  // Diagonal RED→BLUE gradient from each corner toward the opposite center pixel.
  // With v+h mirror the canonical region is always the quadrant containing the
  // anchor, so the gradient fans outward symmetrically.
  //
  // Gradient (0,0)→(8,8): t(x,y)=(x+y)/16. Canonical center pixel=(7,7), t=0.875
  //   → center cluster = [32,0,223,255]. All 4 fills use a 45° diagonal of the
  //   same length, so t values at corresponding canonical pixels are identical.
  const RED  = [255, 0, 0, 255] as const
  const BLUE = [0, 0, 255, 255] as const
  const W = 16, H = 16
  const M = { v: true, h: true }
  // (anchor-corner → center pixel in the same quadrant)
  const CORNER_TO_CENTER: [number,number,number,number][] = [
    [0,  0,  8, 8],   // TL → center+1
    [15, 0,  7, 8],   // TR → center
    [0,  15, 8, 7],   // BL → center
    [15, 15, 7, 7],   // BR → center
  ]

  it('all 4 corners are RED for every corner→center fill', () => {
    for (const [x0,y0,x1,y1] of CORNER_TO_CENTER) {
      const cell = createCell(W, H)
      gradientFill(cell, W, H, x0, y0, x1, y1, RED, BLUE, false, M)
      expect(px(cell, W, 0,  0 )).toEqual([255, 0, 0, 255])
      expect(px(cell, W, 15, 0 )).toEqual([255, 0, 0, 255])
      expect(px(cell, W, 0,  15)).toEqual([255, 0, 0, 255])
      expect(px(cell, W, 15, 15)).toEqual([255, 0, 0, 255])
    }
  })

  it('center cluster (7,7)–(8,8) is [32,0,223,255] for every corner→center fill', () => {
    // t=0.875 at canonical center pixel in all 4 fills
    const C = [32, 0, 223, 255]
    for (const [x0,y0,x1,y1] of CORNER_TO_CENTER) {
      const cell = createCell(W, H)
      gradientFill(cell, W, H, x0, y0, x1, y1, RED, BLUE, false, M)
      expect(px(cell, W, 7, 7)).toEqual(C)
      expect(px(cell, W, 8, 7)).toEqual(C)
      expect(px(cell, W, 7, 8)).toEqual(C)
      expect(px(cell, W, 8, 8)).toEqual(C)
    }
  })

  it('intermediate pixels at canvas edge have correct interpolated color', () => {
    // (0,7): t=(0+7)/16=0.4375 → [143,0,112,255]; mirrors at (15,7),(0,8),(15,8)
    const cell = createCell(W, H)
    gradientFill(cell, W, H, 0, 0, 8, 8, RED, BLUE, false, M)
    const MID = [143, 0, 112, 255]
    expect(px(cell, W,  0, 7)).toEqual(MID)
    expect(px(cell, W, 15, 7)).toEqual(MID)
    expect(px(cell, W,  0, 8)).toEqual(MID)
    expect(px(cell, W, 15, 8)).toEqual(MID)
  })

  it('all 4 corner→center fills produce identical pixel buffers', () => {
    const cells = CORNER_TO_CENTER.map(([x0,y0,x1,y1]) => {
      const cell = createCell(W, H)
      gradientFill(cell, W, H, x0, y0, x1, y1, RED, BLUE, false, M)
      return cell
    })
    for (let i = 1; i < cells.length; i++) expect(cells[i]).toEqual(cells[0])
  })

  it('result is symmetric on both axes', () => {
    const cell = createCell(W, H)
    gradientFill(cell, W, H, 0, 0, 8, 8, RED, BLUE, false, M)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        expect(px(cell, W, x, y)).toEqual(px(cell, W, W-1-x, y))
        expect(px(cell, W, x, y)).toEqual(px(cell, W, x, H-1-y))
      }
    }
  })
})

describe('gradientFill — v+h mirror, 16×16 canvas, center→corner', () => {
  // Reversed: anchor at center, gradient toward matching corner in canonical quadrant.
  // Center cluster = RED (t=0 at anchor). Corners = BLUE (t=1 at far corner).
  // t(0,0) for fill (7,7)→(0,0): (14-0-0)/14 = 1 → BLUE.
  const RED  = [255, 0, 0, 255] as const
  const BLUE = [0, 0, 255, 255] as const
  const W = 16, H = 16
  const M = { v: true, h: true }
  // (center pixel → corner in the same canonical quadrant)
  const CENTER_TO_CORNER: [number,number,number,number][] = [
    [7,  7,  0,  0 ],  // TL center → TL corner
    [8,  7,  15, 0 ],  // TR center → TR corner
    [7,  8,  0,  15],  // BL center → BL corner
    [8,  8,  15, 15],  // BR center → BR corner
  ]

  it('all 4 corners are BLUE for every center→corner fill', () => {
    for (const [x0,y0,x1,y1] of CENTER_TO_CORNER) {
      const cell = createCell(W, H)
      gradientFill(cell, W, H, x0, y0, x1, y1, RED, BLUE, false, M)
      expect(px(cell, W, 0,  0 )).toEqual([0, 0, 255, 255])
      expect(px(cell, W, 15, 0 )).toEqual([0, 0, 255, 255])
      expect(px(cell, W, 0,  15)).toEqual([0, 0, 255, 255])
      expect(px(cell, W, 15, 15)).toEqual([0, 0, 255, 255])
    }
  })

  it('center cluster (7,7)–(8,8) is RED for every center→corner fill', () => {
    for (const [x0,y0,x1,y1] of CENTER_TO_CORNER) {
      const cell = createCell(W, H)
      gradientFill(cell, W, H, x0, y0, x1, y1, RED, BLUE, false, M)
      expect(px(cell, W, 7, 7)).toEqual([255, 0, 0, 255])
      expect(px(cell, W, 8, 7)).toEqual([255, 0, 0, 255])
      expect(px(cell, W, 7, 8)).toEqual([255, 0, 0, 255])
      expect(px(cell, W, 8, 8)).toEqual([255, 0, 0, 255])
    }
  })

  it('intermediate pixels at canvas edge have correct interpolated color', () => {
    // fill (7,7)→(0,0): t at (0,7) = (14-0-7)/14 = 0.5 → [128,0,128,255]
    const cell = createCell(W, H)
    gradientFill(cell, W, H, 7, 7, 0, 0, RED, BLUE, false, M)
    const MID = [128, 0, 128, 255]
    expect(px(cell, W,  0, 7)).toEqual(MID)
    expect(px(cell, W, 15, 7)).toEqual(MID)
    expect(px(cell, W,  0, 8)).toEqual(MID)
    expect(px(cell, W, 15, 8)).toEqual(MID)
  })

  it('all 4 center→corner fills produce identical pixel buffers', () => {
    const cells = CENTER_TO_CORNER.map(([x0,y0,x1,y1]) => {
      const cell = createCell(W, H)
      gradientFill(cell, W, H, x0, y0, x1, y1, RED, BLUE, false, M)
      return cell
    })
    for (let i = 1; i < cells.length; i++) expect(cells[i]).toEqual(cells[0])
  })

  it('result is symmetric on both axes', () => {
    const cell = createCell(W, H)
    gradientFill(cell, W, H, 7, 7, 0, 0, RED, BLUE, false, M)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        expect(px(cell, W, x, y)).toEqual(px(cell, W, W-1-x, y))
        expect(px(cell, W, x, y)).toEqual(px(cell, W, x, H-1-y))
      }
    }
  })
})
