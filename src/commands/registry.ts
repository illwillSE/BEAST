// Command registry — the third registry alongside the tool registry
// (src/tools/registry.ts) and shortcut registry (src/shortcuts/registry.ts).
// Each entry is one searchable action in the command palette (Cmd/Ctrl+P).
// Commands run against a CommandContext, which extends the ShortcutContext
// with the document-CRUD / file / toggle operations the palette also needs —
// so a command is one entry calling a semantic ctx method, never a new
// implementation of behavior that already lives in App.
//
// Tool-switch commands are generated off the tool registry (like
// shortcuts/registry.ts builds its tool shortcuts), so adding a tool adds its
// palette command for free.

import { tools } from '../tools/registry.js'
import type { ShortcutContext } from '../shortcuts/registry.js'
import type { CellTarget, Sprite } from '../document/model.js'

export interface CommandContext extends ShortcutContext {
  // Read state, for enable guards and titles.
  target: CellTarget
  activeSprite: Sprite
  spriteCount: number
  canUndo: boolean
  canRedo: boolean
  hasSelection: boolean
  hasClipboard: boolean
  hasSavedSelection: boolean
  saveSelection(): void
  loadSavedSelection(): void
  palette: string[]
  setFgColor(hex: string): void
  fillSelectionToFg(): void
  flipH(): void
  flipV(): void
  rotate90(cw: boolean): void
  // Layers (selection-follow handled in App).
  addLayer(): void
  duplicateLayer(): void
  removeLayer(): void
  moveLayer(delta: number): void
  mergeLayerDown(): void
  mergeVisibleLayers(): void
  flattenImage(): void
  // Frames.
  addFrame(): void
  duplicateFrame(): void
  removeFrame(): void
  moveFrame(delta: number): void
  // Sprites.
  addSprite(): void
  removeSprite(): void
  // File.
  newProject(): void
  saveProject(): void
  exportPng(): void
  exportFramesZip(): void
  exportSpriteSheet(): void
  openProject(): void
  importPng(): void
  importColors(): void
  importColorsFromCanvas(): void
  importPalette(): void
  openClassicPalettes(): void
  openAdjustHsl(): void
  // View / toggles.
  toggleMirrorV(): void
  toggleMirrorH(): void
  togglePlay(): void
  toggleOnionSkin(): void
  togglePreview(): void
  toggleGradient(): void
  toggleGrid(): void
  setGridSpacing(n: number): void
  openSettings(): void
}

// Parameterized commands match a raw query string (e.g. "brush 3", "col 1",
// "rgb 000000"), extract a typed argument, and surface as a single synthesized
// row in the palette with a dynamic label reflecting the effective outcome.
export interface ParamCommand<A> {
  pattern: RegExp
  parse(raw: string): A | null  // null = arg isn't usable yet → fall through to fuzzy search
  preview(arg: A, ctx: CommandContext): string
  disabledReason?(arg: A, ctx: CommandContext): string | null
  run(arg: A, ctx: CommandContext): void
}

export interface Command {
  id: string
  title: string
  category: string
  keywords?: string
  shortcut?: string // display-only hint
  enabled?(ctx: CommandContext): boolean
  // A command with a submenu is a group: activating it opens its children
  // (browse mode) instead of running. `run` is a no-op for groups.
  submenu?: Command[]
  run(ctx: CommandContext): void
  // Present only on parameterized commands. When set, this command is kept out
  // of filterCommands/browse and only surfaces via matchParamCommand.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  param?: ParamCommand<any>
}

// Display names per tool id (the Tool registry entries carry no label — those
// live in ToolRail's static list; kept in sync here).
const TOOL_LABELS: Record<string, string> = {
  pencil: 'Pencil', eraser: 'Eraser', fill: 'Fill', gradient: 'Gradient',
  eyedropper: 'Eyedropper', line: 'Line', rect: 'Rectangle', ellipse: 'Ellipse',
  outline: 'Outline', select: 'Select', selectColor: 'Select Color', crop: 'Crop', move: 'Move', stretch: 'Stretch',
}

// Extra search terms per tool, so a different name finds the same command
// (e.g. "circle" → the Ellipse commands).
const TOOL_ALIASES: Record<string, string> = { ellipse: 'circle', rect: 'square' }

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
const mod = (k: string) => (isMac ? '⌘' + k : 'Ctrl+' + k)
const modShift = (k: string) => (isMac ? '⌘⇧' + k : 'Ctrl+Shift+' + k)

