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
//   onMove(ctx)              pointer move while *not* dragging; for tools that
//                            need a hover preview between clicks rather than
//                            mid-drag (e.g. the line tool's Continuous variant).
//   cursor                   CSS cursor while the tool is active; a string or
//                            a function of the hovered cell's ctx for tools
//                            whose cursor depends on position (e.g. crop's
//                            resize handles).
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
//   continuousLine, setContinuousLine,
// } where x,y are in-bounds integer cell coordinates and target =
// { spriteId, layerId, frameIndex }. `dispatch` mirrors actions across the
// active symmetry axes (see PixelCanvas), so tools just dispatch normally.

import type { Dispatch, SetStateAction } from 'react'
import {
  hexToRgba, linePoints, rectPoints, ellipsePoints, copyRegion, stampPoints, gradientFillPreview, selectionContains,
} from '../document/model.js'
import type { BrushShape, Cell, CellTarget, Point, RGBA, Selection } from '../document/model.js'
import type { Action } from '../document/reducer.js'

export type { Selection } from '../document/model.js'

// A rectangular region in cell coordinates (selection / crop window / paste box).
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

// A region lifted off the layer and floating on top until committed (move/paste).
// `mask` carries through a non-rectangular source selection (see move's
// onStart) so the marquee can keep tracing the actual selected shape, rather
// than the data buffer's alpha (which would trace the artwork's own
// transparent pixels instead of the selection boundary).
export interface Floating extends Rect {
  data: Cell
  target: CellTarget
  mask?: Uint8Array
}

// A drawn-but-not-yet-applied crop rectangle (commits on Enter / tool switch).
export interface CropPending extends Rect {
  target: CellTarget
}

// Live overlay the active tool asks PixelCanvas to draw mid-gesture: a pixel
// shape preview, the dashed marquee for select/crop, or a dashed line (gradient).
export type Preview =
  | { kind: 'pixels'; points: Point[]; color: string }
  | { kind: 'erase'; points: Point[] }
  | { kind: 'marquee'; rect: Rect }
  | { kind: 'line'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'gradient'; points: Point[]; colors: RGBA[]; x0: number; y0: number; x1: number; y1: number }

// An [x, y] cell coordinate as the gesture loop threads it (the previous
// cell), also reused as the pending anchor point for continuous line mode.
export interface Coord {
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
  eraseToBg: boolean
  dispatch: (action: Action) => void
  setFgColor: (hex: string) => void
  sampleColor: (x: number, y: number) => string | null
  w: number
  h: number
  scale: number
  filled: boolean
  brushSize: number
  brushShape: BrushShape
  setPreview: (preview: Preview | null) => void
  shiftKey: boolean
  erasing: boolean
  selection: Selection | null
  setSelection: (selection: Selection | null) => void
  floating: Floating | null
  setFloating: Dispatch<SetStateAction<Floating | null>>
  commitFloating: () => void
  getRawCell: () => Cell
  cropPending: CropPending | null
  setCropPending: Dispatch<SetStateAction<CropPending | null>>
  continuousLine: Coord | null
  setContinuousLine: Dispatch<SetStateAction<Coord | null>>
}

// One painting tool. `D` is the per-tool "drag state" onStart returns and the
// gesture loop threads back into onDrag/onEnd; tools that don't drag return a
// falsy value. Each registry entry uses its own D, so the `tools` map below is
// typed Tool<any>.
export interface Tool<D = unknown> {
  cursor?: string | ((ctx: ToolContext) => string)
  key?: string
  variants?: [string, boolean][]
  hasBrushSize?: true
  onStart?(ctx: ToolContext): D | boolean | void
  onDrag?(ctx: ToolContext, prev: Coord, drag: D): void
  onEnd?(ctx: ToolContext, drag: D): void
  // Pointer move while *not* dragging — for tools that need a hover preview
  // between clicks rather than during a drag (continuous line mode).
  onMove?(ctx: ToolContext): void
}

// The color the eraser paints with — bg color if "erase to background" is
// on, transparent otherwise.
function eraseColor(ctx: ToolContext): RGBA {
  return ctx.eraseToBg ? hexToRgba(ctx.bgColor) : [0, 0, 0, 0]
}

