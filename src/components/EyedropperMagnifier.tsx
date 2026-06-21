import { createPortal } from 'react-dom'
import { getColor } from '../theme/colors.js'
import { rgbaToHex } from '../document/model.js'
import type { RGBA } from '../document/model.js'

// Radius (in cells) of the pixel grid sampled around the cursor; the grid is
// (2*MAG_RADIUS+1) cells square. Exported so PixelCanvas samples the matching size.
export const MAG_RADIUS = 3
const GRID = MAG_RADIUS * 2 + 1
const CELL = 12
// Reserve enough width for the longest possible readout line ("255, 255, 255",
// wider than any hex line) so the panel doesn't resize as digit counts change
// between samples — only ever grows to fit the grid, never the text.
const TEXT_WIDTH = 96

interface EyedropperMagnifierProps {
  clientX: number
  clientY: number
  pixels: (RGBA | null)[]
}

// Floating zoomed-pixel readout shown next to the cursor while the eyedropper
// tool is active, so picking a color doesn't require squinting at a single
// screen pixel. Portaled to <body> (fixed position) so it's never clipped by
// the scrollable canvas viewport.
export default function EyedropperMagnifier({ clientX, clientY, pixels }: EyedropperMagnifierProps) {
  const grid = GRID * CELL
  const center = pixels[Math.floor(pixels.length / 2)]
  const hasColor = center !== null && center[3] > 0
  const pad = 8
  const width = Math.max(grid, TEXT_WIDTH) + pad * 2
  const height = grid + pad * 2 + 34

  let left = clientX + 18
  let top = clientY + 18
  if (left + width > window.innerWidth) left = clientX - width - 18
  if (top + height > window.innerHeight) top = clientY - height - 18

  return createPortal(
    <div
      className="fixed z-50 pointer-events-none rounded border shadow-2xl beast-checker"
      style={{ left, top, width, padding: pad, background: getColor('panel'), borderColor: getColor('edge') }}
    >
      <div className="relative beast-checker mx-auto" style={{ width: grid, height: grid }}>
        {pixels.map((rgba, i) => {
          const gx = i % GRID
          const gy = Math.floor(i / GRID)
          const isCenter = gx === MAG_RADIUS && gy === MAG_RADIUS
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: gx * CELL,
                top: gy * CELL,
                width: CELL,
                height: CELL,
                background: rgba ? `rgba(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${rgba[3] / 255})` : undefined,
                outline: isCenter ? `1.5px solid ${getColor('accent-bright')}` : undefined,
                outlineOffset: isCenter ? -1.5 : undefined,
              }}
            />
          )
        })}
      </div>
      <div
        className="mt-1.5 text-[11px] text-center tabular-nums leading-tight"
        style={{ color: getColor('ink-soft'), whiteSpace: 'nowrap', overflow: 'hidden' }}
      >
        <div>{hasColor ? rgbaToHex(center!) : '—'}</div>
        <div>{hasColor ? `${center![0]}, ${center![1]}, ${center![2]}` : 'transparent'}</div>
      </div>
    </div>,
    document.body,
  )
}