const layerIndex = (ctx: CommandContext) =>
  ctx.activeSprite.layers.findIndex((l) => l.id === ctx.target.layerId)

// One command per tool. Tools with variants (rect/ellipse Outline·Filled, line
// Single·Continuous, gradient Linear·Radial — the options the ToolRail flyouts
// expose) become a group whose submenu holds one command per variant; the
// palette shows the group with a › arrow (browse) and flattens to the variant
// commands on search (see searchCommands / filterCommands).
const toolCommands: Command[] = Object.keys(TOOL_LABELS).flatMap((id) => {
  const label = TOOL_LABELS[id]
  const alias = TOOL_ALIASES[id] ? ' ' + TOOL_ALIASES[id] : ''
  const variants = tools[id]?.variants
  if (variants) {
    const children: Command[] = variants.map(([vlabel, value]) => ({
      id: `variant:${id}:${value}`,
      title: `${label}: ${vlabel}`,
      category: 'Tools',
      keywords: 'tool variant fill outline mode' + alias,
      run: (ctx) => { ctx.setTool(id); ctx.setVariant(id, value) },
    }))
    const group: Command = {
      id: `tool:${id}`,
      title: `Tool: ${label}`,
      category: 'Tools',
      keywords: 'tool' + alias,
      submenu: children,
      run: () => {},
    }
    return [group]
  }
  const switchCmd: Command = {
    id: `tool:${id}`,
    title: `Tool: ${label}`,
    category: 'Tools',
    keywords: 'tool' + alias,
    shortcut: tools[id]?.key?.toUpperCase(),
    run: (ctx) => ctx.setTool(id),
  }
  return [switchCmd]
})

