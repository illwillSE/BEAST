// Tool registry — one entry per painting tool (the BLAST block-registry
// translation). PixelCanvas drives the gesture loop and delegates the actual
// behavior here, so adding a tool is adding an entry, not editing the canvas.
//
// A tool entry implements any of:
//   onStart(ctx)             pointer down. Return a truthy "drag state" value
//                            to begin a drag (so onDrag/onEnd fire, and that
//                            value is threaded back into them); falsy for a
//                            one-shot click tool.
//   onDrag(ctx, prev, drag)  pointer move during a drag; `prev` is the last
//                            cell, `drag` is onStart's return value.
//   onEnd(ctx, drag)         pointer up after a drag.
//   cursor                   CSS cursor while the tool is active.
//   key                      single-letter keyboard shortcut that selects this
//                            tool (see src/shortcuts/registry.js). Pressing it
//                            again while the tool is already active cycles
//                            `variants` instead of a no-op re-select.
//   variants                 optional [label, value][] of sub-options shown
//                            as a flyout in ToolRail and cycled by repeat
//                            presses of `key` (e.g. rect/ellipse Outline ↔
//                            Filled).
//   hasBrushSize             marks a tool as consuming the global brush
//                            size/shape (stepped by `[`/`]`, picked via the
//                            BrushSizeButton popover); reaches the tool as
//                            ctx.brushSize / ctx.brushShape.
//

// ctx = {
//   x, y, target, fgColor, bgColor, dispatch, setFgColor, sampleColor, w, h,
//   filled, brushSize, brushShape, setPreview, selection, setSelection, floating, setFloating,
//   commitFloating, getRawCell, cropPending, setCropPending,
// } where x,y are in-bounds integer cell coordinates and target =
// { spriteId, layerId, frameIndex }. `dispatch` mirrors actions across the
// active symmetry axes (see PixelCanvas), so tools just dispatch normally.

import type { Dispatch, SetStateAction } from 'react'
import {
  hexToRgba, linePoints, rectPoints, ellipsePoints, copyRegion, stampPoints,
} from '../document/model.js'
import type { BrushShape, Cell, CellTarget, Point, RGBA } from '../document/model.js'
import type { Action } from '../document/reducer.js'

// A rectangular region in cell coordinates (selection / crop window / paste box).
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

// A region lifted off the layer and floating on top until committed (move/paste).
export interface Floating extends Rect {
  data: Cell
  target: CellTarget
}

// A drawn-but-not-yet-applied crop rectangle (commits on Enter / tool switch).
export interface CropPending extends Rect {
  target: CellTarget
}

// Live overlay the active tool asks PixelCanvas to draw mid-gesture: a pixel
// shape preview, the dashed marquee for select/crop, or a dashed line (gradient).
export type Preview =
  | { kind: 'pixels'; points: Point[]; color: string }
  | { kind: 'marquee'; rect: Rect }
  | { kind: 'line'; x0: number; y0: number; x1: number; y1: number }

// An [x, y] cell coordinate as the gesture loop threads it (the previous cell).
interface Coord {
  x: number
  y: number
}

// The context PixelCanvas builds per pointer event and hands to the active tool.
export interface ToolContext {
  x: number
  y: number
  target: CellTarget
  fgColor: string
  bgColor: string
  dispatch: (action: Action) => void
  setFgColor: (hex: string) => void
  sampleColor: (x: number, y: number) => string | null
  w: number
  h: number
  filled: boolean
  brushSize: number
  brushShape: BrushShape
  setPreview: (preview: Preview | null) => void
  shiftKey: boolean
  selection: Rect | null
  setSelection: (rect: Rect | null) => void
  floating: Floating | null
  setFloating: Dispatch<SetStateAction<Floating | null>>
  commitFloating: () => void
  getRawCell: () => Cell
  cropPending: CropPending | null
  setCropPending: Dispatch<SetStateAction<CropPending | null>>
}

