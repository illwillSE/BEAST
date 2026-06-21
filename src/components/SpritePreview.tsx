import { useEffect, useRef } from 'react'
import { compositeFrame } from '../document/model.js'
import type { Sprite } from '../document/model.js'

interface SpritePreviewProps {
  sprite: Sprite
  frameIndex: number
  size: number
  className?: string
}

// Renders one composited frame of a sprite into a small canvas — used as a
// thumbnail in the sprite list and frame timeline. Aspect-fit and centered
// inside a `size`×`size` box so non-square sprites don't distort; the
// checker background shows through transparent pixels.
export default function SpritePreview({ sprite, frameIndex, size, className = '' }: SpritePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { w, h } = sprite

  useEffect(() => {
    const ctx = canvasRef.current!.getContext('2d')!
    const img = ctx.createImageData(w, h)
    compositeFrame(sprite, frameIndex, img)
    ctx.putImageData(img, 0, 0)
  }, [sprite, frameIndex, w, h])

  const scale = Math.min(size / w, size / h)

  return (
    <div
      className={`beast-checker shrink-0 grid place-items-center overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        width={w}
        height={h}
        style={{ width: w * scale, height: h * scale, imageRendering: 'pixelated', display: 'block' }}
      />
    </div>
  )
}
