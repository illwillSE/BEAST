import { describe, it, expect, beforeEach } from 'vitest'
import {
  hexToRgba, rgbaToHex,
  rgbToHsv, hsvToRgb,
  linePoints,
  createCell, createBlankDocument, createSprite,
  paintPixel, floodFill,
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
