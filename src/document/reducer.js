// History-backed reducer over the pixel document. State is the classic
// past / present / future stack; `present` is the live document. A pencil
// stroke is one undo step: PixelCanvas brackets a drag with STROKE_BEGIN /
// STROKE_END and fires PAINT_LINE in between. The snapshot + cell-clone happen
// lazily on the first paint of a step, so an empty click adds no history.

import { findSprite, getCell, replaceCell, paintLine } from './model.js'

const MAX_HISTORY = 200

export function initHistory(doc) {
  return { past: [], present: doc, future: [], stroke: null }
}

export function historyReducer(state, action) {
  switch (action.type) {
    case 'STROKE_BEGIN':
      return { ...state, stroke: { committed: false } }

    case 'STROKE_END':
      return state.stroke ? { ...state, stroke: null } : state

    case 'PAINT_LINE': {
      const { spriteId, layerId, frameIndex, x0, y0, x1, y1, rgba } = action
      let { past, present, future, stroke } = state
      const sprite = findSprite(present, spriteId)

      // First write of an undo step: snapshot the document and clone the cell
      // so the snapshot's buffer stays frozen while we mutate the copy.
      const startStep = !stroke || !stroke.committed
      let cell = getCell(present, spriteId, layerId, frameIndex)
      if (startStep) {
        cell = cell.slice()
        past = [...past, present]
        if (past.length > MAX_HISTORY) past = past.slice(past.length - MAX_HISTORY)
        future = []
        if (stroke) stroke = { committed: true }
      }

      paintLine(cell, sprite.w, sprite.h, x0, y0, x1, y1, rgba)
      // Rebuild the spine every paint so the sprite gets a new identity and the
      // canvas re-composites; the (mutated) cell buffer is shared throughout.
      present = replaceCell(present, spriteId, layerId, frameIndex, cell)
      return { past, present, future, stroke }
    }

    case 'UNDO': {
      if (!state.past.length) return state
      return {
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1],
        future: [state.present, ...state.future],
        stroke: null,
      }
    }

    case 'REDO': {
      if (!state.future.length) return state
      return {
        past: [...state.past, state.present],
        present: state.future[0],
        future: state.future.slice(1),
        stroke: null,
      }
    }

    default:
      return state
  }
}
