// Keyboard shortcut registry — the generalized counterpart to the tool
// registry. Each entry matches a key (with optional mod/shift) and runs
// against a ctx, so adding a shortcut is adding an entry, not editing a
// keydown handler. Tool-switch shortcuts are read straight off each tool's
// `key` (see src/tools/registry.js) instead of being duplicated here.
// Pressing a tool's key while that tool is already active cycles its
// `variants` (if any) instead of re-selecting it — e.g. R/O toggle rect and
// ellipse between Outline and Filled. `[`/`]` step the global brush size
// down/up while a brush-size tool is active (pencil/eraser/line/rect/ellipse).
//
// entry = { key, mod, shift, run(ctx) }
//   key    e.key.toLowerCase(), e.g. 'z', 'escape'
//   mod    require Cmd/Ctrl (default false)
//   shift  require Shift (default false)
//   run    ctx => void; ctx = {
//     dispatch, setTool, setTemporaryTool, tool, filled, setVariant,
//     brushSize, setBrushSize, copySelection,
//     cutSelection, pasteClipboard, commitFloating, setSelection,
//     commitCrop, cancelCrop, swapColors, stepFrame,
//   }
//
// brushSize/setBrushSize are global now (one value for every brush-size tool,
// not per-tool) — `[`/`]` step it by 1, clamped to [1, 20], only when the
// active tool has `hasBrushSize` (see src/tools/registry.js).

import { tools } from '../tools/registry.js'
import type { Action } from '../document/reducer.js'
import type { Rect } from '../tools/registry.js'

export interface ShortcutContext {
  dispatch: (action: Action) => void
  setTool: (id: string) => void
  setTemporaryTool: (id: string) => void
  tool: string
  filled: Record<string, boolean>
  setVariant: (id: string, value: boolean) => void
  brushSize: number
  setBrushSize: (value: number) => void
  copySelection: () => void
  cutSelection: () => void
  pasteClipboard: () => void
  commitFloating: () => void
  setSelection: (rect: Rect | null) => void
  commitCrop: () => void
  cancelCrop: () => void
  swapColors: () => void
  stepFrame: (delta: number) => void
}

interface Shortcut {
  key: string
  mod?: boolean
  shift?: boolean
  run(ctx: ShortcutContext): void
}

const toolShortcuts: Shortcut[] = Object.entries(tools)
  .filter(([, tool]) => tool.key)
  .map(([id, tool]) => ({
    key: tool.key as string,
    run(ctx) {
      if (ctx.tool !== id || !tool.variants) { ctx.setTool(id); return }
      const values = tool.variants.map(([, v]) => v)
      const next = values[(values.indexOf(ctx.filled[id] ?? values[0]) + 1) % values.length]
      ctx.setVariant(id, next)
    },
  }))

// Step the global brush width down (-1) or up (+1), clamped to [1, 20]; a
// no-op while the active tool doesn't use brush size (fill, select, move, ...).
function stepBrushSize(ctx: ShortcutContext, delta: number) {
  if (!tools[ctx.tool]?.hasBrushSize) return
  ctx.setBrushSize(Math.max(1, Math.min(20, ctx.brushSize + delta)))
}

export const shortcuts: Shortcut[] = [
  { key: 'z', mod: true, run: (ctx) => ctx.dispatch({ type: 'UNDO' }) },
  { key: 'z', mod: true, shift: true, run: (ctx) => ctx.dispatch({ type: 'REDO' }) },
  { key: 'y', mod: true, run: (ctx) => ctx.dispatch({ type: 'REDO' }) },
  { key: 'c', mod: true, run: (ctx) => ctx.copySelection() },
  { key: 'x', mod: true, run: (ctx) => ctx.cutSelection() },
  { key: 'v', mod: true, run: (ctx) => ctx.pasteClipboard() },
  { key: 'enter', run: (ctx) => { ctx.commitFloating(); ctx.commitCrop() } },
  { key: 'escape', run: (ctx) => { ctx.commitFloating(); ctx.setSelection(null); ctx.cancelCrop() } },
  { key: 'i', shift: true, run: (ctx) => ctx.setTemporaryTool('eyedropper') },
  { key: 'x', run: (ctx) => ctx.swapColors() },
  { key: '[', run: (ctx) => stepBrushSize(ctx, -1) },
  { key: ']', run: (ctx) => stepBrushSize(ctx, 1) },
  { key: 'arrowleft', run: (ctx) => ctx.stepFrame(-1) },
  { key: 'arrowright', run: (ctx) => ctx.stepFrame(1) },
  ...toolShortcuts,
]

export function matchShortcut(e: KeyboardEvent): Shortcut | undefined {
  const mod = e.metaKey || e.ctrlKey
  const key = e.key.toLowerCase()
  return shortcuts.find((s) => key === s.key && !!s.mod === mod && !!s.shift === e.shiftKey)
}

// Don't fire letter shortcuts while the user is typing into a field (e.g.
// renaming a sprite/layer).
export function isTypingTarget(el: EventTarget | null): boolean {
  const tag = (el as HTMLElement)?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement)?.isContentEditable
}
