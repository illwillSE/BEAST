// Export every frame of a sprite as one sprite-sheet PNG: a single row, all
// frames left to right, reusing the same compositeFrame path as the
// single-frame PNG export in App.tsx.

import { compositeFrame } from '../document/model.js'
import type { Sprite } from '../document/model.js'

export async function exportSpriteAsSheet(sprite: Sprite): Promise<Blob> {
  const frameCanvas = document.createElement('canvas')
  frameCanvas.width = sprite.w
  frameCanvas.height = sprite.h
  const frameCtx = frameCanvas.getContext('2d')!
  const imageData = frameCtx.createImageData(sprite.w, sprite.h)

  const sheet = document.createElement('canvas')
  sheet.width = sprite.w * sprite.frameCount
  sheet.height = sprite.h
  const sheetCtx = sheet.getContext('2d')!

  for (let i = 0; i < sprite.frameCount; i++) {
    compositeFrame(sprite, i, imageData)
    frameCtx.putImageData(imageData, 0, 0)
    sheetCtx.drawImage(frameCanvas, i * sprite.w, 0)
  }

  const blob: Blob | null = await new Promise((resolve) => sheet.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Sprite sheet export failed: canvas.toBlob returned null')
  return blob
}
