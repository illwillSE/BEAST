import { useEffect, useReducer, useRef, useState } from 'react'
import Header from './components/Header.jsx'
import ToolRail from './components/ToolRail.jsx'
import SpriteList from './components/SpriteList.jsx'
import CanvasStage from './components/CanvasStage.jsx'
import type { CanvasStageHandle } from './components/CanvasStage.jsx'
import LayersPanel from './components/LayersPanel.jsx'
import ColorPanel from './components/ColorPanel.jsx'
import FramesTimeline from './components/FramesTimeline.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import MergeColorsDialog from './components/MergeColorsDialog.jsx'
import ClassicPalettesDialog from './components/ClassicPalettesDialog.jsx'
import AdjustHslDialog from './components/AdjustHslDialog.jsx'
import CommandPalette from './components/CommandPalette.jsx'
import FoldTab from './components/FoldTab.jsx'
import EyedropperMagnifier from './components/EyedropperMagnifier.jsx'
import useFoldable from './hooks/useFoldable.js'
import usePeek from './hooks/usePeek.js'
import { useGlobalEyedropper } from './hooks/useGlobalEyedropper.js'
import { createBlankDocument, createDocument, copyRegion, rgbaToHex, hexToRgba, invertSelectionMask, compositeFrame } from './document/model.js'
import { historyReducer, initHistory } from './document/reducer.js'
import { saveAutosave, loadAutosave } from './persist/autosave.js'
import { loadPreviewPrefs } from './persist/previewPrefs.js'
import { projectToZipBlob, projectFromZipFile, projectPaletteFromZipFile, downloadBlob } from './persist/zip.js'
import { exportSpriteFramesAsZip } from './export/framesZip.js'
import { exportSpriteAsSheet } from './export/spritesheet.js'
import { matchShortcut, isTypingTarget, isInsideDialog } from './shortcuts/registry.js'
import type { ShortcutContext } from './shortcuts/registry.js'
import type { CommandContext } from './commands/registry.js'
import type { BrushShape, Cell, Doc, Sprite } from './document/model.js'
import type { Selection, Floating, CropPending, Coord } from './tools/registry.js'

interface Clipboard {
  w: number
  h: number
  data: Cell
}

// Pop a native file picker and resolve with the chosen file (or null) — lets
// command-palette file commands reuse App's File-taking handlers without the
// hidden <input> the Header keeps for its buttons.
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

