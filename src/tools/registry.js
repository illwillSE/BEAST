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
//
// ctx = {
//   x, y, target, color, dispatch, setColor, sampleColor, w, h, filled,
//   setPreview, selection, setSelection, floating, setFloating,
//   commitFloating, getRawCell,
// } where x,y are in-bounds integer cell coordinates and target =
// { spriteId, layerId, frameIndex }. `dispatch` mirrors actions across the
// active symmetry axes (see PixelCanvas), so tools just dispatch normally.

import {
  hexToRgba, linePoints, rectPoints, ellipsePoints, copyRegion,
} from '../document/model.js'

// Pencil/eraser share a continuous-line stroke; one undo step per drag.
function strokeTool(rgbaFor) {
  return {
    cursor: 'crosshair',
    onStart(ctx) {
      ctx.dispatch({ type: 'STROKE_BEGIN' })
      ctx.dispatch({ type: 'PAINT_LINE', ...ctx.target, x0: ctx.x, y0: ctx.y, x1: ctx.x, y1: ctx.y, rgba: rgbaFor(ctx) })
      return true
    },
    onDrag(ctx, prev) {
      ctx.dispatch({ type: 'PAINT_LINE', ...ctx.target, x0: prev.x, y0: prev.y, x1: ctx.x, y1: ctx.y, rgba: rgbaFor(ctx) })
    },
    onEnd(ctx) {
      ctx.dispatch({ type: 'STROKE_END' })
    },
  }
}

// One-shot committing tools (fill/line/rect/ellipse/gradient) bracket their
// commit in a STROKE so that, when symmetry mirroring turns one dispatch into
// several, all of them land in a single undo step instead of one each.
function commitBracketed(ctx, action) {
  ctx.dispatch({ type: 'STROKE_BEGIN' })
  ctx.dispatch(action)
  ctx.dispatch({ type: 'STROKE_END' })
}

function normalizeRect(x0, y0, x1, y1) {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0) + 1,
    h: Math.abs(y1 - y0) + 1,
  }
}

export const tools = {
  pencil: strokeTool((ctx) => hexToRgba(ctx.color)),
  eraser: strokeTool(() => [0, 0, 0, 0]),

  fill: {
    cursor: 'crosshair',
    onStart(ctx) {
      commitBracketed(ctx, { type: 'FILL', ...ctx.target, x: ctx.x, y: ctx.y, rgba: hexToRgba(ctx.color) })
    },
  },

  // Gradient: drag from full color (start) to transparent (end), filling the
  // flood-connected region from the start pixel — same region rule as Fill.
  gradient: {
    cursor: 'crosshair',
    onStart(ctx) {
      return { x0: ctx.x, y0: ctx.y }
    },
    onDrag(ctx, _prev, start) {
      ctx.setPreview({ kind: 'pixels', points: linePoints(start.x0, start.y0, ctx.x, ctx.y), color: ctx.color })
    },
    onEnd(ctx, start) {
      commitBracketed(ctx, {
        type: 'GRADIENT_FILL', ...ctx.target,
        x0: start.x0, y0: start.y0, x1: ctx.x, y1: ctx.y,
        rgba: hexToRgba(ctx.color),
      })
      ctx.setPreview(null)
    },
  },

  eyedropper: {
    cursor: 'copy',
    onStart(ctx) {
      const hex = ctx.sampleColor(ctx.x, ctx.y)
      if (hex) ctx.setColor(hex)
    },
  },

  line: {
    cursor: 'crosshair',
    onStart(ctx) {
      return { x0: ctx.x, y0: ctx.y }
    },
    onDrag(ctx, _prev, start) {
      ctx.setPreview({ kind: 'pixels', points: linePoints(start.x0, start.y0, ctx.x, ctx.y), color: ctx.color })
    },
    onEnd(ctx, start) {
      commitBracketed(ctx, {
        type: 'PAINT_LINE', ...ctx.target,
        x0: start.x0, y0: start.y0, x1: ctx.x, y1: ctx.y,
        rgba: hexToRgba(ctx.color),
      })
      ctx.setPreview(null)
    },
  },

  rect: {
    cursor: 'crosshair',
    onStart(ctx) {
      return { x0: ctx.x, y0: ctx.y }
    },
    onDrag(ctx, _prev, start) {
      ctx.setPreview({ kind: 'pixels', points: rectPoints(start.x0, start.y0, ctx.x, ctx.y, ctx.filled), color: ctx.color })
    },
    onEnd(ctx, start) {
      commitBracketed(ctx, {
        type: 'PAINT_RECT', ...ctx.target,
        x0: start.x0, y0: start.y0, x1: ctx.x, y1: ctx.y, filled: ctx.filled,
        rgba: hexToRgba(ctx.color),
      })
      ctx.setPreview(null)
    },
  },

  ellipse: {
    cursor: 'crosshair',
    onStart(ctx) {
      return { x0: ctx.x, y0: ctx.y }
    },
    onDrag(ctx, _prev, start) {
      ctx.setPreview({ kind: 'pixels', points: ellipsePoints(start.x0, start.y0, ctx.x, ctx.y, ctx.filled), color: ctx.color })
    },
    onEnd(ctx, start) {
      commitBracketed(ctx, {
        type: 'PAINT_ELLIPSE', ...ctx.target,
        x0: start.x0, y0: start.y0, x1: ctx.x, y1: ctx.y, filled: ctx.filled,
        rgba: hexToRgba(ctx.color),
      })
      ctx.setPreview(null)
    },
  },

  // Rectangular marquee. Starting a new selection flushes any pending
  // move/paste first, since a selection only makes sense for one at a time.
  select: {
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

  // Drag the current selection: first grab lifts its pixels into a floating
  // buffer (clearing the source in the layer); it stays floating — movable by
  // further drags — until something commits it (see App's commitFloating).
  move: {
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

export function getTool(id) {
  return tools[id] ?? null
}
