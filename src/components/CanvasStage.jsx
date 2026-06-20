import { useState } from 'react'
import { ZoomIn, ZoomOut } from 'lucide-react'
import PixelCanvas from './PixelCanvas.jsx'

// Center stage hosting the working pixel canvas. Document size comes from the
// active sprite; zoom is local. The pencil draws (see PixelCanvas) and the
// checkerboard shows through transparent pixels.
export default function CanvasStage({ tool, color, sprite, target, dispatch }) {
  const [scale, setScale] = useState(16)
  const [pos, setPos] = useState(null)

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-bg">
      {/* canvas viewport */}
      <div className="flex-1 grid place-items-center overflow-auto p-6">
        <div className="beast-checker rounded shadow-2xl border border-edge">
          <PixelCanvas
            sprite={sprite}
            frameIndex={target.frameIndex}
            target={target}
            dispatch={dispatch}
            scale={scale}
            color={color}
            tool={tool}
            onHover={setPos}
          />
        </div>
      </div>

      {/* status bar */}
      <div className="flex items-center gap-4 px-3 h-8 bg-panel border-t border-divider text-[11px] text-faint shrink-0">
        <span>{sprite.w} × {sprite.h}</span>
        <span className="text-muted capitalize">{tool}</span>
        <span className="tabular-nums">{pos ? `${pos.x}, ${pos.y}` : '–'}</span>
        <div className="flex-1" />
        <button className="text-muted hover:text-ink" onClick={() => setScale((s) => Math.max(1, s - 2))}>
          <ZoomOut size={14} />
        </button>
        <span className="text-text tabular-nums">{scale * 100}%</span>
        <button className="text-muted hover:text-ink" onClick={() => setScale((s) => Math.min(40, s + 2))}>
          <ZoomIn size={14} />
        </button>
      </div>
    </div>
  )
}