// BEAST shell. The pixel document lives behind the history reducer; the pencil
// draws into the active sprite/layer/frame with undo/redo. Sprite/layer/frame
// selection drives the paint target — painting follows the UI. The project
// autosaves to the browser and can be saved/loaded as a .zip.
export default function App() {
  const [tool, setTool] = useState('pencil')
  const [temporaryToolReturn, setTemporaryToolReturn] = useState<string | null>(null)
  const [fgColor, setFgColor] = useState('#fbbf24')
  const [bgColor, setBgColor] = useState('#ffffff00')
  const swapColors = () => {
    setFgColor(bgColor)
    setBgColor(fgColor)
  }
  // Select/move/clipboard state. `selection` is a rect on the active layer's
  // current frame; `floating` is pixels lifted out of the layer by a move or
  // paste, rendered on top until something commits them (see commitFloating).
  const [selection, setSelection] = useState<Selection | null>(null)
  const [floating, setFloating] = useState<Floating | null>(null)
  const [clipboard, setClipboard] = useState<Clipboard | null>(null)
  // Pending crop window from the Crop tool — { x, y, w, h, target } — stays
  // editable (movable) until committed/cancelled (see commitCrop/cancelCrop).
  const [cropPending, setCropPending] = useState<CropPending | null>(null)
  // Pending anchor for the Line tool's Continuous variant — each click
  // commits a segment and starts the next from there, until Escape or
  // switching away from the tool/variant (see the effects below).
  const [continuousLine, setContinuousLine] = useState<Coord | null>(null)
  const [mirrorV, setMirrorV] = useState(false)
  const [mirrorH, setMirrorH] = useState(false)
  const [filled, setFilled] = useState<Record<string, boolean>>({ rect: false, ellipse: false })
  const setToolVariant = (id: string, v: boolean) => setFilled((f) => ({ ...f, [id]: v }))
  // Bumped on every keyboard-driven variant cycle so ToolRail can pop its
  // flyout open to show the new selection, even when cycling the same tool
  // repeatedly (id alone wouldn't change render-to-render).
  const [variantPeek, setVariantPeek] = useState<{ id: string; token: number } | null>(null)
  const peekVariants = (id: string) => setVariantPeek({ id, token: Date.now() })
  const [brushSize, setBrushSize] = useState(1)
  const [brushShape, setBrushShape] = useState<BrushShape>('square')
  const selectTool = (id: string) => {
    setTemporaryToolReturn(null)
    setTool(id)
  }
  const selectTemporaryTool = (id: string) => {
    if (tool === id) return
    setTemporaryToolReturn(tool)
    setTool(id)
  }
  const completeTemporaryTool = () => {
    if (!temporaryToolReturn) return
    setTool(temporaryToolReturn)
    setTemporaryToolReturn(null)
  }

  // Lets the eyedropper sample colors anywhere in the app, not just the pixel
  // canvas (which has its own precise, pixel-data-backed picking below).
  const globalMagnifier = useGlobalEyedropper(tool === 'eyedropper', (hex) => {
    setFgColor(hex)
    completeTemporaryTool()
  })
  const [previewOpen, setPreviewOpen] = useState(() => loadPreviewPrefs()?.open ?? false)

  // Foldable chrome panels — each pinned open by default (today's layout).
  // Unpinning collapses a panel to an edge tab; clicking the tab peeks it
  // open as a shadowed overlay that doesn't resize the canvas.
  const spriteListFold = useFoldable()
  const framesFold = useFoldable()

  // Layers + Color share one column, so pinning either one already commits
  // the full sidebar width — they share a single pin, with independent peek.
  const [sidebarPinned, setSidebarPinned] = useState(true)
  const layersPeek = usePeek()
  const colorPeek = usePeek()
  const toggleSidebarPin = () => {
    setSidebarPinned((p) => !p)
    layersPeek.close()
    colorPeek.close()
  }

  const [state, dispatch] = useReducer(historyReducer, undefined, () => initHistory(createDocument()))
  const doc = state.present
  // Tracks the doc reference as of the last save/export/load, so New Project
  // can skip its confirm prompt when there's nothing unsaved to lose.
  const savedDocRef = useRef(doc)
  const palette = doc.palette
  const addSwatch = (hex: string) => dispatch({ type: 'ADD_SWATCH', hex })
  const removeSwatch = (index: number) => dispatch({ type: 'REMOVE_SWATCH', index })
  const editSwatch = (index: number, hex: string) => dispatch({ type: 'EDIT_SWATCH', index, hex })
  const reorderSwatch = (from: number, to: number) => dispatch({ type: 'REORDER_SWATCH', from, to })

  // "Import from image": decode the file to pixel data and merge its
  // distinct opaque colors into the palette. Capped so dropping a photo
  // (thousands of colors) doesn't flood the swatch grid — pixel-art source
  // images are normally already flat-color.
  const MAX_IMPORTED_COLORS = 256
  const importImagePalette = async (file: File) => {
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const colors = new Set<string>()
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue
        colors.add(rgbaToHex([data[i], data[i + 1], data[i + 2], data[i + 3]]))
        if (colors.size > MAX_IMPORTED_COLORS) {
          window.alert(`That image has too many distinct colors (>${MAX_IMPORTED_COLORS}) — pick a flat-color/indexed image instead.`)
          return
        }
      }
      dispatch({ type: 'MERGE_SWATCHES', colors: [...colors] })
    } catch (err) {
      console.warn('BEAST image color import failed', err)
      window.alert('Could not read colors from that image.')
    }
  }

  // "Import PNG": decode the file and add it as a new sprite (single layer,
  // single frame) sized to the image. Capped at the same max size as the New
  // Sprite / Resize dialogs.
  const MAX_SPRITE_SIZE = 256
  const importSpritePng = async (file: File) => {
    try {
      const bitmap = await createImageBitmap(file)
      if (bitmap.width > MAX_SPRITE_SIZE || bitmap.height > MAX_SPRITE_SIZE) {
        window.alert(`That image is too large (max ${MAX_SPRITE_SIZE}×${MAX_SPRITE_SIZE}).`)
        return
      }
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const name = file.name.replace(/\.[^./]+$/, '') || 'Imported sprite'
      dispatch({ type: 'ADD_SPRITE_FROM_IMAGE', name, w: bitmap.width, h: bitmap.height, cell: Uint8ClampedArray.from(data) })
    } catch (err) {
      console.warn('BEAST PNG import failed', err)
      window.alert('Could not import that image.')
    }
  }

  // "Import from project": pull just the palette out of another saved .zip,
  // replacing the current one, without touching the current project's
  // sprites/layers/cells.
  const importProjectPalette = async (file: File) => {
    try {
      const colors = await projectPaletteFromZipFile(file)
      dispatch({ type: 'SET_PALETTE', palette: colors })
    } catch (err) {
      console.warn('BEAST project palette import failed', err)
      window.alert('Could not read a palette from that file — it is not a valid BEAST project.')
    }
  }

  // Active selection. The active sprite falls back to the first if the id is
  // stale (e.g. just after loading a different project); layer/frame are
  // clamped to what the active sprite actually has, so target is always valid.
  const [spriteId, setSpriteId] = useState(() => doc.sprites[0].id)
  const [layerId, setLayerId] = useState(() => topLayer(doc.sprites[0]).id)
  const [frameIndex, setFrameIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [fps, setFps] = useState(12)
  const [onionSkin, setOnionSkin] = useState(true)
  const [eraseToBg, setEraseToBg] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [gradientOpen, setGradientOpen] = useState(true)
  const [showGrid, setShowGrid] = useState(false)
  const [gridSpacing, setGridSpacingState] = useState(1)
  const canvasStageRef = useRef<CanvasStageHandle>(null)
  const pendingFitRef = useRef(false)

  // Fit-to-frame needs the freshly replaced sprite's size, which CanvasStage
  // only has after it re-renders with the new `doc` — so defer the call to
  // an effect keyed off the document instead of running it inline.
  useEffect(() => {
    if (pendingFitRef.current) {
      canvasStageRef.current?.fitToFrame()
      pendingFitRef.current = false
    }
  }, [doc])

  const activeSprite = doc.sprites.find((s) => s.id === spriteId) ?? doc.sprites[0]
  const safeLayerId = activeSprite.layers.some((l) => l.id === layerId) ? layerId : topLayer(activeSprite).id
  const safeFrame = frameIndex < activeSprite.frameCount ? frameIndex : 0

  // Remembers each sprite's last-selected layer/frame so switching back to it
  // restores where you left off, instead of always resetting to the top
  // layer / frame 1. Keyed by sprite id; a ref since it's read/written
  // alongside selection changes but never needs to trigger a render itself.
  const spriteSelectionRef = useRef<Record<string, { layerId: string; frameIndex: number }>>({})

  const selectSprite = (id: string) => {
    if (id === spriteId) return
    spriteSelectionRef.current[spriteId] = { layerId: safeLayerId, frameIndex: safeFrame }
    const sp = doc.sprites.find((s) => s.id === id)!
    const remembered = spriteSelectionRef.current[id]
    setSpriteId(id)
    setLayerId(remembered?.layerId ?? topLayer(sp).id)
    setFrameIndex(remembered?.frameIndex ?? 0)
  }

  // Point selection at a freshly loaded document's first sprite.
  const resetSelection = (nextDoc: Doc) => {
    spriteSelectionRef.current = {}
    setSpriteId(nextDoc.sprites[0].id)
    setLayerId(topLayer(nextDoc.sprites[0]).id)
    setFrameIndex(0)
  }

  const target = { spriteId: activeSprite.id, layerId: safeLayerId, frameIndex: safeFrame }

  const getActiveCell = () => activeSprite.layers.find((l) => l.id === safeLayerId)!.cells[safeFrame]

  // Write a pending move/paste back into the layer and drop the floating
  // buffer. Triggered by leaving the move tool, switching the paint target,
  // or Escape — a floating selection only makes sense for one cell at a time.
  const commitFloating = () => {
    if (!floating) return
    dispatch({ type: 'PASTE_REGION', ...floating.target, x: floating.x, y: floating.y, w: floating.w, h: floating.h, data: floating.data })
    setFloating(null)
    setSelection(null)
  }

  const copySelection = () => {
    if (floating) { setClipboard({ w: floating.w, h: floating.h, data: floating.data.slice() }); return }
    if (!selection) return
    setClipboard({ w: selection.w, h: selection.h, data: copyRegion(getActiveCell(), activeSprite.w, activeSprite.h, selection.x, selection.y, selection.w, selection.h, selection.mask) })
  }

  const cutSelection = () => {
    if (floating) { setClipboard({ w: floating.w, h: floating.h, data: floating.data.slice() }); setFloating(null); return }
    if (!selection) return
    setClipboard({ w: selection.w, h: selection.h, data: copyRegion(getActiveCell(), activeSprite.w, activeSprite.h, selection.x, selection.y, selection.w, selection.h, selection.mask) })
    dispatch({ type: 'CLEAR_REGION', ...target, x: selection.x, y: selection.y, w: selection.w, h: selection.h, mask: selection.mask })
  }

  const pasteClipboard = () => {
    if (!clipboard) return
    commitFloating()
    const x = Math.max(0, Math.floor((activeSprite.w - clipboard.w) / 2))
    const y = Math.max(0, Math.floor((activeSprite.h - clipboard.h) / 2))
    setFloating({ x, y, w: clipboard.w, h: clipboard.h, data: clipboard.data.slice(), target })
    setSelection({ x, y, w: clipboard.w, h: clipboard.h })
    selectTool('move')
  }

  const selectAll = () => {
    commitFloating()
    setSelection({ x: 0, y: 0, w: activeSprite.w, h: activeSprite.h })
  }

  const deselect = () => {
    commitFloating()
    setSelection(null)
  }

  // Cmd/Ctrl+Shift+I: select the complement of the current selection (or
  // everything, if nothing's selected). The complement of a rectangle isn't
  // generally a rectangle, so this stamps a canvas-sized mask (see
  // invertSelectionMask) rather than another plain Rect.
  const invertSelection = () => {
    commitFloating()
    if (!selection) { setSelection({ x: 0, y: 0, w: activeSprite.w, h: activeSprite.h }); return }
    setSelection(invertSelectionMask(selection, activeSprite.w, activeSprite.h))
  }

  // Backspace/Delete: fill the selection with the background color. A
  // floating move/paste has no committed pixels to fill yet, so just drop it.
  const clearSelectionToBg = () => {
    if (floating) { setFloating(null); setSelection(null); return }
    if (!selection) return
    dispatch({ type: 'FILL_REGION', ...target, x: selection.x, y: selection.y, w: selection.w, h: selection.h, rgba: hexToRgba(bgColor), mask: selection.mask })
  }

  // Flood the selected pixels with the foreground color — the one-click
  // "recolor everything selected" (e.g. after Select Color). A floating
  // move/paste has nothing committed to fill, so it's a no-op there.
  const fillSelectionToFg = () => {
    if (floating || !selection) return
    dispatch({ type: 'FILL_REGION', ...target, x: selection.x, y: selection.y, w: selection.w, h: selection.h, rgba: hexToRgba(fgColor), mask: selection.mask })
  }

  // Apply the pending crop window (CROP_SPRITE on the sprite it was drawn
  // against) and clear it. cancelCrop discards it without applying.
  const commitCrop = () => {
    if (!cropPending) return
    const { x, y, w, h, target: t } = cropPending
    dispatch({ type: 'CROP_SPRITE', spriteId: t.spriteId, x, y, w, h })
    setCropPending(null)
  }
  const cancelCrop = () => setCropPending(null)

  // A floating move/paste only makes sense while the move tool is active, and
  // only for the cell it was lifted from — commit it when either changes. A
  // pending crop window likewise only makes sense while the crop tool is
  // active — commit it (apply the crop) when leaving the tool.
  useEffect(() => {
    if (tool !== 'move') commitFloating()
    if (tool !== 'crop') commitCrop()
    if (tool !== 'line' || !filled.line) setContinuousLine(null)
  }, [tool, filled.line])

  // Switching the paint target mid-crop would apply the crop to the wrong
  // sprite, so discard rather than commit.
  useEffect(() => {
    commitFloating()
    setSelection(null)
    cancelCrop()
    setContinuousLine(null)
  }, [activeSprite.id, safeLayerId, safeFrame, activeSprite.w, activeSprite.h])

  // Follow a layer add/duplicate with selection. Guarded by spriteId so
  // switching sprites (which also changes the layer id set) doesn't hijack
  // the selection that selectSprite/resetSelection already set.
  const prevLayersRef = useRef({ spriteId: activeSprite.id, ids: new Set(activeSprite.layers.map((l) => l.id)) })
  useEffect(() => {
    const prev = prevLayersRef.current
    const ids = activeSprite.layers.map((l) => l.id)
    if (prev.spriteId === activeSprite.id) {
      const added = ids.find((id) => !prev.ids.has(id))
      if (added) setLayerId(added)
    }
    prevLayersRef.current = { spriteId: activeSprite.id, ids: new Set(ids) }
  }, [activeSprite])

  // Follow a sprite add with selection (new sprites are appended at the end).
  const prevSpriteIdsRef = useRef(new Set(doc.sprites.map((s) => s.id)))
  useEffect(() => {
    const ids = doc.sprites.map((s) => s.id)
    const added = ids.find((id) => !prevSpriteIdsRef.current.has(id))
    if (added) selectSprite(added)
    prevSpriteIdsRef.current = new Set(ids)
  }, [doc.sprites])

  // Loop playback: advances frameIndex at `fps` using a requestAnimationFrame
  // timestamp accumulator (rather than setInterval) so the rate stays accurate
  // even if individual frames are throttled.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    let acc = 0
    const tick = (now: number) => {
      acc += now - last
      last = now
      const frameMs = 1000 / fps
      if (acc >= frameMs) {
        acc %= frameMs
        setFrameIndex((i) => (i + 1) % activeSprite.frameCount)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, fps, activeSprite.frameCount])

  // Step to the previous/next frame (Left/Right arrow), clamped to bounds —
  // same range as the timeline's ◂▸ buttons.
  const stepFrame = (delta: number) => {
    const next = safeFrame + delta
    if (next < 0 || next >= activeSprite.frameCount) return
    setFrameIndex(next)
  }

  // Routes keydown through the shortcut registry: Cmd/Ctrl+Z undo,
  // Cmd/Ctrl+Shift+Z (or Ctrl+Y) redo, Cmd/Ctrl+A select all, Cmd/Ctrl+D
  // deselect, Cmd/Ctrl+Shift+I invert selection, Cmd/Ctrl+C/X/V for the
  // selection clipboard, Backspace/Delete to fill the selection with the
  // background color, Escape to commit a floating move/paste (and cancel a
  // pending crop or continuous line) and deselect, Enter to commit a pending
  // crop, Left/Right to step frames, and a letter per tool (see each tool's `key`
  // in tools/registry.js).
  const shortcutCtx: ShortcutContext = {
    dispatch, setTool: selectTool, setTemporaryTool: selectTemporaryTool,
    tool, filled, setVariant: setToolVariant, peekVariants, brushSize, setBrushSize,
    copySelection, cutSelection, pasteClipboard, commitFloating, setSelection, selectAll, deselect, invertSelection,
    clearSelectionToBg, commitCrop, cancelCrop, cancelContinuousLine: () => setContinuousLine(null), swapColors, stepFrame,
    openCommandPalette: () => setCommandPaletteOpen(true),
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || isInsideDialog(e.target)) return
      const shortcut = matchShortcut(e)
      if (!shortcut) return
      e.preventDefault()
      shortcut.run(shortcutCtx)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcutCtx])

  // Restore the autosaved project on mount, then enable autosaving.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    loadAutosave()
      .then((restored) => {
        if (cancelled || !restored) return
        dispatch({ type: 'REPLACE', doc: restored })
        resetSelection(restored)
      })
      .finally(() => { if (!cancelled) setReady(true) })
    return () => { cancelled = true }
  }, [])

  // Debounced autosave on every document change (once restore has run).
  useEffect(() => {
    if (!ready) return
    const t = setTimeout(() => saveAutosave(doc), 800)
    return () => clearTimeout(t)
  }, [doc, ready])

  const handleSave = async () => {
    const filename = (doc.name.trim() || 'beast-project').replace(/[\\/:*?"<>|]+/g, '_')
    downloadBlob(await projectToZipBlob(doc), `${filename}.zip`)
    savedDocRef.current = doc
  }

  // Shared by every "load colors from X" flow (canvas extraction, classic
  // palette presets, ...) — `colors` (non-null) doubles as MergeColorsDialog's
  // open flag, with its Replace/Add Unique choice deciding SET_PALETTE vs
  // MERGE_SWATCHES.
  const [pendingMerge, setPendingMerge] = useState<{ title: string; description: string; colors: string[] } | null>(null)

  // "Import from canvas": composite the current frame's visible layers and
  // collect its distinct opaque colors, same cap/dedup as importImagePalette.
  const importColorsFromCanvas = () => {
    const canvas = document.createElement('canvas')
    canvas.width = activeSprite.w
    canvas.height = activeSprite.h
    const ctx = canvas.getContext('2d')!
    const imageData = ctx.createImageData(activeSprite.w, activeSprite.h)
    compositeFrame(activeSprite, safeFrame, imageData)
    const { data } = imageData
    const colors = new Set<string>()
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue
      colors.add(rgbaToHex([data[i], data[i + 1], data[i + 2], data[i + 3]]))
      if (colors.size > MAX_IMPORTED_COLORS) {
        window.alert(`This canvas has too many distinct colors (>${MAX_IMPORTED_COLORS}) to import.`)
        return
      }
    }
    if (colors.size === 0) {
      window.alert('The current canvas has no opaque pixels to import colors from.')
      return
    }
    const list = [...colors]
    setPendingMerge({
      title: 'Import Colors from Canvas',
      description: `Found ${list.length} color${list.length === 1 ? '' : 's'} on the current canvas. Replace the palette with these, or add only the ones not already in it?`,
      colors: list,
    })
  }

  const [classicPalettesOpen, setClassicPalettesOpen] = useState(false)

  // Adjust Hue/Sat/Brightness: a live-preview gesture. Opening brackets the
  // gesture (STROKE_BEGIN) so every preview tick coalesces into one undo step;
  // Apply ends it, Cancel rolls it back (STROKE_CANCEL).
  const [hslOpen, setHslOpen] = useState(false)
  const openAdjustHsl = () => {
    commitFloating()
    dispatch({ type: 'STROKE_BEGIN' })
    setHslOpen(true)
  }

  const handleExportPng = async () => {
    const canvas = document.createElement('canvas')
    canvas.width = activeSprite.w
    canvas.height = activeSprite.h
    const ctx = canvas.getContext('2d')!
    const imageData = ctx.createImageData(activeSprite.w, activeSprite.h)
    compositeFrame(activeSprite, safeFrame, imageData)
    ctx.putImageData(imageData, 0, 0)
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return
    const filename = (activeSprite.name.trim() || 'sprite').replace(/[\\/:*?"<>|]+/g, '_')
    downloadBlob(blob, `${filename}.png`)
    savedDocRef.current = doc
  }

  const handleExportFramesZip = async () => {
    const filename = (activeSprite.name.trim() || 'sprite').replace(/[\\/:*?"<>|]+/g, '_')
    downloadBlob(await exportSpriteFramesAsZip(activeSprite), `${filename}-frames.zip`)
    savedDocRef.current = doc
  }

  const handleExportSpriteSheet = async () => {
    const filename = (activeSprite.name.trim() || 'sprite').replace(/[\\/:*?"<>|]+/g, '_')
    downloadBlob(await exportSpriteAsSheet(activeSprite), `${filename}-sheet.png`)
    savedDocRef.current = doc
  }

  const handleOpen = async (file: File) => {
    try {
      const loaded = await projectFromZipFile(file)
      dispatch({ type: 'REPLACE', doc: loaded })
      resetSelection(loaded)
      savedDocRef.current = loaded
    } catch (err) {
      console.warn('BEAST project load failed', err)
      window.alert('Could not open that file — it is not a valid BEAST project.')
    }
  }

  const handleNewProject = () => {
    const dirty = doc !== savedDocRef.current
    if (dirty && !window.confirm('Discard the current project and start a blank one? Unsaved changes will be lost.')) return
    const blank = createBlankDocument()
    dispatch({ type: 'REPLACE', doc: blank })
    resetSelection(blank)
    setGradientOpen(false)
    pendingFitRef.current = true
    savedDocRef.current = blank
  }

  // Everything the command palette can invoke — the shortcut context plus the
  // document-CRUD / file / toggle operations. Frame ops follow the selection
  // (like FramesTimeline); layer/sprite add/remove follow via App's effects /
  // safe-id fallbacks.
  const commandCtx: CommandContext = {
    ...shortcutCtx,
    target,
    activeSprite,
    spriteCount: doc.sprites.length,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    hasSelection: !!(selection || floating),
    hasClipboard: !!clipboard,
    fillSelectionToFg,
    addLayer: () => dispatch({ type: 'ADD_LAYER', spriteId: activeSprite.id, name: `Layer ${activeSprite.layers.length + 1}` }),
    duplicateLayer: () => dispatch({ type: 'DUPLICATE_LAYER', spriteId: activeSprite.id, layerId: safeLayerId }),
    removeLayer: () => { if (activeSprite.layers.length > 1) dispatch({ type: 'REMOVE_LAYER', spriteId: activeSprite.id, layerId: safeLayerId }) },
    moveLayer: (delta) => dispatch({ type: 'MOVE_LAYER', spriteId: activeSprite.id, layerId: safeLayerId, delta }),
    mergeLayerDown: () => dispatch({ type: 'MERGE_LAYER_DOWN', spriteId: activeSprite.id, layerId: safeLayerId }),
    mergeVisibleLayers: () => dispatch({ type: 'MERGE_VISIBLE_LAYERS', spriteId: activeSprite.id, layerId: safeLayerId }),
    flattenImage: () => dispatch({ type: 'FLATTEN_SPRITE', spriteId: activeSprite.id, layerId: safeLayerId }),
    addFrame: () => { const at = safeFrame + 1; dispatch({ type: 'ADD_FRAME', spriteId: activeSprite.id, atIndex: at }); setFrameIndex(at) },
    duplicateFrame: () => { const at = safeFrame + 1; dispatch({ type: 'DUPLICATE_FRAME', spriteId: activeSprite.id, frameIndex: safeFrame }); setFrameIndex(at) },
    removeFrame: () => { if (activeSprite.frameCount > 1) { dispatch({ type: 'REMOVE_FRAME', spriteId: activeSprite.id, frameIndex: safeFrame }); setFrameIndex(Math.min(safeFrame, activeSprite.frameCount - 2)) } },
    moveFrame: (delta) => { const to = safeFrame + delta; if (to >= 0 && to < activeSprite.frameCount) { dispatch({ type: 'MOVE_FRAME', spriteId: activeSprite.id, frameIndex: safeFrame, delta }); setFrameIndex(to) } },
    addSprite: () => dispatch({ type: 'ADD_SPRITE' }),
    removeSprite: () => { if (doc.sprites.length > 1) dispatch({ type: 'REMOVE_SPRITE', spriteId: activeSprite.id }) },
    newProject: handleNewProject,
    saveProject: handleSave,
    exportPng: handleExportPng,
  exportFramesZip: handleExportFramesZip,
  exportSpriteSheet: handleExportSpriteSheet,
    openProject: () => { pickFile('.zip').then((f) => f && handleOpen(f)) },
    importPng: () => { pickFile('image/*').then((f) => f && importSpritePng(f)) },
    importColors: () => { pickFile('image/*').then((f) => f && importImagePalette(f)) },
    importColorsFromCanvas,
    importPalette: () => { pickFile('.zip').then((f) => f && importProjectPalette(f)) },
    openClassicPalettes: () => setClassicPalettesOpen(true),
    openAdjustHsl,
    toggleMirrorV: () => setMirrorV((v) => !v),
    toggleMirrorH: () => setMirrorH((v) => !v),
    togglePlay: () => setPlaying((p) => !p),
    toggleOnionSkin: () => setOnionSkin((o) => !o),
    togglePreview: () => setPreviewOpen((o) => !o),
    toggleGradient: () => setGradientOpen((v) => !v),
    toggleGrid: () => setShowGrid((v) => !v),
    setGridSpacing: (n) => setGridSpacingState(n),
    openSettings: () => setSettingsOpen(true),
  }

  return (
    <div className="h-screen flex flex-col text-ink-soft">
      <Header
        projectName={doc.name}
        onRenameProject={(name) => dispatch({ type: 'RENAME_PROJECT', name })}
        onNewProject={handleNewProject}
        onSave={handleSave}
        onOpen={handleOpen}
        onImportPng={importSpritePng}
        onExportPng={handleExportPng}
        onExportFramesZip={handleExportFramesZip}
        onExportSpriteSheet={handleExportSpriteSheet}
        previewOpen={previewOpen}
        onTogglePreview={() => setPreviewOpen((o) => !o)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <div className="flex-1 flex min-h-0">
            {spriteListFold.pinned ? (
              <SpriteList
                sprites={doc.sprites}
                selectedId={spriteId}
                onSelect={selectSprite}
                dispatch={dispatch}
                pinned
                onTogglePin={spriteListFold.togglePin}
                onPeekSelect={undefined}
              />
            ) : (
              <div ref={spriteListFold.ref} className="relative shrink-0">
                <FoldTab edge="left" label="Sprites" active={spriteListFold.peeking} onClick={spriteListFold.togglePeek} />
                {spriteListFold.peeking && (
                  <div className="absolute inset-y-0 left-0 z-20 shadow-2xl">
                    <SpriteList
                      sprites={doc.sprites}
                      selectedId={spriteId}
                      onSelect={selectSprite}
                      dispatch={dispatch}
                      pinned={false}
                      onTogglePin={spriteListFold.togglePin}
                      onPeekSelect={spriteListFold.closePeek}
                    />
                  </div>
                )}
              </div>
            )}

            <ToolRail
              active={tool}
              onPick={selectTool}
              filled={filled}
              onFilled={setToolVariant}
              peek={variantPeek}
              mirrorV={mirrorV}
              mirrorH={mirrorH}
              onMirrorV={() => setMirrorV((v) => !v)}
              onMirrorH={() => setMirrorH((v) => !v)}
            />

            <CanvasStage
              ref={canvasStageRef}
              tool={tool}
              fgColor={fgColor}
              bgColor={bgColor}
              onFgColor={setFgColor}
              sprite={activeSprite}
              target={target}
              dispatch={dispatch}
              selection={selection}
              setSelection={setSelection}
              floating={floating}
              setFloating={setFloating}
              commitFloating={commitFloating}
              cropPending={cropPending}
              setCropPending={setCropPending}
              continuousLine={continuousLine}
              setContinuousLine={setContinuousLine}
              filled={filled[tool] ?? false}
              brushSize={brushSize}
              brushShape={brushShape}
              onBrushSize={setBrushSize}
              onBrushShape={setBrushShape}
              mirrorV={mirrorV}
              mirrorH={mirrorH}
              onTemporaryToolComplete={temporaryToolReturn ? completeTemporaryTool : undefined}
              previewOpen={previewOpen}
              onClosePreview={() => setPreviewOpen(false)}
              playing={playing}
              onionSkin={onionSkin}
              eraseToBg={eraseToBg}
              showGrid={showGrid}
              gridSpacing={gridSpacing}
            />
          </div>

          {framesFold.pinned ? (
            <FramesTimeline
              sprite={activeSprite}
              frameCount={activeSprite.frameCount}
              active={safeFrame}
              onPick={setFrameIndex}
              spriteId={activeSprite.id}
              dispatch={dispatch}
              playing={playing}
              onTogglePlay={() => setPlaying((p) => !p)}
              fps={fps}
              onFps={setFps}
              pinned
              onTogglePin={framesFold.togglePin}
              onPeekSelect={undefined}
            />
          ) : (
            <div ref={framesFold.ref} className="relative shrink-0">
              <FoldTab edge="bottom" label="Frames" active={framesFold.peeking} onClick={framesFold.togglePeek} />
              {framesFold.peeking && (
                <div className="absolute bottom-0 left-0 right-0 z-20 shadow-2xl">
                  <FramesTimeline
                    sprite={activeSprite}
                    frameCount={activeSprite.frameCount}
                    active={safeFrame}
                    onPick={setFrameIndex}
                    spriteId={activeSprite.id}
                    dispatch={dispatch}
                    playing={playing}
                    onTogglePlay={() => setPlaying((p) => !p)}
                    fps={fps}
                    onFps={setFps}
                    pinned={false}
                    onTogglePin={framesFold.togglePin}
                    onPeekSelect={framesFold.closePeek}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="bg-panel border-l border-divider flex flex-col shrink-0 overflow-y-auto">
          {sidebarPinned ? (
            <LayersPanel
              layers={activeSprite.layers}
              selectedId={safeLayerId}
              onSelect={setLayerId}
              spriteId={activeSprite.id}
              w={activeSprite.w}
              h={activeSprite.h}
              frameIndex={safeFrame}
              dispatch={dispatch}
              pinned
              onTogglePin={toggleSidebarPin}
              onPeekSelect={undefined}
            />
          ) : (
            <div ref={layersPeek.ref} className="relative shrink-0">
              <FoldTab edge="right" label="Layers" fill={false} active={layersPeek.peeking} onClick={layersPeek.toggle} />
              {layersPeek.peeking && (
                <div className="absolute top-0 right-0 z-20 shadow-2xl">
                  <LayersPanel
                    layers={activeSprite.layers}
                    selectedId={safeLayerId}
                    onSelect={setLayerId}
                    spriteId={activeSprite.id}
                    w={activeSprite.w}
                    h={activeSprite.h}
                    frameIndex={safeFrame}
                    dispatch={dispatch}
                    pinned={false}
                    onTogglePin={toggleSidebarPin}
                    onPeekSelect={layersPeek.close}
                  />
                </div>
              )}
            </div>
          )}

          {sidebarPinned ? (
            <ColorPanel
              fgColor={fgColor}
              bgColor={bgColor}
              onFgColor={setFgColor}
              onBgColor={setBgColor}
              onSwap={swapColors}
              palette={palette}
              onAddSwatch={addSwatch}
              onRemoveSwatch={removeSwatch}
              onEditSwatch={editSwatch}
              onReorderSwatch={reorderSwatch}
              onImportImage={importImagePalette}
              onImportProjectPalette={importProjectPalette}
              pinned
              onTogglePin={toggleSidebarPin}
              onPeekSelect={undefined}
              gradientOpen={gradientOpen}
              onToggleGradient={() => setGradientOpen((v) => !v)}
            />
          ) : (
            <div ref={colorPeek.ref} className="relative shrink-0">
              <FoldTab edge="right" label="Color" fill={false} active={colorPeek.peeking} onClick={colorPeek.toggle} />
              {colorPeek.peeking && (
                <div className="absolute top-0 right-0 z-20 shadow-2xl">
                  <ColorPanel
                    fgColor={fgColor}
                    bgColor={bgColor}
                    onFgColor={setFgColor}
                    onBgColor={setBgColor}
                    onSwap={swapColors}
                    palette={palette}
                    onAddSwatch={addSwatch}
                    onRemoveSwatch={removeSwatch}
                    onEditSwatch={editSwatch}
                    onReorderSwatch={reorderSwatch}
                    onImportImage={importImagePalette}
                    onImportProjectPalette={importProjectPalette}
                    pinned={false}
                    onTogglePin={toggleSidebarPin}
                    onPeekSelect={colorPeek.close}
                    gradientOpen={gradientOpen}
                    onToggleGradient={() => setGradientOpen((v) => !v)}
                  />
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {globalMagnifier && <EyedropperMagnifier {...globalMagnifier} />}

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onionSkin={onionSkin}
        onToggleOnionSkin={() => setOnionSkin((o) => !o)}
        eraseToBg={eraseToBg}
        onToggleEraseToBg={() => setEraseToBg((v) => !v)}
      />

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        ctx={commandCtx}
      />

      <ClassicPalettesDialog
        open={classicPalettesOpen}
        onSelect={(p) => {
          setClassicPalettesOpen(false)
          setPendingMerge({
            title: p.name,
            description: `Load the ${p.colors.length} colors of the ${p.name} palette? Replace the palette with these, or add only the ones not already in it?`,
            colors: p.colors,
          })
        }}
        onClose={() => setClassicPalettesOpen(false)}
      />

      <MergeColorsDialog
        colors={pendingMerge?.colors ?? null}
        title={pendingMerge?.title ?? ''}
        description={pendingMerge?.description ?? ''}
        onReplace={() => { dispatch({ type: 'SET_PALETTE', palette: pendingMerge!.colors }); setPendingMerge(null) }}
        onAddUnique={() => { dispatch({ type: 'MERGE_SWATCHES', colors: pendingMerge!.colors }); setPendingMerge(null) }}
        onClose={() => setPendingMerge(null)}
      />

      <AdjustHslDialog
        open={hslOpen}
        hasSelection={!!selection}
        frameCount={activeSprite.frameCount}
        onChange={(dh, ds, dv, allFrames) => {
          const frames = allFrames ? Array.from({ length: activeSprite.frameCount }, (_, i) => i) : [safeFrame]
          dispatch({ type: 'ADJUST_HSL', spriteId: activeSprite.id, layerId: safeLayerId, frames, dh, ds, dv, clip: selection ?? undefined })
        }}
        onApply={() => { dispatch({ type: 'STROKE_END' }); setHslOpen(false) }}
        onCancel={() => { dispatch({ type: 'STROKE_CANCEL' }); setHslOpen(false) }}
      />
    </div>
  )
}

// Topmost layer in the stack (last in array; rendered first in the panel).
function topLayer(sprite: Sprite) {
  return sprite.layers[sprite.layers.length - 1]
}
