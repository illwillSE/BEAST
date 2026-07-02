// Export the whole project as one tileset PNG: frame 0 of every sprite packed
// into a grid (ceil(sqrt(n)) columns, left-to-right then down). Cells are
// uniform at the largest sprite's size so game engines get a regular grid;
// smaller sprites sit top-left in their cell, transparent elsewhere.

import { compositeFrame } from '../document/model.js'
import type { Doc } from '../document/model.js'

export async function exportTilesetPng(doc: Doc): Promise<Blob> {
  const cellW = Math.max(...doc.sprites.map((sp) => sp.w))
  const cellH = Math.max(...doc.sprites.map((sp) => sp.h))
  const cols = Math.ceil(Math.sqrt(doc.sprites.length))
  const rows = Math.ceil(doc.sprites.length / cols)

  const sheet = document.createElement('canvas')
  sheet.width = cols * cellW
  sheet.height = rows * cellH
  const sheetCtx = sheet.getContext('2d')!

  // Sprites can differ in size, so each gets its own scratch canvas (unlike
  // the single-sprite sheet exporter, which reuses one buffer).
  const scratch = document.createElement('canvas')
  const scratchCtx = scratch.getContext('2d')!
  doc.sprites.forEach((sp, i) => {
    scratch.width = sp.w
    scratch.height = sp.h
    const imageData = scratchCtx.createImageData(sp.w, sp.h)
    compositeFrame(sp, 0, imageData)
    scratchCtx.putImageData(imageData, 0, 0)
    sheetCtx.drawImage(scratch, (i % cols) * cellW, Math.floor(i / cols) * cellH)
  })

  const blob: Blob | null = await new Promise((resolve) => sheet.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Tileset export failed: canvas.toBlob returned null')
  return blob
}
