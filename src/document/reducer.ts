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
  outlineObject,
  rectPoints,
  ellipsePoints,
  paintPoints,
  stampPoints,
  gradientFill,
  clearRegion,
  fillRegion,
  pasteRegion,
  flipCellH,
  flipCellV,
  shiftCell,
  rotateCell90,
  adjustHsl,
  renameProject,
  addSprite,
  addSpriteFromImage,
  renameSprite,
  removeSprite,
  moveSprite,
  cropSprite,
  stretchSprite,
  addLayer,
  duplicateLayer,
  removeLayer,
  moveLayer,
  reorderLayer,
  renameLayer,
  setLayerVisible,
  setLayerOpacity,
  setLayerBlendMode,
  mergeLayerDown,
  mergeVisibleLayers,
  flattenSprite,
  addFrame,
  duplicateFrame,
  removeFrame,
  moveFrame,
  reorderFrame,
  addSwatch,
  removeSwatch,
  editSwatch,
  reorderSwatch,
  mergeSwatches,
  setPalette,
  sortPalette,
  reversePalette,
  reseedUid,
} from './model.js'
import type { BlendMode, BrushShape, Cell, CellTarget, CreateSpriteOpts, Doc, Mirror, PaletteSortKey, RGBA, Selection, Sprite } from './model.js'

// An open gesture (STROKE_BEGIN…STROKE_END). `committed` flips true once the
// first edit of the gesture has snapshotted history, so later edits in the same
// gesture coalesce into that one undo step instead of each pushing their own.
interface Stroke {
  committed: boolean
}

type Snapshot = { doc: Doc; selection: Selection | null; label: string }

// past / present / future undo stack; `present` is the live document.
export interface HistoryState {
  past: Snapshot[]
  present: Doc
  selection: Selection | null
  future: Snapshot[]
  stroke: Stroke | null
  // Set on UNDO/REDO so the UI can show a brief toast; seq increments each
  // time so repeated same-action undos still trigger the toast.
  undoRedoTick: { verb: 'undo' | 'redo'; label: string; seq: number } | null
}

