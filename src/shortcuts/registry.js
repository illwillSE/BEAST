// Keyboard shortcut registry — the generalized counterpart to the tool
// registry. Each entry matches a key (with optional mod/shift) and runs
// against a ctx, so adding a shortcut is adding an entry, not editing a
// keydown handler. Tool-switch shortcuts are read straight off each tool's
// `key` (see src/tools/registry.js) instead of being duplicated here.
// Pressing a tool's key while that tool is already active cycles its
// `variants` (if any) instead of re-selecting it — e.g. R/O toggle rect and
// ellipse between Outline and Filled.
//
// entry = { key, mod, shift, run(ctx) }
//   key    e.key.toLowerCase(), e.g. 'z', 'escape'
//   mod    require Cmd/Ctrl (default false)
//   shift  require Shift (default false)
//   run    ctx => void; ctx = {
//     dispatch, setTool, tool, filled, setVariant, copySelection,
//     cutSelection, pasteClipboard, commitFloating, setSelection,
//   }

import { tools } from '../tools/registry.js'

const toolShortcuts = Object.entries(tools)
  .filter(([, tool]) => tool.key)
  .map(([id, tool]) => ({
    key: tool.key,
    run(ctx) {
      if (ctx.tool !== id || !tool.variants) { ctx.setTool(id); return }
      const values = tool.variants.map(([, v]) => v)
      const next = values[(values.indexOf(ctx.filled[id] ?? values[0]) + 1) % values.length]
      ctx.setVariant(id, next)
    },
  }))

export const shortcuts = [
  { key: 'z', mod: true, run: (ctx) => ctx.dispatch({ type: 'UNDO' }) },
  { key: 'z', mod: true, shift: true, run: (ctx) => ctx.dispatch({ type: 'REDO' }) },
  { key: 'y', mod: true, run: (ctx) => ctx.dispatch({ type: 'REDO' }) },
  { key: 'c', mod: true, run: (ctx) => ctx.copySelection() },
  { key: 'x', mod: true, run: (ctx) => ctx.cutSelection() },
  { key: 'v', mod: true, run: (ctx) => ctx.pasteClipboard() },
  { key: 'escape', run: (ctx) => { ctx.commitFloating(); ctx.setSelection(null) } },
  ...toolShortcuts,
]

export function matchShortcut(e) {
  const mod = e.metaKey || e.ctrlKey
  const key = e.key.toLowerCase()
  return shortcuts.find((s) => key === s.key && !!s.mod === mod && !!s.shift === e.shiftKey)
}

// Don't fire letter shortcuts while the user is typing into a field (e.g.
// renaming a sprite/layer).
export function isTypingTarget(el) {
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}
