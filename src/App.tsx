import { useEffect, useReducer, useRef, useState } from 'react'
import Header from './components/Header.jsx'
import ToolRail from './components/ToolRail.jsx'
import SpriteList from './components/SpriteList.jsx'
import CanvasStage from './components/CanvasStage.jsx'
import LayersPanel from './components/LayersPanel.jsx'
import ColorPanel from './components/ColorPanel.jsx'
import FramesTimeline from './components/FramesTimeline.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import FoldTab from './components/FoldTab.jsx'
import EyedropperMagnifier from './components/EyedropperMagnifier.jsx'
import useFoldable from './hooks/useFoldable.js'
import usePeek from './hooks/usePeek.js'
import { useGlobalEyedropper } from './hooks/useGlobalEyedropper.js'
import { createDocument, copyRegion, rgbaToHex, compositeFrame } from './document/model.js'
import { historyReducer, initHistory } from './document/reducer.js'
import { saveAutosave, loadAutosave } from './persist/autosave.js'
import { loadPreviewPrefs } from './persist/previewPrefs.js'
import { projectToZipBlob, projectFromZipFile, projectPaletteFromZipFile, downloadBlob } from './persist/zip.js'
import { matchShortcut, isTypingTarget } from './shortcuts/registry.js'
import type { BrushShape, Cell, Doc, Sprite } from './document/model.js'
import type { Rect, Floating, CropPending } from './tools/registry.js'

interface Clipboard {
  w: number
  h: number
  data: Cell
}

// BEAST shell. The pixel document lives behind the history reducer; the pencil
// draws into the active sprite/layer/frame with undo/redo. Sprite/layer/frame
// selection drives the paint target — painting follows the UI. The project
// autosaves to the browser and can be saved/loaded as a .zip.
export default function App() {
  const [tool, setTool] = useState('pencil')
  const [temporaryToolReturn, setTemporaryToolReturn] = useState<string | null>(null)
  const [fgColor, setFgColor] = useState('#fbbf24')
  const [bgColor, setBgColor] = useState('#ffffff')
  const swapColors = () => {
    setFgColor(bgColor)
    setBgColor(fgColor)
  }
  // Select/move/clipboard state. `selection` is a rect on the active layer's
  // current frame; `floating` is pixels lifted out of the layer by a move or
  // paste, rendered on top until something commits them (see commitFloating).
  const [selection, setSelection] = useState<Rect | null>(null)
  const [floating, setFloating] = useState<Floating | null>(null)
  const [clipboard, setClipboard] = useState<Clipboard | null>(null)
  // Pending crop window from the Crop tool — { x, y, w, h, target } — stays
  // editable (movable) until committed/cancelled (see commitCrop/cancelCrop).
  const [cropPending, setCropPending] = useState<CropPending | null>(null)
  const [mirrorV, setMirrorV] = useState(false)
  const [mirrorH, setMirrorH] = useState(false)
  const [filled, setFilled] = useState<Record<string, boolean>>({ rect: false, ellipse: false })
  const setToolVariant = (id: string, v: boolean) => setFilled((f) => ({ ...f, [id]: v }))
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
  const [settingsOpen, setSettingsOpen] = useState(false)

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
    setClipboard({ w: selection.w, h: selection.h, data: copyRegion(getActiveCell(), activeSprite.w, activeSprite.h, selection.x, selection.y, selection.w, selection.h) })
  }

  const cutSelection = () => {
    if (floating) { setClipboard({ w: floating.w, h: floating.h, data: floating.data.slice() }); setFloating(null); return }
    if (!selection) return
    setClipboard({ w: selection.w, h: selection.h, data: copyRegion(getActiveCell(), activeSprite.w, activeSprite.h, selection.x, selection.y, selection.w, selection.h) })
    dispatch({ type: 'CLEAR_REGION', ...target, x: selection.x, y: selection.y, w: selection.w, h: selection.h })
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
  }, [tool])

  // Switching the paint target mid-crop would apply the crop to the wrong
  // sprite, so discard rather than commit.
  useEffect(() => {
    commitFloating()
    setSelection(null)
    cancelCrop()
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
  // Cmd/Ctrl+Shift+Z (or Ctrl+Y) redo, Cmd/Ctrl+C/X/V for the selection
  // clipboard, Escape to commit a floating move/paste (and cancel a pending
  // crop) and deselect, Enter to commit a pending crop, Left/Right to step
  // frames, and a letter per tool (see each tool's `key` in tools/registry.js).
  useEffect(() => {
    const ctx = {
      dispatch, setTool: selectTool, setTemporaryTool: selectTemporaryTool,
      tool, filled, setVariant: setToolVariant, brushSize, setBrushSize,
      copySelection, cutSelection, pasteClipboard, commitFloating, setSelection,
      commitCrop, cancelCrop, swapColors, stepFrame,
    }
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      const shortcut = matchShortcut(e)
      if (!shortcut) return
      e.preventDefault()
      shortcut.run(ctx)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [floating, selection, clipboard, activeSprite, safeLayerId, safeFrame, tool, filled, brushSize, cropPending, fgColor, bgColor])

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
  }

  const handleOpen = async (file: File) => {
    try {
      const loaded = await projectFromZipFile(file)
      dispatch({ type: 'REPLACE', doc: loaded })
      resetSelection(loaded)
    } catch (err) {
      console.warn('BEAST project load failed', err)
      window.alert('Could not open that file — it is not a valid BEAST project.')
    }
  }

  return (
    <div className="h-screen flex flex-col text-ink-soft">
      <Header
        projectName={doc.name}
        onRenameProject={(name) => dispatch({ type: 'RENAME_PROJECT', name })}
        onSave={handleSave}
        onOpen={handleOpen}
        onImportPng={importSpritePng}
        onExportPng={handleExportPng}
        previewOpen={previewOpen}
        onTogglePreview={() => setPreviewOpen((o) => !o)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <div className="flex-1 flex min-h-0">
            <ToolRail
              active={tool}
              onPick={selectTool}
              filled={filled}
              onFilled={setToolVariant}
              mirrorV={mirrorV}
              mirrorH={mirrorH}
              onMirrorV={() => setMirrorV((v) => !v)}
              onMirrorH={() => setMirrorH((v) => !v)}
            />
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

            <CanvasStage
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
      />
    </div>
  )
}

// Topmost layer in the stack (last in array; rendered first in the panel).
function topLayer(sprite: Sprite) {
  return sprite.layers[sprite.layers.length - 1]
}