// Every action the reducer accepts. The cell-editing actions carry a CellTarget
// (spriteId/layerId/frameIndex) identifying the cell they mutate; CRUD actions
// carry the ids of the sprite/layer/frame they touch.
export type Action =
  | { type: 'REPLACE'; doc: Doc }
  | { type: 'RENAME_PROJECT'; name: string }
  | { type: 'STROKE_BEGIN' }
  | { type: 'STROKE_END' }
  | { type: 'STROKE_CANCEL' }
  | { type: 'ADJUST_HSL'; spriteId: string; layerId: string; frames: number[]; dh: number; ds: number; dv: number; clip?: Selection }
  | (CellTarget & { type: 'PAINT_LINE'; x0: number; y0: number; x1: number; y1: number; rgba: RGBA; size: number; shape: BrushShape; clip?: Selection })
  | (CellTarget & { type: 'FILL'; x: number; y: number; rgba: RGBA; mirror?: Mirror; clip?: Selection })
  | (CellTarget & { type: 'OUTLINE'; x: number; y: number; rgba: RGBA; size: number; shape: BrushShape; fat: boolean; mirror?: Mirror; clip?: Selection })
  | (CellTarget & { type: 'PAINT_RECT'; x0: number; y0: number; x1: number; y1: number; filled: boolean; rgba: RGBA; size: number; shape: BrushShape; clip?: Selection })
  | (CellTarget & { type: 'PAINT_ELLIPSE'; x0: number; y0: number; x1: number; y1: number; filled: boolean; rgba: RGBA; size: number; shape: BrushShape; clip?: Selection })
  | (CellTarget & { type: 'GRADIENT_FILL'; x0: number; y0: number; x1: number; y1: number; rgba0: RGBA; rgba1: RGBA; radial: boolean; mirror?: Mirror; clip?: Selection })
  | (CellTarget & { type: 'FLIP_H'; clip?: Selection })
  | (CellTarget & { type: 'FLIP_V'; clip?: Selection })
  | (CellTarget & { type: 'SHIFT_LAYER'; dx: number; dy: number })
  | (CellTarget & { type: 'ROTATE_90'; clip: Selection; cw: boolean })
  | (CellTarget & { type: 'CLEAR_REGION'; x: number; y: number; w: number; h: number; mask?: Uint8Array })
  | (CellTarget & { type: 'FILL_REGION'; x: number; y: number; w: number; h: number; rgba: RGBA; mask?: Uint8Array })
  | (CellTarget & { type: 'PASTE_REGION'; x: number; y: number; w: number; h: number; data: Cell })
  | { type: 'ADD_SPRITE'; opts?: CreateSpriteOpts }
  | { type: 'ADD_SPRITE_FROM_IMAGE'; name: string; w: number; h: number; cell: Cell }
  | { type: 'RENAME_SPRITE'; spriteId: string; name: string }
  | { type: 'REMOVE_SPRITE'; spriteId: string }
  | { type: 'MOVE_SPRITE'; spriteId: string; delta: number }
  | { type: 'CROP_SPRITE'; spriteId: string; x: number; y: number; w: number; h: number }
  | { type: 'STRETCH_SPRITE'; spriteId: string; w: number; h: number }
  | { type: 'ADD_LAYER'; spriteId: string; name?: string }
  | { type: 'DUPLICATE_LAYER'; spriteId: string; layerId: string }
  | { type: 'REMOVE_LAYER'; spriteId: string; layerId: string }
  | { type: 'MOVE_LAYER'; spriteId: string; layerId: string; delta: number }
  | { type: 'REORDER_LAYER'; spriteId: string; from: number; to: number }
  | { type: 'RENAME_LAYER'; spriteId: string; layerId: string; name: string }
  | { type: 'SET_LAYER_VISIBLE'; spriteId: string; layerId: string; visible: boolean }
  | { type: 'SET_LAYER_OPACITY'; spriteId: string; layerId: string; opacity: number }
  | { type: 'SET_LAYER_BLEND_MODE'; spriteId: string; layerId: string; blendMode: BlendMode }
  | { type: 'MERGE_LAYER_DOWN'; spriteId: string; layerId: string }
  | { type: 'MERGE_VISIBLE_LAYERS'; spriteId: string; layerId: string }
  | { type: 'FLATTEN_SPRITE'; spriteId: string; layerId: string }
  | { type: 'ADD_FRAME'; spriteId: string; atIndex: number }
  | { type: 'DUPLICATE_FRAME'; spriteId: string; frameIndex: number }
  | { type: 'REMOVE_FRAME'; spriteId: string; frameIndex: number }
  | { type: 'MOVE_FRAME'; spriteId: string; frameIndex: number; delta: number }
  | { type: 'REORDER_FRAME'; spriteId: string; from: number; to: number }
  | { type: 'ADD_SWATCH'; hex: string }
  | { type: 'REMOVE_SWATCH'; index: number }
  | { type: 'EDIT_SWATCH'; index: number; hex: string }
  | { type: 'REORDER_SWATCH'; from: number; to: number }
  | { type: 'MERGE_SWATCHES'; colors: string[] }
  | { type: 'SET_PALETTE'; palette: string[] }
  | { type: 'SORT_PALETTE'; key: PaletteSortKey }
  | { type: 'REVERSE_PALETTE' }
  | { type: 'SET_SELECTION'; selection: Selection | null }
  | { type: 'UPDATE_SELECTION'; selection: Selection | null }
  | { type: 'UNDO' }
  | { type: 'REDO' }

const MAX_HISTORY = 200

export function initHistory(doc: Doc): HistoryState {
  return { past: [], present: doc, selection: null, future: [], stroke: null, undoRedoTick: null }
}