// One painting tool. `D` is the per-tool "drag state" onStart returns and the
// gesture loop threads back into onDrag/onEnd; tools that don't drag return a
// falsy value. Each registry entry uses its own D, so the `tools` map below is
// typed Tool<any>.
export interface Tool<D = unknown> {
  cursor?: string
  key?: string
  variants?: [string, boolean][]
  hasBrushSize?: true
  onStart?(ctx: ToolContext): D | boolean | void
  onDrag?(ctx: ToolContext, prev: Coord, drag: D): void
  onEnd?(ctx: ToolContext, drag: D): void
}

// Pencil/eraser share a continuous-line stroke; one undo step per drag.
function strokeTool(rgbaFor: (ctx: ToolContext) => RGBA): Tool<boolean> {
  return {
    cursor: 'crosshair',
    onStart(ctx) {
      ctx.dispatch({ type: 'STROKE_BEGIN' })
      ctx.dispatch({ type: 'PAINT_LINE', ...ctx.target, x0: ctx.x, y0: ctx.y, x1: ctx.x, y1: ctx.y, rgba: rgbaFor(ctx), size: ctx.brushSize, shape: ctx.brushShape })
      return true
    },
    onDrag(ctx, prev) {
      ctx.dispatch({ type: 'PAINT_LINE', ...ctx.target, x0: prev.x, y0: prev.y, x1: ctx.x, y1: ctx.y, rgba: rgbaFor(ctx), size: ctx.brushSize, shape: ctx.brushShape })
    },
    onEnd(ctx) {
      ctx.dispatch({ type: 'STROKE_END' })
    },
  }
}

// One-shot committing tools (fill/line/rect/ellipse/gradient) bracket their
// commit in a STROKE so that, when symmetry mirroring turns one dispatch into
// several, all of them land in a single undo step instead of one each.
function commitBracketed(ctx: ToolContext, action: Action) {
  ctx.dispatch({ type: 'STROKE_BEGIN' })
  ctx.dispatch(action)
  ctx.dispatch({ type: 'STROKE_END' })
}

// Shift-constrain a dragged corner to a square (rect → square, ellipse →
// circle): clamps both axes to the larger delta, keeping each axis' sign.
function constrainSquare(x0: number, y0: number, x1: number, y1: number): [number, number] {
  const dx = x1 - x0
  const dy = y1 - y0
  const size = Math.max(Math.abs(dx), Math.abs(dy))
  return [x0 + Math.sign(dx || 1) * size, y0 + Math.sign(dy || 1) * size]
}

function normalizeRect(x0: number, y0: number, x1: number, y1: number): Rect {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0) + 1,
    h: Math.abs(y1 - y0) + 1,
  }
}