export const commands: Command[] = [
  ...toolCommands,

  // Edit
  { id: 'undo', title: 'Undo', category: 'Edit', shortcut: mod('Z'), enabled: (c) => c.canUndo, run: (c) => c.dispatch({ type: 'UNDO' }) },
  { id: 'redo', title: 'Redo', category: 'Edit', shortcut: modShift('Z'), enabled: (c) => c.canRedo, run: (c) => c.dispatch({ type: 'REDO' }) },
  { id: 'swap-colors', title: 'Swap Foreground / Background', category: 'Edit', keywords: 'color', shortcut: 'X', run: (c) => c.swapColors() },
  {
    id: 'brush-larger', title: 'Increase Brush Size', category: 'Edit', keywords: 'pencil width', shortcut: ']',
    enabled: (c) => !!tools[c.tool]?.hasBrushSize,
    run: (c) => c.setBrushSize(Math.min(20, c.brushSize + 1)),
  },
  {
    id: 'brush-smaller', title: 'Decrease Brush Size', category: 'Edit', keywords: 'pencil width', shortcut: '[',
    enabled: (c) => !!tools[c.tool]?.hasBrushSize,
    run: (c) => c.setBrushSize(Math.max(1, c.brushSize - 1)),
  },
  {
    id: 'clear-canvas', title: 'Clear Canvas', category: 'Edit', keywords: 'erase delete transparent layer',
    run: (c) => c.dispatch({ type: 'CLEAR_REGION', ...c.target, x: 0, y: 0, w: c.activeSprite.w, h: c.activeSprite.h }),
  },

  // Selection
  { id: 'select-all', title: 'Select All', category: 'Selection', shortcut: mod('A'), run: (c) => c.selectAll() },
  { id: 'deselect', title: 'Deselect', category: 'Selection', shortcut: mod('D'), enabled: (c) => c.hasSelection, run: (c) => c.deselect() },
  { id: 'invert-selection', title: 'Invert Selection', category: 'Selection', shortcut: modShift('I'), run: (c) => c.invertSelection() },
  { id: 'copy', title: 'Copy Selection', category: 'Selection', shortcut: mod('C'), enabled: (c) => c.hasSelection, run: (c) => c.copySelection() },
  { id: 'cut', title: 'Cut Selection', category: 'Selection', shortcut: mod('X'), enabled: (c) => c.hasSelection, run: (c) => c.cutSelection() },
  { id: 'paste', title: 'Paste', category: 'Selection', shortcut: mod('V'), enabled: (c) => c.hasClipboard, run: (c) => c.pasteClipboard() },
  { id: 'clear-bg', title: 'Clear Selection to Background', category: 'Selection', keywords: 'delete erase', enabled: (c) => c.hasSelection, run: (c) => c.clearSelectionToBg() },
  { id: 'fill-fg', title: 'Fill Selection with Foreground', category: 'Selection', keywords: 'replace color recolor paint', enabled: (c) => c.hasSelection, run: (c) => c.fillSelectionToFg() },
  { id: 'selection-save', title: 'Save Selection', category: 'Selection', keywords: 'store', enabled: (c) => c.hasSelection, run: (c) => c.saveSelection() },
  { id: 'selection-load', title: 'Load Selection', category: 'Selection', keywords: 'restore', enabled: (c) => c.hasSavedSelection, run: (c) => c.loadSavedSelection() },
  { id: 'flip-h', title: 'Flip Horizontal', category: 'Edit', keywords: 'mirror transform flip canvas layer', run: (c) => c.flipH() },
  { id: 'flip-v', title: 'Flip Vertical', category: 'Edit', keywords: 'mirror transform flip canvas layer', run: (c) => c.flipV() },
  { id: 'rotate-cw', title: 'Rotate Selection 90° Clockwise', category: 'Edit', keywords: 'rotate transform turn cw', enabled: (c) => c.hasSelection, run: (c) => c.rotate90(true) },
  { id: 'rotate-ccw', title: 'Rotate Selection 90° Counter-Clockwise', category: 'Edit', keywords: 'rotate transform turn ccw', enabled: (c) => c.hasSelection, run: (c) => c.rotate90(false) },

  // Palette
  {
    id: 'palette-sort',
    title: 'Sort Palette',
    category: 'Palette',
    submenu: (
      [
        ['hue', 'Hue'], ['saturation', 'Saturation'], ['brightness', 'Brightness'],
        ['red', 'Red'], ['green', 'Green'], ['blue', 'Blue'], ['alpha', 'Alpha'],
      ] as const
    ).map(([key, label]) => ({
      id: `palette-sort:${key}`,
      title: `Sort Palette: ${label}`,
      category: 'Palette',
      run: (c: CommandContext) => c.dispatch({ type: 'SORT_PALETTE', key }),
    })),
    run: () => {},
  },
  { id: 'palette-reverse', title: 'Reverse Palette', category: 'Palette', keywords: 'sort', run: (c) => c.dispatch({ type: 'REVERSE_PALETTE' }) },
  { id: 'classic-palettes', title: 'Classic Palettes', category: 'Palette', keywords: 'preset retro c64 commodore nes nintendo pico-8 pico8 sega master system swatch', run: (c) => c.openClassicPalettes() },
  { id: 'adjust-hsl', title: 'Adjust Hue / Saturation / Brightness', category: 'Palette', keywords: 'hue saturation brightness value recolor shift hsv hsl colorize tint', run: (c) => c.openAdjustHsl() },

  // Layers
  { id: 'layer-add', title: 'Add Layer', category: 'Layers', run: (c) => c.addLayer() },
  { id: 'layer-duplicate', title: 'Duplicate Layer', category: 'Layers', run: (c) => c.duplicateLayer() },
  { id: 'layer-remove', title: 'Delete Layer', category: 'Layers', enabled: (c) => c.activeSprite.layers.length > 1, run: (c) => c.removeLayer() },
  { id: 'layer-up', title: 'Move Layer Up', category: 'Layers', enabled: (c) => layerIndex(c) < c.activeSprite.layers.length - 1, run: (c) => c.moveLayer(1) },
  { id: 'layer-down', title: 'Move Layer Down', category: 'Layers', enabled: (c) => layerIndex(c) > 0, run: (c) => c.moveLayer(-1) },
  { id: 'layer-merge-down', title: 'Merge Down', category: 'Layers', keywords: 'flatten combine', enabled: (c) => layerIndex(c) > 0, run: (c) => c.mergeLayerDown() },
  { id: 'layer-merge-visible', title: 'Merge Visible', category: 'Layers', keywords: 'flatten combine', enabled: (c) => c.activeSprite.layers.filter((l) => l.visible).length > 1, run: (c) => c.mergeVisibleLayers() },
  { id: 'layer-flatten', title: 'Flatten Image', category: 'Layers', keywords: 'merge combine single', enabled: (c) => c.activeSprite.layers.length > 1, run: (c) => c.flattenImage() },

  // Frames
  { id: 'frame-add', title: 'Add Frame', category: 'Frames', run: (c) => c.addFrame() },
  { id: 'frame-duplicate', title: 'Duplicate Frame', category: 'Frames', run: (c) => c.duplicateFrame() },
  { id: 'frame-remove', title: 'Delete Frame', category: 'Frames', enabled: (c) => c.activeSprite.frameCount > 1, run: (c) => c.removeFrame() },
  { id: 'frame-left', title: 'Move Frame Left', category: 'Frames', enabled: (c) => c.target.frameIndex > 0, run: (c) => c.moveFrame(-1) },
  { id: 'frame-right', title: 'Move Frame Right', category: 'Frames', enabled: (c) => c.target.frameIndex < c.activeSprite.frameCount - 1, run: (c) => c.moveFrame(1) },
  { id: 'frame-next', title: 'Next Frame', category: 'Frames', shortcut: '→', enabled: (c) => c.target.frameIndex < c.activeSprite.frameCount - 1, run: (c) => c.stepFrame(1) },
  { id: 'frame-prev', title: 'Previous Frame', category: 'Frames', shortcut: '←', enabled: (c) => c.target.frameIndex > 0, run: (c) => c.stepFrame(-1) },

  // Sprites
  { id: 'sprite-add', title: 'Add Sprite', category: 'Sprites', run: (c) => c.addSprite() },
  { id: 'sprite-remove', title: 'Delete Sprite', category: 'Sprites', enabled: (c) => c.spriteCount > 1, run: (c) => c.removeSprite() },

  // View
  { id: 'play', title: 'Play / Stop Animation', category: 'View', keywords: 'loop playback', enabled: (c) => c.activeSprite.frameCount > 1, run: (c) => c.togglePlay() },
  { id: 'mirror-v', title: 'Toggle Vertical Mirror', category: 'View', keywords: 'symmetry axis', run: (c) => c.toggleMirrorV() },
  { id: 'mirror-h', title: 'Toggle Horizontal Mirror', category: 'View', keywords: 'symmetry axis', run: (c) => c.toggleMirrorH() },
  { id: 'onion', title: 'Toggle Onion Skin', category: 'View', keywords: 'ghost frame', run: (c) => c.toggleOnionSkin() },
  { id: 'preview', title: 'Toggle Preview Panel', category: 'View', run: (c) => c.togglePreview() },
  { id: 'gradient-panel', title: 'Toggle Gradient Panel', category: 'View', run: (c) => c.toggleGradient() },
  { id: 'grid', title: 'Toggle Grid Overlay', category: 'View', keywords: 'pixel lines align', run: (c) => c.toggleGrid() },
  {
    id: 'grid-spacing',
    title: 'Grid Spacing',
    category: 'View',
    submenu: [1, 2, 4, 8, 16].map((n) => ({
      id: `grid-spacing:${n}`,
      title: `Grid Spacing: ${n}px`,
      category: 'View',
      run: (c: CommandContext) => c.setGridSpacing(n),
    })),
    run: () => {},
  },
  { id: 'settings', title: 'Open Settings', category: 'View', run: (c) => c.openSettings() },

  // File
  { id: 'new', title: 'New Project', category: 'File', run: (c) => c.newProject() },
  { id: 'save', title: 'Save Project (.zip)', category: 'File', keywords: 'download export', run: (c) => c.saveProject() },
  { id: 'export-png', title: 'Export Frame as PNG', category: 'File', keywords: 'download', run: (c) => c.exportPng() },
  { id: 'export-frames-zip', title: 'Export Frames as ZIP', category: 'File', keywords: 'download animation', run: (c) => c.exportFramesZip() },
  { id: 'export-sprite-sheet', title: 'Export Frames as Sprite Sheet', category: 'File', keywords: 'download animation grid', run: (c) => c.exportSpriteSheet() },
  { id: 'open', title: 'Open Project…', category: 'File', keywords: 'load import zip', run: (c) => c.openProject() },
  { id: 'import-png', title: 'Import PNG as Sprite…', category: 'File', keywords: 'load image', run: (c) => c.importPng() },
  { id: 'import-colors', title: 'Import Colors from Image…', category: 'File', keywords: 'palette swatch', run: (c) => c.importColors() },
  { id: 'import-colors-canvas', title: 'Import Colors from Canvas', category: 'File', keywords: 'palette swatch sprite layer', run: (c) => c.importColorsFromCanvas() },
  { id: 'import-palette', title: 'Import Palette from Project…', category: 'File', keywords: 'swatch zip', run: (c) => c.importPalette() },
]

