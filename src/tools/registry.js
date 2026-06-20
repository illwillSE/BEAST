// Tool registry — one entry per painting tool (the BLAST block-registry
// translation). PixelCanvas drives the gesture loop and delegates the actual
// behavior here, so adding a tool is adding an entry, not editing the canvas.
//
// A tool entry implements any of:
//   onStart(ctx)      pointer down. Return true to begin a drag (so onDrag/onEnd
//                     fire); falsy for a one-shot click tool.
//   onDrag(ctx, prev) pointer move during a drag; `prev` is the last cell.
//   onEnd(ctx)        pointer up after a drag.
//   cursor            CSS cursor while the tool is active.
//
// ctx = { x, y, target, color, dispatch, setColor, sampleColor } where x,y are
// in-bounds integer cell coordinates and target = { spriteId, layerId, frameIndex }.

import { hexToRgba } from '../document/model.js'

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

export const tools = {
  pencil: strokeTool((ctx) => hexToRgba(ctx.color)),
  eraser: strokeTool(() => [0, 0, 0, 0]),
  fill: {
    cursor: 'crosshair',
    onStart(ctx) {
      ctx.dispatch({ type: 'FILL', ...ctx.target, x: ctx.x, y: ctx.y, rgba: hexToRgba(ctx.color) })
    },
  },
  eyedropper: {
    cursor: 'copy',
    onStart(ctx) {
      const hex = ctx.sampleColor(ctx.x, ctx.y)
      if (hex) ctx.setColor(hex)
    },
  },
}

export function getTool(id) {
  return tools[id] ?? null
}