// Human-readable label for each history-creating action, shown in the undo toast.
const ACTION_LABELS: Partial<Record<Action['type'], string>> = {
  PAINT_LINE:            'Brush stroke',
  FILL:                  'Fill',
  OUTLINE:               'Outline',
  PAINT_RECT:            'Rectangle',
  PAINT_ELLIPSE:         'Ellipse',
  GRADIENT_FILL:         'Gradient fill',
  FLIP_H:                'Flip horizontal',
  FLIP_V:                'Flip vertical',
  SHIFT_LAYER:           'Shift layer',
  ROTATE_90:             'Rotate',
  CLEAR_REGION:          'Clear',
  FILL_REGION:           'Fill region',
  PASTE_REGION:          'Paste',
  ADJUST_HSL:            'Adjust HSL',
  ADD_SPRITE:            'Add sprite',
  ADD_SPRITE_FROM_IMAGE: 'Import sprite',
  RENAME_SPRITE:         'Rename sprite',
  REMOVE_SPRITE:         'Delete sprite',
  MOVE_SPRITE:           'Reorder sprites',
  CROP_SPRITE:           'Crop canvas',
  STRETCH_SPRITE:        'Scale canvas',
  ADD_LAYER:             'Add layer',
  DUPLICATE_LAYER:       'Duplicate layer',
  REMOVE_LAYER:          'Delete layer',
  MOVE_LAYER:            'Reorder layers',
  REORDER_LAYER:         'Reorder layers',
  RENAME_LAYER:          'Rename layer',
  SET_LAYER_VISIBLE:     'Toggle visibility',
  SET_LAYER_OPACITY:     'Layer opacity',
  SET_LAYER_BLEND_MODE:  'Blend mode',
  MERGE_LAYER_DOWN:      'Merge down',
  MERGE_VISIBLE_LAYERS:  'Merge visible',
  FLATTEN_SPRITE:        'Flatten',
  ADD_FRAME:             'Add frame',
  DUPLICATE_FRAME:       'Duplicate frame',
  REMOVE_FRAME:          'Delete frame',
  MOVE_FRAME:            'Reorder frames',
  REORDER_FRAME:         'Reorder frames',
  ADD_SWATCH:            'Add swatch',
  REMOVE_SWATCH:         'Remove swatch',
  EDIT_SWATCH:           'Edit color',
  REORDER_SWATCH:        'Reorder palette',
  MERGE_SWATCHES:        'Merge colors',
  SET_PALETTE:           'Set palette',
  SORT_PALETTE:          'Sort palette',
  REVERSE_PALETTE:       'Reverse palette',
  RENAME_PROJECT:        'Rename project',
  SET_SELECTION:         'Selection',
}

// Apply an in-place edit to one cell as part of an undo step. The first edit of
// a step snapshots the document and clones the target cell so the snapshot's
// buffer stays frozen while we mutate the copy; the spine is rebuilt every call
// so the sprite gets a new identity and the canvas re-composites.
function editCell(state: HistoryState, { spriteId, layerId, frameIndex }: CellTarget, mutate: (cell: Cell, sprite: Sprite) => void, label: string): HistoryState {
  let { past, present, selection, future, stroke } = state
  const sprite = findSprite(present, spriteId)!
  const startStep = !stroke || !stroke.committed
  let cell = getCell(present, spriteId, layerId, frameIndex)
  if (startStep) {
    cell = cell.slice()
    past = [...past, { doc: present, selection, label }]
    if (past.length > MAX_HISTORY) past = past.slice(past.length - MAX_HISTORY)
    future = []
    if (stroke) stroke = { committed: true }
  }
  mutate(cell, sprite)
  present = replaceCell(present, spriteId, layerId, frameIndex, cell)
  return { past, present, selection, future, stroke, undoRedoTick: state.undoRedoTick }
}

// Apply a whole-document edit as one undo step. Coalesces into the current
// step while a gesture is open (STROKE_BEGIN/END) — used by the opacity
// slider so a single drag is one undo step, like a pencil stroke; CRUD
// actions don't open a gesture, so each one is its own step.
function editDoc(state: HistoryState, mutate: (doc: Doc) => Doc, label: string): HistoryState {
  let { past, present, selection, future, stroke } = state
  const startStep = !stroke || !stroke.committed
  if (startStep) {
    past = [...past, { doc: present, selection, label }]
    if (past.length > MAX_HISTORY) past = past.slice(past.length - MAX_HISTORY)
    future = []
    if (stroke) stroke = { committed: true }
  }
  present = mutate(present)
  return { past, present, selection, future, stroke, undoRedoTick: state.undoRedoTick }
}

