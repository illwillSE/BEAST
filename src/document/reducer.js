// History-backed reducer over the pixel document. State is the classic
// past / present / future stack; `present` is the live document. A pencil
// stroke is one undo step: PixelCanvas brackets a drag with STROKE_BEGIN /
// STROKE_END and fires PAINT_LINE in between. The snapshot + cell-clone happen
// lazily on the first paint of a step, so an empty click adds no history.

import {
  findSprite,
  getCell,
  replaceCell,
  paintLine,
  floodFill,
  rectPoints,
  ellipsePoints,
  paintPoints,
  gradientFill,
  clearRegion,
  pasteRegion,
  addSprite,
  renameSprite,
  removeSprite,
  moveSprite,
  addLayer,
  duplicateLayer,
  removeLayer,
  moveLayer,
  setLayerVisible,
  setLayerOpacity,
  addFrame,
  duplicateFrame,
  removeFrame,
  moveFrame,
  reseedUid,
} from './model.js'

const MAX_HISTORY = 200

export function initHistory(doc) {
  return { past: [], present: doc, future: [], stroke: null }
}

// Apply an in-place edit to one cell as part of an undo step. The first edit of
// a step snapshots the document and clones the target cell so the snapshot's
// buffer stays frozen while we mutate the copy; the spine is rebuilt every call
// so the sprite gets a new identity and the canvas re-composites.
function editCell(state, { spriteId, layerId, frameIndex }, mutate) {
  let { past, present, future, stroke } = state
  const sprite = findSprite(present, spriteId)
  const startStep = !stroke || !stroke.committed
  let cell = getCell(present, spriteId, layerId, frameIndex)
  if (startStep) {
    cell = cell.slice()
    past = [...past, present]
    if (past.length > MAX_HISTORY) past = past.slice(past.length - MAX_HISTORY)
    future = []
    if (stroke) stroke = { committed: true }
  }
  mutate(cell, sprite)
  present = replaceCell(present, spriteId, layerId, frameIndex, cell)
  return { past, present, future, stroke }
}

// Apply a whole-document edit as one undo step. Coalesces into the current
// step while a gesture is open (STROKE_BEGIN/END) — used by the opacity
// slider so a single drag is one undo step, like a pencil stroke; CRUD
// actions don't open a gesture, so each one is its own step.
function editDoc(state, mutate) {
  let { past, present, future, stroke } = state
  const startStep = !stroke || !stroke.committed
  if (startStep) {
    past = [...past, present]
    if (past.length > MAX_HISTORY) past = past.slice(past.length - MAX_HISTORY)
    future = []
    if (stroke) stroke = { committed: true }
  }
  present = mutate(present)
  return { past, present, future, stroke }
}

export function historyReducer(state, action) {
  switch (action.type) {
    // Swap in a whole document (autosave restore / project load) and reset
    // history — there's nothing meaningful to undo back to.
    case 'REPLACE':
      reseedUid(action.doc)
      return initHistory(action.doc)

    case 'STROKE_BEGIN':
      return { ...state, stroke: { committed: false } }

    case 'STROKE_END':
      return state.stroke ? { ...state, stroke: null } : state

    case 'PAINT_LINE': {
      const { x0, y0, x1, y1, rgba } = action
      return editCell(state, action, (cell, sp) => paintLine(cell, sp.w, sp.h, x0, y0, x1, y1, rgba))
    }

    case 'FILL': {
      const { x, y, rgba } = action
      return editCell(state, action, (cell, sp) => floodFill(cell, sp.w, sp.h, x, y, rgba))
    }

    case 'PAINT_RECT': {
      const { x0, y0, x1, y1, filled, rgba } = action
      return editCell(state, action, (cell, sp) => paintPoints(cell, sp.w, sp.h, rectPoints(x0, y0, x1, y1, filled), rgba))
    }

    case 'PAINT_ELLIPSE': {
      const { x0, y0, x1, y1, filled, rgba } = action
      return editCell(state, action, (cell, sp) => paintPoints(cell, sp.w, sp.h, ellipsePoints(x0, y0, x1, y1, filled), rgba))
    }

    case 'GRADIENT_FILL': {
      const { x0, y0, x1, y1, rgba } = action
      return editCell(state, action, (cell, sp) => gradientFill(cell, sp.w, sp.h, x0, y0, x1, y1, rgba))
    }

    // Move/cut lift pixels out of the layer; paste/move-drop writes them back.
    case 'CLEAR_REGION': {
      const { x, y, w: rw, h: rh } = action
      return editCell(state, action, (cell, sp) => clearRegion(cell, sp.w, sp.h, x, y, rw, rh))
    }

    case 'PASTE_REGION': {
      const { x, y, w: rw, h: rh, data } = action
      return editCell(state, action, (cell, sp) => pasteRegion(cell, sp.w, sp.h, x, y, rw, rh, data))
    }

    case 'ADD_SPRITE':
      return editDoc(state, (doc) => addSprite(doc, action.opts))

    case 'RENAME_SPRITE':
      return editDoc(state, (doc) => renameSprite(doc, action.spriteId, action.name))

    case 'REMOVE_SPRITE':
      return editDoc(state, (doc) => removeSprite(doc, action.spriteId))

    case 'MOVE_SPRITE':
      return editDoc(state, (doc) => moveSprite(doc, action.spriteId, action.delta))

    case 'ADD_LAYER':
      return editDoc(state, (doc) => addLayer(doc, action.spriteId, action.name))

    case 'DUPLICATE_LAYER':
      return editDoc(state, (doc) => duplicateLayer(doc, action.spriteId, action.layerId))

    case 'REMOVE_LAYER':
      return editDoc(state, (doc) => removeLayer(doc, action.spriteId, action.layerId))

    case 'MOVE_LAYER':
      return editDoc(state, (doc) => moveLayer(doc, action.spriteId, action.layerId, action.delta))

    case 'SET_LAYER_VISIBLE':
      return editDoc(state, (doc) => setLayerVisible(doc, action.spriteId, action.layerId, action.visible))

    // Coalesced: the slider fires this repeatedly during one drag, bracketed
    // by STROKE_BEGIN/END from the panel, so the drag is a single undo step.
    case 'SET_LAYER_OPACITY':
      return editDoc(state, (doc) => setLayerOpacity(doc, action.spriteId, action.layerId, action.opacity))

    case 'ADD_FRAME':
      return editDoc(state, (doc) => addFrame(doc, action.spriteId, action.atIndex))

    case 'DUPLICATE_FRAME':
      return editDoc(state, (doc) => duplicateFrame(doc, action.spriteId, action.frameIndex))

    case 'REMOVE_FRAME':
      return editDoc(state, (doc) => removeFrame(doc, action.spriteId, action.frameIndex))

    case 'MOVE_FRAME':
      return editDoc(state, (doc) => moveFrame(doc, action.spriteId, action.frameIndex, action.delta))

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
