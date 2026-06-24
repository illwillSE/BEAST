import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import PixelCanvas from './PixelCanvas.jsx'
import PreviewWindow from './PreviewWindow.jsx'
import ResizeCanvasDialog from './ResizeCanvasDialog.jsx'
import { tools } from '../tools/registry.js'
import BrushSizeButton from './BrushSizeButton.jsx'
import type { Sprite, CellTarget, BrushShape } from '../document/model.js'
import type { Action } from '../document/reducer.js'
import type { Selection, Floating, CropPending, Coord } from '../tools/registry.js'

interface CanvasStageProps {
  tool: string
  fgColor: string
  bgColor: string
  onFgColor: (hex: string) => void
  sprite: Sprite
  target: CellTarget
  dispatch: (action: Action) => void
  selection: Selection | null
  setSelection: (selection: Selection | null) => void
  floating: Floating | null
  setFloating: React.Dispatch<React.SetStateAction<Floating | null>>
  commitFloating: () => void
  cropPending: CropPending | null
  setCropPending: React.Dispatch<React.SetStateAction<CropPending | null>>
  continuousLine: Coord | null
  setContinuousLine: React.Dispatch<React.SetStateAction<Coord | null>>
  filled: boolean
  brushSize: number
  brushShape: BrushShape
  onBrushSize: (value: number) => void
  onBrushShape: (value: BrushShape) => void
  mirrorV: boolean
  mirrorH: boolean
  onTemporaryToolComplete?: () => void
  previewOpen: boolean
  onClosePreview: () => void
  playing: boolean
  onionSkin: boolean
  showGrid: boolean
  gridSpacing: number
}

export interface CanvasStageHandle {
  fitToFrame: () => void
}

// Center stage hosting the working pixel canvas. Document size comes from the
// active sprite; zoom is local. The pencil draws (see PixelCanvas) and the
// checkerboard shows through transparent pixels.
const CanvasStage = forwardRef<CanvasStageHandle, CanvasStageProps>(function CanvasStage({
  tool, fgColor, bgColor, onFgColor, sprite, target, dispatch,
  selection, setSelection, floating, setFloating, commitFloating,
  cropPending, setCropPending, continuousLine, setContinuousLine, filled, brushSize, brushShape, onBrushSize, onBrushShape,
  mirrorV, mirrorH, onTemporaryToolComplete, previewOpen, onClosePreview,
  playing, onionSkin, showGrid, gridSpacing,
}, ref) {
  const [scale, setScale] = useState(16)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [resizeOpen, setResizeOpen] = useState(false)
  const viewportRef = useRef<HTMLDivElement>(null)

  const resizeSprite = (x: number, y: number, w: number, h: number) => {
    dispatch({ type: 'CROP_SPRITE', spriteId: sprite.id, x, y, w, h })
    setResizeOpen(false)
  }

  // Fits the sprite to the viewport, accounting for the viewport's p-6 padding.
  const fitToFrame = () => {
    const el = viewportRef.current
    if (!el) return
    const PADDING = 48
    const availW = el.clientWidth - PADDING
    const availH = el.clientHeight - PADDING
    const next = Math.floor(Math.min(availW / sprite.w, availH / sprite.h))
    setScale(Math.max(1, Math.min(40, next)))
  }

  useImperativeHandle(ref, () => ({ fitToFrame }), [fitToFrame])

  // Scrolls the canvas viewport so the given sprite pixel is centered —
  // used by the Real Preview window's click-to-navigate.
  const scrollToCenter = (spriteX: number, spriteY: number) => {
    const el = viewportRef.current
    if (!el) return
    const targetLeft = spriteX * scale + scale / 2 - el.clientWidth / 2
    const targetTop = spriteY * scale + scale / 2 - el.clientHeight / 2
    el.scrollTo({
      left: Math.max(0, Math.min(targetLeft, el.scrollWidth - el.clientWidth)),
      top: Math.max(0, Math.min(targetTop, el.scrollHeight - el.clientHeight)),
      behavior: 'smooth',
    })
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-bg">
      {/* canvas viewport */}
      <div ref={viewportRef} className="flex-1 grid place-items-center overflow-auto p-6">
        <div className="beast-checker rounded shadow-2xl border border-edge">
          <PixelCanvas
            sprite={sprite}
            frameIndex={target.frameIndex}
            target={target}
            dispatch={dispatch}
            scale={scale}
            fgColor={fgColor}
            bgColor={bgColor}
            onFgColor={onFgColor}
            tool={tool}
            onHover={setPos}
            selection={selection}
            setSelection={setSelection}
            floating={floating}
            setFloating={setFloating}
            commitFloating={commitFloating}
            cropPending={cropPending}
            setCropPending={setCropPending}
            continuousLine={continuousLine}
            setContinuousLine={setContinuousLine}
            filled={filled}
            brushSize={brushSize}
            brushShape={brushShape}
            mirrorV={mirrorV}
            mirrorH={mirrorH}
            onTemporaryToolComplete={onTemporaryToolComplete}
            playing={playing}
            onionSkin={onionSkin}
            showGrid={showGrid}
            gridSpacing={gridSpacing}
          />
        </div>
      </div>

      {/* status bar */}
      <div className="flex items-center gap-4 px-3 h-8 bg-panel border-t border-divider text-[11px] text-faint shrink-0">
        <span
          title="Double-click to resize canvas"
          className="hover:text-muted cursor-default"
          onDoubleClick={() => setResizeOpen(true)}
        >
          {sprite.w} × {sprite.h}
        </span>
        <span className="text-muted capitalize">{tool}</span>
        {tools[tool]?.hasBrushSize && (
          <BrushSizeButton size={brushSize} shape={brushShape} onSize={onBrushSize} onShape={onBrushShape} />
        )}
        <span className="tabular-nums">{pos ? `${pos.x}, ${pos.y}` : '–'}</span>
        <div className="flex-1" />
        <button className="text-muted hover:text-ink" onClick={() => setScale((s) => Math.max(1, s - 2))}>
          <ZoomOut size={14} />
        </button>
        <span className="text-text tabular-nums">{scale * 100}%</span>
        <button className="text-muted hover:text-ink" onClick={() => setScale((s) => Math.min(40, s + 2))}>
          <ZoomIn size={14} />
        </button>
        <button title="Fit to frame" className="text-muted hover:text-ink" onClick={fitToFrame}>
          <Maximize2 size={14} />
        </button>
        <button title="Actual size (100%)" className="text-muted hover:text-ink text-[11px]" onClick={() => setScale(1)}>
          1:1
        </button>
      </div>

      <PreviewWindow
        sprite={sprite}
        frameIndex={target.frameIndex}
        onNavigate={scrollToCenter}
        open={previewOpen}
        onClose={onClosePreview}
      />

      <ResizeCanvasDialog
        open={resizeOpen}
        sprite={sprite}
        onResize={resizeSprite}
        onClose={() => setResizeOpen(false)}
      />
    </div>
  )
})

export default CanvasStage