export function historyReducer(state: HistoryState, action: Action): HistoryState {
  switch (action.type) {
    // Swap in a whole document (autosave restore / project load) and reset
    // history — there's nothing meaningful to undo back to.
    case 'REPLACE':
      reseedUid(action.doc)
      return initHistory(action.doc)

    case 'RENAME_PROJECT':
      return editDoc(state, (doc) => renameProject(doc, action.name), ACTION_LABELS.RENAME_PROJECT!)

    case 'STROKE_BEGIN':
      return { ...state, stroke: { committed: false } }

    case 'STROKE_END':
      return state.stroke ? { ...state, stroke: null } : state

    // Abandon an open gesture, reverting any edits it made. Used by live-preview
    // dialogs (Adjust HSL) on Cancel: pop the snapshot this gesture pushed back
    // into present without leaving a redo entry. If nothing was painted yet
    // (committed is false), there's no snapshot to pop — just close the gesture.
    case 'STROKE_CANCEL':
      if (!state.stroke) return state
      if (!state.stroke.committed) return { ...state, stroke: null }
      return {
        past: state.past.slice(0, -1),
        present: state.past[state.past.length - 1].doc,
        selection: state.past[state.past.length - 1].selection,
        future: state.future,
        stroke: null,
        undoRedoTick: state.undoRedoTick,
      }

    // Shift hue / scale saturation+value across one or more frames of a layer as
    // a single undo step. Unlike editCell (which clones only the first cell of a
    // step), this touches many cells, so it reads each frame's ORIGINAL pixels
    // from the pre-gesture snapshot and writes a fresh buffer — the snapshot
    // stays intact and each preview tick re-derives from the original rather than
    // compounding on the last.
    case 'ADJUST_HSL': {
      const { spriteId, layerId, frames, dh, ds, dv, clip } = action
      let { past, present, selection, future, stroke } = state
      const startStep = !stroke || !stroke.committed
      const origin = startStep ? present : past[past.length - 1].doc
      if (startStep) {
        past = [...past, { doc: present, selection, label: ACTION_LABELS.ADJUST_HSL! }]
        if (past.length > MAX_HISTORY) past = past.slice(past.length - MAX_HISTORY)
        future = []
        if (stroke) stroke = { committed: true }
      }
      const sp = findSprite(origin, spriteId)!
      for (const f of frames) {
        const out = getCell(origin, spriteId, layerId, f).slice()
        adjustHsl(out, sp.w, sp.h, dh, ds, dv, clip)
        present = replaceCell(present, spriteId, layerId, f, out)
      }
      return { past, present, selection, future, stroke, undoRedoTick: state.undoRedoTick }
    }

    case 'PAINT_LINE': {
      const { x0, y0, x1, y1, rgba, size, shape, clip } = action
      return editCell(state, action, (cell, sp) => paintLine(cell, sp.w, sp.h, x0, y0, x1, y1, rgba, size, shape, clip), ACTION_LABELS.PAINT_LINE!)
    }

    case 'FILL': {
      const { x, y, rgba, mirror, clip } = action
      return editCell(state, action, (cell, sp) => floodFill(cell, sp.w, sp.h, x, y, rgba, mirror, clip), ACTION_LABELS.FILL!)
    }

    case 'OUTLINE': {
      const { x, y, rgba, size, shape, fat, mirror, clip } = action
      return editCell(state, action, (cell, sp) => outlineObject(cell, sp.w, sp.h, x, y, rgba, size, shape, fat, mirror, clip), ACTION_LABELS.OUTLINE!)
    }

    // Width only widens the outline — a filled shape is already solid, so
    // `size` is ignored when `filled` is true.
    case 'PAINT_RECT': {
      const { x0, y0, x1, y1, filled, rgba, size, shape, clip } = action
      const pts = rectPoints(x0, y0, x1, y1, filled)
      return editCell(state, action, (cell, sp) => paintPoints(cell, sp.w, sp.h, filled ? pts : stampPoints(pts, size, shape), rgba, clip), ACTION_LABELS.PAINT_RECT!)
    }

    case 'PAINT_ELLIPSE': {
      const { x0, y0, x1, y1, filled, rgba, size, shape, clip } = action
      const pts = ellipsePoints(x0, y0, x1, y1, filled)
      return editCell(state, action, (cell, sp) => paintPoints(cell, sp.w, sp.h, filled ? pts : stampPoints(pts, size, shape), rgba, clip), ACTION_LABELS.PAINT_ELLIPSE!)
    }

    case 'GRADIENT_FILL': {
      const { x0, y0, x1, y1, rgba0, rgba1, radial, mirror, clip } = action
      return editCell(state, action, (cell, sp) => gradientFill(cell, sp.w, sp.h, x0, y0, x1, y1, rgba0, rgba1, radial, mirror, clip), ACTION_LABELS.GRADIENT_FILL!)
    }

    case 'FLIP_H':
      return editCell(state, action, (cell, sp) => flipCellH(cell, sp.w, sp.h, action.clip), ACTION_LABELS.FLIP_H!)

    case 'FLIP_V':
      return editCell(state, action, (cell, sp) => flipCellV(cell, sp.w, sp.h, action.clip), ACTION_LABELS.FLIP_V!)

    case 'SHIFT_LAYER': {
      const { dx, dy } = action
      return editCell(state, action, (cell, sp) => shiftCell(cell, sp.w, sp.h, dx, dy), ACTION_LABELS.SHIFT_LAYER!)
    }

    case 'ROTATE_90': {
      const { clip, cw } = action
      return editCell(state, action, (cell, sp) => rotateCell90(cell, sp.w, sp.h, clip, cw), ACTION_LABELS.ROTATE_90!)
    }

    // Move/cut lift pixels out of the layer; paste/move-drop writes them back.
    case 'CLEAR_REGION': {
      const { x, y, w: rw, h: rh, mask } = action
      return editCell(state, action, (cell, sp) => clearRegion(cell, sp.w, sp.h, x, y, rw, rh, mask), ACTION_LABELS.CLEAR_REGION!)
    }

    case 'FILL_REGION': {
      const { x, y, w: rw, h: rh, rgba, mask } = action
      return editCell(state, action, (cell, sp) => fillRegion(cell, sp.w, sp.h, x, y, rw, rh, rgba, mask), ACTION_LABELS.FILL_REGION!)
    }

    case 'PASTE_REGION': {
      const { x, y, w: rw, h: rh, data } = action
      return editCell(state, action, (cell, sp) => pasteRegion(cell, sp.w, sp.h, x, y, rw, rh, data), ACTION_LABELS.PASTE_REGION!)
    }

    case 'ADD_SPRITE':
      return editDoc(state, (doc) => addSprite(doc, action.opts), ACTION_LABELS.ADD_SPRITE!)

    case 'ADD_SPRITE_FROM_IMAGE':
      return editDoc(state, (doc) => addSpriteFromImage(doc, action.name, action.w, action.h, action.cell), ACTION_LABELS.ADD_SPRITE_FROM_IMAGE!)

    case 'RENAME_SPRITE':
      return editDoc(state, (doc) => renameSprite(doc, action.spriteId, action.name), ACTION_LABELS.RENAME_SPRITE!)

    case 'REMOVE_SPRITE':
      return editDoc(state, (doc) => removeSprite(doc, action.spriteId), ACTION_LABELS.REMOVE_SPRITE!)

    case 'MOVE_SPRITE':
      return editDoc(state, (doc) => moveSprite(doc, action.spriteId, action.delta), ACTION_LABELS.MOVE_SPRITE!)

    case 'CROP_SPRITE':
      return editDoc(state, (doc) => cropSprite(doc, action.spriteId, action.x, action.y, action.w, action.h), ACTION_LABELS.CROP_SPRITE!)

    case 'STRETCH_SPRITE':
      return editDoc(state, (doc) => stretchSprite(doc, action.spriteId, action.w, action.h), ACTION_LABELS.STRETCH_SPRITE!)

    case 'ADD_LAYER':
      return editDoc(state, (doc) => addLayer(doc, action.spriteId, action.name), ACTION_LABELS.ADD_LAYER!)

    case 'DUPLICATE_LAYER':
      return editDoc(state, (doc) => duplicateLayer(doc, action.spriteId, action.layerId), ACTION_LABELS.DUPLICATE_LAYER!)

    case 'REMOVE_LAYER':
      return editDoc(state, (doc) => removeLayer(doc, action.spriteId, action.layerId), ACTION_LABELS.REMOVE_LAYER!)

    case 'MOVE_LAYER':
      return editDoc(state, (doc) => moveLayer(doc, action.spriteId, action.layerId, action.delta), ACTION_LABELS.MOVE_LAYER!)

    case 'REORDER_LAYER':
      return editDoc(state, (doc) => reorderLayer(doc, action.spriteId, action.from, action.to), ACTION_LABELS.REORDER_LAYER!)

    case 'RENAME_LAYER':
      return editDoc(state, (doc) => renameLayer(doc, action.spriteId, action.layerId, action.name), ACTION_LABELS.RENAME_LAYER!)

    case 'SET_LAYER_VISIBLE':
      return editDoc(state, (doc) => setLayerVisible(doc, action.spriteId, action.layerId, action.visible), ACTION_LABELS.SET_LAYER_VISIBLE!)

    // Coalesced: the slider fires this repeatedly during one drag, bracketed
    // by STROKE_BEGIN/END from the panel, so the drag is a single undo step.
    case 'SET_LAYER_OPACITY':
      return editDoc(state, (doc) => setLayerOpacity(doc, action.spriteId, action.layerId, action.opacity), ACTION_LABELS.SET_LAYER_OPACITY!)

    case 'SET_LAYER_BLEND_MODE':
      return editDoc(state, (doc) => setLayerBlendMode(doc, action.spriteId, action.layerId, action.blendMode), ACTION_LABELS.SET_LAYER_BLEND_MODE!)

    case 'MERGE_LAYER_DOWN':
      return editDoc(state, (doc) => mergeLayerDown(doc, action.spriteId, action.layerId), ACTION_LABELS.MERGE_LAYER_DOWN!)

    case 'MERGE_VISIBLE_LAYERS':
      return editDoc(state, (doc) => mergeVisibleLayers(doc, action.spriteId, action.layerId), ACTION_LABELS.MERGE_VISIBLE_LAYERS!)

    case 'FLATTEN_SPRITE':
      return editDoc(state, (doc) => flattenSprite(doc, action.spriteId, action.layerId), ACTION_LABELS.FLATTEN_SPRITE!)

    case 'ADD_FRAME':
      return editDoc(state, (doc) => addFrame(doc, action.spriteId, action.atIndex), ACTION_LABELS.ADD_FRAME!)

    case 'DUPLICATE_FRAME':
      return editDoc(state, (doc) => duplicateFrame(doc, action.spriteId, action.frameIndex), ACTION_LABELS.DUPLICATE_FRAME!)

    case 'REMOVE_FRAME':
      return editDoc(state, (doc) => removeFrame(doc, action.spriteId, action.frameIndex), ACTION_LABELS.REMOVE_FRAME!)

    case 'MOVE_FRAME':
      return editDoc(state, (doc) => moveFrame(doc, action.spriteId, action.frameIndex, action.delta), ACTION_LABELS.MOVE_FRAME!)

    case 'REORDER_FRAME':
      return editDoc(state, (doc) => reorderFrame(doc, action.spriteId, action.from, action.to), ACTION_LABELS.REORDER_FRAME!)

    case 'ADD_SWATCH':
      return editDoc(state, (doc) => addSwatch(doc, action.hex), ACTION_LABELS.ADD_SWATCH!)

    case 'REMOVE_SWATCH':
      return editDoc(state, (doc) => removeSwatch(doc, action.index), ACTION_LABELS.REMOVE_SWATCH!)

    case 'EDIT_SWATCH':
      return editDoc(state, (doc) => editSwatch(doc, action.index, action.hex), ACTION_LABELS.EDIT_SWATCH!)

    case 'REORDER_SWATCH':
      return editDoc(state, (doc) => reorderSwatch(doc, action.from, action.to), ACTION_LABELS.REORDER_SWATCH!)

    case 'MERGE_SWATCHES':
      return editDoc(state, (doc) => mergeSwatches(doc, action.colors), ACTION_LABELS.MERGE_SWATCHES!)

    case 'SET_PALETTE':
      return editDoc(state, (doc) => setPalette(doc, action.palette), ACTION_LABELS.SET_PALETTE!)

    case 'SORT_PALETTE':
      return editDoc(state, (doc) => sortPalette(doc, action.key), ACTION_LABELS.SORT_PALETTE!)

    case 'REVERSE_PALETTE':
      return editDoc(state, (doc) => reversePalette(doc), ACTION_LABELS.REVERSE_PALETTE!)

    case 'UNDO': {
      if (!state.past.length) return state
      const snap = state.past[state.past.length - 1]
      return {
        past: state.past.slice(0, -1),
        present: snap.doc,
        selection: snap.selection,
        future: [{ doc: state.present, selection: state.selection, label: snap.label }, ...state.future],
        stroke: null,
        undoRedoTick: { verb: 'undo', label: snap.label, seq: (state.undoRedoTick?.seq ?? -1) + 1 },
      }
    }

    case 'REDO': {
      if (!state.future.length) return state
      const snap = state.future[0]
      return {
        past: [...state.past, { doc: state.present, selection: state.selection, label: snap.label }],
        present: snap.doc,
        selection: snap.selection,
        future: state.future.slice(1),
        stroke: null,
        undoRedoTick: { verb: 'redo', label: snap.label, seq: (state.undoRedoTick?.seq ?? -1) + 1 },
      }
    }

    case 'SET_SELECTION': {
      let { past, present, selection } = state
      past = [...past, { doc: present, selection, label: ACTION_LABELS.SET_SELECTION! }]
      if (past.length > MAX_HISTORY) past = past.slice(past.length - MAX_HISTORY)
      return { past, present, selection: action.selection, future: [], stroke: state.stroke, undoRedoTick: state.undoRedoTick }
    }

    case 'UPDATE_SELECTION':
      return { ...state, selection: action.selection }

    default:
      return state
  }
}
