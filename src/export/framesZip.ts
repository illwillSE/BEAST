// Export every frame of a sprite as a ZIP of individually-numbered PNGs
// (one composited frame per entry), reusing the same canvas/compositeFrame
// path as the single-frame PNG export in App.tsx.

import JSZip from 'jszip'
import { compositeFrame } from '../document/model.js'
import type { Sprite } from '../document/model.js'

export async function exportSpriteFramesAsZip(sprite: Sprite): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = sprite.w
  canvas.height = sprite.h
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(sprite.w, sprite.h)

  const zip = new JSZip()
  const pad = String(sprite.frameCount).length
  for (let i = 0; i < sprite.frameCount; i++) {
    compositeFrame(sprite, i, imageData)
    ctx.putImageData(imageData, 0, 0)
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) continue
    zip.file(`frame-${String(i + 1).padStart(pad, '0')}.png`, blob)
  }
  return zip.generateAsync({ type: 'blob' })
}
