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
//
// ctx = {
//   x, y, target, color, dispatch, setColor, sampleColor, w, h, filled,
//   setPreview, selection, setSelection, floating, setFloating,
//   commitFloating, getRawCell, cropPending, setCropPending,
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
  pencil: { key: 'b', ...strokeTool((ctx) => hexToRgba(ctx.color)) },
  eraser: { key: 'e', ...strokeTool(() => [0, 0, 0, 0]) },

  fill: {
    key: 'g',
    cursor: 'crosshair',
    onStart(ctx) {
      commitBracketed(ctx, { type: 'FILL', ...ctx.target, x: ctx.x, y: ctx.y, rgba: hexToRgba(ctx.color) })
    },
  },

  // Gradient: drag from full color (start) to transparent (end), filling the
  // flood-connected region from the start pixel — same region rule as Fill.
  gradient: {
    key: 'n',
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
    key: 'i',
    cursor: 'copy',
    onStart(ctx) {
      const hex = ctx.sampleColor(ctx.x, ctx.y)
      if (hex) ctx.setColor(hex)
    },
  },

  line: {
    key: 'l',
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
    key: 'r',
    variants: [['Outline', false], ['Filled', true]],
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
    key: 'o',
    variants: [['Outline', false], ['Filled', true]],
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

export function getTool(id) {
  return tools[id] ?? null
}