export const tools: Record<string, Tool<any>> = {
  pencil: { key: 'b', hasBrushSize: true, ...strokeTool((ctx) => hexToRgba(ctx.fgColor)) },
  eraser: { key: 'e', hasBrushSize: true, ...strokeTool(() => [0, 0, 0, 0]) },

  fill: {
    key: 'g',
    cursor: 'crosshair',
    onStart(ctx) {
      commitBracketed(ctx, { type: 'FILL', ...ctx.target, x: ctx.x, y: ctx.y, rgba: hexToRgba(ctx.fgColor) })
    },
  },

  // Gradient: drag from fg color (start) to bg color (end), filling the
  // flood-connected region from the start pixel — same region rule as Fill.
  gradient: {
    key: 'n',
    cursor: 'crosshair',
    onStart(ctx) {
      return { x0: ctx.x, y0: ctx.y }
    },
    onDrag(ctx, _prev, start) {
      ctx.setPreview({ kind: 'line', x0: start.x0, y0: start.y0, x1: ctx.x, y1: ctx.y })
    },
    onEnd(ctx, start) {
      commitBracketed(ctx, {
        type: 'GRADIENT_FILL', ...ctx.target,
        x0: start.x0, y0: start.y0, x1: ctx.x, y1: ctx.y,
        rgba0: hexToRgba(ctx.fgColor), rgba1: hexToRgba(ctx.bgColor),
      })
      ctx.setPreview(null)
    },
  },

  eyedropper: {
    key: 'i',
    cursor: 'copy',
    onStart(ctx) {
      const hex = ctx.sampleColor(ctx.x, ctx.y)
      if (hex) ctx.setFgColor(hex)
    },
  },

  line: {
    key: 'l',
    hasBrushSize: true,
    cursor: 'crosshair',
    onStart(ctx) {
      return { x0: ctx.x, y0: ctx.y }
    },
    onDrag(ctx, _prev, start) {
      const pts = stampPoints(linePoints(start.x0, start.y0, ctx.x, ctx.y), ctx.brushSize, ctx.brushShape)
      ctx.setPreview({ kind: 'pixels', points: pts, color: ctx.fgColor })
    },
    onEnd(ctx, start) {
      commitBracketed(ctx, {
        type: 'PAINT_LINE', ...ctx.target,
        x0: start.x0, y0: start.y0, x1: ctx.x, y1: ctx.y,
        rgba: hexToRgba(ctx.fgColor), size: ctx.brushSize, shape: ctx.brushShape,
      })
      ctx.setPreview(null)
    },
  },

  rect: {
    key: 'r',
    variants: [['Outline', false], ['Filled', true]],
    hasBrushSize: true,
    cursor: 'crosshair',
    onStart(ctx) {
      return { x0: ctx.x, y0: ctx.y }
    },
    onDrag(ctx, _prev, start) {
      const [x1, y1] = ctx.shiftKey ? constrainSquare(start.x0, start.y0, ctx.x, ctx.y) : [ctx.x, ctx.y]
      const pts = rectPoints(start.x0, start.y0, x1, y1, ctx.filled)
      ctx.setPreview({ kind: 'pixels', points: ctx.filled ? pts : stampPoints(pts, ctx.brushSize, ctx.brushShape), color: ctx.fgColor })
    },
    onEnd(ctx, start) {
      const [x1, y1] = ctx.shiftKey ? constrainSquare(start.x0, start.y0, ctx.x, ctx.y) : [ctx.x, ctx.y]
      commitBracketed(ctx, {
        type: 'PAINT_RECT', ...ctx.target,
        x0: start.x0, y0: start.y0, x1, y1, filled: ctx.filled,
        rgba: hexToRgba(ctx.fgColor), size: ctx.brushSize, shape: ctx.brushShape,
      })
      ctx.setPreview(null)
    },
  },

  ellipse: {
    key: 'o',
    variants: [['Outline', false], ['Filled', true]],
    hasBrushSize: true,
    cursor: 'crosshair',
    onStart(ctx) {
      return { x0: ctx.x, y0: ctx.y }
    },
    onDrag(ctx, _prev, start) {
      const [x1, y1] = ctx.shiftKey ? constrainSquare(start.x0, start.y0, ctx.x, ctx.y) : [ctx.x, ctx.y]
      const pts = ellipsePoints(start.x0, start.y0, x1, y1, ctx.filled)
      ctx.setPreview({ kind: 'pixels', points: ctx.filled ? pts : stampPoints(pts, ctx.brushSize, ctx.brushShape), color: ctx.fgColor })
    },
    onEnd(ctx, start) {
      const [x1, y1] = ctx.shiftKey ? constrainSquare(start.x0, start.y0, ctx.x, ctx.y) : [ctx.x, ctx.y]
      commitBracketed(ctx, {
        type: 'PAINT_ELLIPSE', ...ctx.target,
        x0: start.x0, y0: start.y0, x1, y1, filled: ctx.filled,
        rgba: hexToRgba(ctx.fgColor), size: ctx.brushSize, shape: ctx.brushShape,
      })
      ctx.setPreview(null)
    },
  },

  // Rectangular marquee. Starting a new selection flushes any pending
  // move/paste first, since a selection only makes sense for one at a time.
  select: {
    key: 'm',
    cursor: 'crosshair',
    onStart(ctx) {
      ctx.commitFloating()
      return { x0: ctx.x, y0: ctx.y }
    },
    onDrag(ctx, _prev, start) {
      ctx.setPreview({ kind: 'marquee', rect: normalizeRect(start.x0, start.y0, ctx.x, ctx.y) })
    },
    onEnd(ctx, start) {
      ctx.setSelection(normalizeRect(start.x0, start.y0, ctx.x, ctx.y))
      ctx.setPreview(null)
    },
  },

  // Crop (or extend) the canvas to a dragged rectangle — same marquee gesture
  // as select, but the rect doesn't apply on release: it becomes a pending
  // crop window (ctx.cropPending) that stays editable. Dragging from inside
  // the pending window moves it; dragging from outside redraws it. It commits
  // (CROP_SPRITE) on Enter or on switching away from the crop tool, and
  // cancels on Escape (see App's commitCrop/cancelCrop). Dragging past an
  // edge extends the canvas there (transparent); dragging inside crops away
  // everything outside the rect.
  crop: {
    key: 'c',
    cursor: 'crosshair',
    onStart(ctx) {
      ctx.commitFloating()
      const p = ctx.cropPending
      if (p && ctx.x >= p.x && ctx.y >= p.y && ctx.x < p.x + p.w && ctx.y < p.y + p.h) {
        return { mode: 'move', dx: ctx.x - p.x, dy: ctx.y - p.y }
      }
      return { mode: 'draw', x0: ctx.x, y0: ctx.y }
    },
    onDrag(ctx, _prev, drag) {
      if (drag.mode === 'move') {
        ctx.setCropPending((p) => (p ? { ...p, x: ctx.x - drag.dx, y: ctx.y - drag.dy } : p))
        return
      }
      ctx.setPreview({ kind: 'marquee', rect: normalizeRect(drag.x0, drag.y0, ctx.x, ctx.y) })
    },
    onEnd(ctx, drag) {
      if (drag.mode === 'move') return
      ctx.setCropPending({ ...normalizeRect(drag.x0, drag.y0, ctx.x, ctx.y), target: ctx.target })
      ctx.setPreview(null)
    },
  },

  // Drag the current selection: first grab lifts its pixels into a floating
  // buffer (clearing the source in the layer); it stays floating — movable by
  // further drags — until something commits it (see App's commitFloating).
  move: {
    key: 'v',
    cursor: 'move',
    onStart(ctx) {
      if (ctx.floating) {
        return { dx: ctx.x - ctx.floating.x, dy: ctx.y - ctx.floating.y }
      }
      const sel = ctx.selection
      if (!sel || ctx.x < sel.x || ctx.y < sel.y || ctx.x >= sel.x + sel.w || ctx.y >= sel.y + sel.h) return false
      const data = copyRegion(ctx.getRawCell(), ctx.w, ctx.h, sel.x, sel.y, sel.w, sel.h)
      ctx.dispatch({ type: 'CLEAR_REGION', ...ctx.target, x: sel.x, y: sel.y, w: sel.w, h: sel.h })
      ctx.setFloating({ x: sel.x, y: sel.y, w: sel.w, h: sel.h, data, target: ctx.target })
      return { dx: ctx.x - sel.x, dy: ctx.y - sel.y }
    },
    onDrag(ctx, _prev, drag) {
      ctx.setFloating((f) => (f ? { ...f, x: ctx.x - drag.dx, y: ctx.y - drag.dy } : f))
    },
  },
}

export function getTool(id: string): Tool<any> | null {
  return tools[id] ?? null
}