// Right-click paints with the erase color instead of fg color, for any tool
// that resolves its paint color this way (pencil, fill, line, rect, ellipse) —
// so each tool keeps its own shape logic and just lands a different color.
function paintColor(ctx: ToolContext): RGBA {
  return ctx.erasing ? eraseColor(ctx) : hexToRgba(ctx.fgColor)
}

// Shape-preview helper for line/rect/ellipse: mirrors paintColor, but a
// right-click erase-to-transparent preview can't show its real (invisible)
// result, so it renders as a checkerboard instead (see PixelCanvas).
function shapePreview(ctx: ToolContext, points: Point[]): Preview {
  if (ctx.erasing && !ctx.eraseToBg) return { kind: 'erase', points }
  return { kind: 'pixels', points, color: ctx.erasing ? ctx.bgColor : ctx.fgColor }
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

// Crop resize handles: one per edge/corner of the pending crop rect. Hit
// radius is a fixed CSS-pixel tolerance converted to cells via the current
// zoom, so handles stay easy to grab at any scale instead of shrinking to
// nothing when zoomed in or ballooning when zoomed out.
type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const HANDLE_HIT_PX = 6

const HANDLE_CURSORS: Record<CropHandle, string> = {
  n: 'ns-resize', s: 'ns-resize',
  e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize',
  nw: 'nwse-resize', se: 'nwse-resize',
}

const HANDLE_DIRS: Record<CropHandle, { h?: 'l' | 'r'; v?: 't' | 'b' }> = {
  n: { v: 't' }, s: { v: 'b' }, e: { h: 'r' }, w: { h: 'l' },
  ne: { h: 'r', v: 't' }, nw: { h: 'l', v: 't' }, se: { h: 'r', v: 'b' }, sw: { h: 'l', v: 'b' },
}

// Which handle (if any) the cell (ctx.x, ctx.y) is within grabbing range of.
function cropHandleAt(ctx: ToolContext, p: Rect): CropHandle | null {
  const r = Math.max(1, Math.round(HANDLE_HIT_PX / ctx.scale))
  const left = p.x, right = p.x + p.w - 1, top = p.y, bottom = p.y + p.h - 1
  const nearLeft = Math.abs(ctx.x - left) <= r
  const nearRight = Math.abs(ctx.x - right) <= r
  const nearTop = Math.abs(ctx.y - top) <= r
  const nearBottom = Math.abs(ctx.y - bottom) <= r
  if (nearTop && nearLeft) return 'nw'
  if (nearTop && nearRight) return 'ne'
  if (nearBottom && nearLeft) return 'sw'
  if (nearBottom && nearRight) return 'se'
  const inX = ctx.x >= left - r && ctx.x <= right + r
  const inY = ctx.y >= top - r && ctx.y <= bottom + r
  if (nearTop && inX) return 'n'
  if (nearBottom && inX) return 's'
  if (nearLeft && inY) return 'w'
  if (nearRight && inY) return 'e'
  return null
}

// Recompute a rect dragging one edge/corner of `orig` to (x, y); the opposite
// edge(s) stay anchored in place.
function resizeRect(orig: Rect, handle: CropHandle, x: number, y: number): Rect {
  const dir = HANDLE_DIRS[handle]
  const left = orig.x, right = orig.x + orig.w - 1, top = orig.y, bottom = orig.y + orig.h - 1
  const x0 = dir.h === 'l' ? x : left
  const x1 = dir.h === 'r' ? x : right
  const y0 = dir.v === 't' ? y : top
  const y1 = dir.v === 'b' ? y : bottom
  return normalizeRect(x0, y0, x1, y1)
}

export const tools: Record<string, Tool<any>> = {
  pencil: { key: 'b', hasBrushSize: true, ...strokeTool((ctx) => paintColor(ctx)) },
  eraser: { key: 'e', hasBrushSize: true, ...strokeTool((ctx) => eraseColor(ctx)) },

  fill: {
    key: 'g',
    cursor: 'crosshair',
    onStart(ctx) {
      commitBracketed(ctx, { type: 'FILL', ...ctx.target, x: ctx.x, y: ctx.y, rgba: paintColor(ctx) })
    },
  },

  // Gradient: drag from fg color (start) to bg color (end), filling the
  // flood-connected region from the start pixel — same region rule as Fill.
  // Linear fades along the drag vector; radial fades by distance from the
  // start point, with drag length setting the radius.
  gradient: {
    key: 'n',
    variants: [['Linear', false], ['Radial', true]],
    cursor: 'crosshair',
    onStart(ctx) {
      return { x0: ctx.x, y0: ctx.y }
    },
    onDrag(ctx, _prev, start) {
      const region = gradientFillPreview(
        ctx.getRawCell(), ctx.w, ctx.h, start.x0, start.y0, ctx.x, ctx.y,
        hexToRgba(ctx.fgColor), hexToRgba(ctx.bgColor), ctx.filled,
      )
      ctx.setPreview({
        kind: 'gradient',
        points: region.map(({ x, y }): Point => [x, y]),
        colors: region.map((p) => p.rgba),
        x0: start.x0, y0: start.y0, x1: ctx.x, y1: ctx.y,
      })
    },
    onEnd(ctx, start) {
      commitBracketed(ctx, {
        type: 'GRADIENT_FILL', ...ctx.target,
        x0: start.x0, y0: start.y0, x1: ctx.x, y1: ctx.y,
        rgba0: hexToRgba(ctx.fgColor), rgba1: hexToRgba(ctx.bgColor), radial: ctx.filled,
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

  // Continuous variant: each click commits a segment and starts the next one
  // from where it ended, instead of dragging a single line. Ended by Escape
  // or switching away from the tool/variant (see App's continuousLine effects).
  line: {
    key: 'l',
    hasBrushSize: true,
    variants: [['Single', false], ['Continuous', true]],
    cursor: 'crosshair',
    onStart(ctx) {
      if (!ctx.filled) return { x0: ctx.x, y0: ctx.y }
      const anchor = ctx.continuousLine
      if (anchor) {
        commitBracketed(ctx, {
          type: 'PAINT_LINE', ...ctx.target,
          x0: anchor.x, y0: anchor.y, x1: ctx.x, y1: ctx.y,
          rgba: paintColor(ctx), size: ctx.brushSize, shape: ctx.brushShape,
        })
      }
      ctx.setContinuousLine({ x: ctx.x, y: ctx.y })
      ctx.setPreview(null)
      return false
    },
    onMove(ctx) {
      if (!ctx.filled || !ctx.continuousLine) return
      const pts = stampPoints(linePoints(ctx.continuousLine.x, ctx.continuousLine.y, ctx.x, ctx.y), ctx.brushSize, ctx.brushShape)
      ctx.setPreview(shapePreview(ctx, pts))
    },
    onDrag(ctx, _prev, start) {
      const pts = stampPoints(linePoints(start.x0, start.y0, ctx.x, ctx.y), ctx.brushSize, ctx.brushShape)
      ctx.setPreview(shapePreview(ctx, pts))
    },
    onEnd(ctx, start) {
      commitBracketed(ctx, {
        type: 'PAINT_LINE', ...ctx.target,
        x0: start.x0, y0: start.y0, x1: ctx.x, y1: ctx.y,
        rgba: paintColor(ctx), size: ctx.brushSize, shape: ctx.brushShape,
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
      ctx.setPreview(shapePreview(ctx, ctx.filled ? pts : stampPoints(pts, ctx.brushSize, ctx.brushShape)))
    },
    onEnd(ctx, start) {
      const [x1, y1] = ctx.shiftKey ? constrainSquare(start.x0, start.y0, ctx.x, ctx.y) : [ctx.x, ctx.y]
      commitBracketed(ctx, {
        type: 'PAINT_RECT', ...ctx.target,
        x0: start.x0, y0: start.y0, x1, y1, filled: ctx.filled,
        rgba: paintColor(ctx), size: ctx.brushSize, shape: ctx.brushShape,
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
      ctx.setPreview(shapePreview(ctx, ctx.filled ? pts : stampPoints(pts, ctx.brushSize, ctx.brushShape)))
    },
    onEnd(ctx, start) {
      const [x1, y1] = ctx.shiftKey ? constrainSquare(start.x0, start.y0, ctx.x, ctx.y) : [ctx.x, ctx.y]
      commitBracketed(ctx, {
        type: 'PAINT_ELLIPSE', ...ctx.target,
        x0: start.x0, y0: start.y0, x1, y1, filled: ctx.filled,
        rgba: paintColor(ctx), size: ctx.brushSize, shape: ctx.brushShape,
      })
      ctx.setPreview(null)
    },
  },

  // Outlines the 8-connected object touching the click — a seldom-used tool,
  // reachable only from the command palette (no rail icon, no shortcut key).
  // Fine/Fat picks the border's connectivity: Fine (4-connected) hugs tighter
  // on sparse/dot art but leaves ordinary shapes' corners open; Fat
  // (8-connected) keeps every outline's corners closed, at the cost of a
  // diagonally-touching pair's border bridging the gap between them.
  outline: {
    hasBrushSize: true,
    variants: [['Fine', false], ['Fat', true]],
    cursor: 'crosshair',
    onStart(ctx) {
      commitBracketed(ctx, {
        type: 'OUTLINE', ...ctx.target, x: ctx.x, y: ctx.y,
        rgba: hexToRgba(ctx.fgColor), size: ctx.brushSize, shape: ctx.brushShape, fat: ctx.filled,
      })
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
  // the pending window moves it; dragging an edge/corner handle resizes it;
  // dragging from outside redraws it. It commits (CROP_SPRITE) on Enter or on
  // switching away from the crop tool, and cancels on Escape (see App's
  // commitCrop/cancelCrop). Dragging past an edge extends the canvas there
  // (transparent); dragging inside crops away everything outside the rect.
  crop: {
    key: 'c',
    cursor(ctx) {
      const p = ctx.cropPending
      if (!p) return 'crosshair'
      const handle = cropHandleAt(ctx, p)
      if (handle) return HANDLE_CURSORS[handle]
      if (ctx.x >= p.x && ctx.y >= p.y && ctx.x < p.x + p.w && ctx.y < p.y + p.h) return 'move'
      return 'crosshair'
    },
    onStart(ctx) {
      ctx.commitFloating()
      const p = ctx.cropPending
      if (p) {
        const handle = cropHandleAt(ctx, p)
        if (handle) return { mode: 'resize', handle, orig: p }
        if (ctx.x >= p.x && ctx.y >= p.y && ctx.x < p.x + p.w && ctx.y < p.y + p.h) {
          return { mode: 'move', dx: ctx.x - p.x, dy: ctx.y - p.y }
        }
      }
      return { mode: 'draw', x0: ctx.x, y0: ctx.y }
    },
    onDrag(ctx, _prev, drag) {
      if (drag.mode === 'move') {
        ctx.setCropPending((p) => (p ? { ...p, x: ctx.x - drag.dx, y: ctx.y - drag.dy } : p))
        return
      }
      if (drag.mode === 'resize') {
        ctx.setCropPending((p) => (p ? { ...resizeRect(drag.orig, drag.handle, ctx.x, ctx.y), target: p.target } : p))
        return
      }
      ctx.setPreview({ kind: 'marquee', rect: normalizeRect(drag.x0, drag.y0, ctx.x, ctx.y) })
    },
    onEnd(ctx, drag) {
      if (drag.mode === 'move' || drag.mode === 'resize') return
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
      if (!sel || !selectionContains(sel, ctx.x, ctx.y)) return false
      const data = copyRegion(ctx.getRawCell(), ctx.w, ctx.h, sel.x, sel.y, sel.w, sel.h, sel.mask)
      ctx.dispatch({ type: 'CLEAR_REGION', ...ctx.target, x: sel.x, y: sel.y, w: sel.w, h: sel.h, mask: sel.mask })
      ctx.setFloating({ x: sel.x, y: sel.y, w: sel.w, h: sel.h, data, target: ctx.target, mask: sel.mask })
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