export function commandEnabled(cmd: Command, ctx: CommandContext): boolean {
  return cmd.enabled ? cmd.enabled(ctx) : true
}

export function paramCommandEnabled(cmd: Command, arg: unknown, ctx: CommandContext): boolean {
  return !cmd.param?.disabledReason?.(arg, ctx)
}

const normalizeHex = (raw: string) => (raw.startsWith('#') ? raw : '#' + raw).toLowerCase()

const paramCommands: Command[] = [
  {
    id: 'param:brush', title: 'Set Brush Size', category: 'Edit', run: () => {},
    param: {
      pattern: /^brush\s+(\d+)$/i,
      parse: (raw) => { const n = Number(raw); return Number.isInteger(n) ? n : null },
      preview: (n: number) => `Set brush size to ${Math.max(1, Math.min(20, n))} and switch to Brush`,
      run: (n: number, ctx) => { ctx.setBrushSize(Math.max(1, Math.min(20, n))); ctx.setTool('pencil') },
    },
  },
  {
    id: 'param:col', title: 'Select Palette Swatch', category: 'Palette', run: () => {},
    param: {
      pattern: /^col\s+(\d+)$/i,
      parse: (raw) => { const n = Number(raw); return Number.isInteger(n) && n >= 1 ? n : null },
      preview: (n: number, ctx) => ctx.palette[n - 1]
        ? `Set foreground to swatch ${n} (${ctx.palette[n - 1]})`
        : `Swatch ${n} does not exist (palette has ${ctx.palette.length} colors)`,
      disabledReason: (n: number, ctx) => ctx.palette[n - 1] ? null : `Palette only has ${ctx.palette.length} swatches`,
      run: (n: number, ctx) => ctx.setFgColor(ctx.palette[n - 1]),
    },
  },
  {
    id: 'param:rgb', title: 'Set Foreground Color (Hex)', category: 'Palette', run: () => {},
    param: {
      pattern: /^(?:rgb|hex)\s+(#?[0-9a-f]{3}|#?[0-9a-f]{6}|#?[0-9a-f]{8})$/i,
      parse: (raw) => raw,
      preview: (raw: string) => `Set foreground color to ${normalizeHex(raw)}`,
      run: (raw: string, ctx) => ctx.setFgColor(normalizeHex(raw)),
    },
  },
]

export function matchParamCommand(query: string): { cmd: Command; arg: unknown } | null {
  const trimmed = query.trim().replace(/\s+/g, ' ')
  for (const cmd of paramCommands) {
    const m = trimmed.match(cmd.param!.pattern)
    if (!m) continue
    const arg = cmd.param!.parse(m[1])
    if (arg === null) continue
    return { cmd, arg }
  }
  return null
}

// Flattened command set used for searching: each group is replaced by its
// submenu children, so a query surfaces the leaf options directly (e.g.
// "filled" finds "Rectangle: Filled") rather than the group parent. Browse mode
// uses the hierarchical `commands` instead.
const searchCommands: Command[] = commands.flatMap((c) => c.submenu ?? [c])

// First-appearance order of each category in `commands`, so ranked results
// still come out grouped (and the palette's category headers stay contiguous).
const categoryRank = new Map<string, number>()
commands.forEach((c) => { if (!categoryRank.has(c.category)) categoryRank.set(c.category, categoryRank.size) })

// Lower = better match; -1 = no match. A hit in the title beats a hit only via
// category/keywords (so "line" ranks "Line: …" above "Gradient: Linear", whose
// title only matches because "linear" contains "line"), and an earlier hit in
// the title beats a later one.
function wordScore(c: Command, word: string): number {
  const ti = c.title.toLowerCase().indexOf(word)
  if (ti >= 0) return ti
  if ((c.category + ' ' + (c.keywords ?? '')).toLowerCase().includes(word)) return 1000
  return -1
}

// A multi-word query (e.g. "rect filled") matches a command only if every
// word matches somewhere (title, category, or keywords) — words don't need to
// be contiguous or in order. The combined score sums each word's score, so
// ranking still favors title hits and earlier positions.
function matchScore(c: Command, words: string[]): number {
  let total = 0
  for (const w of words) {
    const s = wordScore(c, w)
    if (s < 0) return -1
    total += s
  }
  return total
}

// Case-insensitive substring match over title + category + keywords, sorted by
// category (registry order) then match quality. Enable state isn't filtered
// here — disabled commands still show (greyed) so the palette stays a stable
// map of what exists.
export function filterCommands(query: string): Command[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return searchCommands
  return searchCommands
    .map((c, idx) => ({ c, idx, score: matchScore(c, words) }))
    .filter((s) => s.score >= 0)
    .sort((a, b) =>
      (categoryRank.get(a.c.category)! - categoryRank.get(b.c.category)!) ||
      (a.score - b.score) ||
      (a.idx - b.idx),
    )
    .map((s) => s.c)
}
