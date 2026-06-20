import { useEffect, useReducer, useRef, useState } from 'react'
import Header from './components/Header.jsx'
import ToolRail from './components/ToolRail.jsx'
import SpriteList from './components/SpriteList.jsx'
import CanvasStage from './components/CanvasStage.jsx'
import LayersPanel from './components/LayersPanel.jsx'
import ColorPanel from './components/ColorPanel.jsx'
import FramesTimeline from './components/FramesTimeline.jsx'
import { createDocument, copyRegion } from './document/model.js'
import { historyReducer, initHistory } from './document/reducer.js'
import { saveAutosave, loadAutosave } from './persist/autosave.js'
import { loadPreviewPrefs } from './persist/previewPrefs.js'
import { projectToZipBlob, projectFromZipFile, downloadBlob } from './persist/zip.js'
import { matchShortcut, isTypingTarget } from './shortcuts/registry.js'

// BEAST shell. The pixel document lives behind the history reducer; the pencil
// draws into the active sprite/layer/frame with undo/redo. Sprite/layer/frame
// selection drives the paint target — painting follows the UI. The project
// autosaves to the browser and can be saved/loaded as a .zip.
export default function App() {
  const [tool, setTool] = useState('pencil')
  const [color, setColor] = useState('#fbbf24')

  // Select/move/clipboard state. `selection` is a rect on the active layer's
  // current frame; `floating` is pixels lifted out of the layer by a move or
  // paste, rendered on top until something commits them (see commitFloating).
  const [selection, setSelection] = useState(null)
  const [floating, setFloating] = useState(null)
  const [clipboard, setClipboard] = useState(null)
  // Pending crop window from the Crop tool — { x, y, w, h, target } — stays
  // editable (movable) until committed/cancelled (see commitCrop/cancelCrop).
  const [cropPending, setCropPending] = useState(null)
  const [mirrorV, setMirrorV] = useState(false)
  const [mirrorH, setMirrorH] = useState(false)
  const [filled, setFilled] = useState({ rect: false, ellipse: false })
  const setToolVariant = (id, v) => setFilled((f) => ({ ...f, [id]: v }))
  const [previewOpen, setPreviewOpen] = useState(() => loadPreviewPrefs()?.open ?? false)

  const [state, dispatch] = useReducer(historyReducer, undefined, () => initHistory(createDocument()))
  const doc = state.present

  // Active selection. The active sprite falls back to the first if the id is
  // stale (e.g. just after loading a different project); layer/frame are
  // clamped to what the active sprite actually has, so target is always valid.
  const [spriteId, setSpriteId] = useState(() => doc.sprites[0].id)
  const [layerId, setLayerId] = useState(() => topLayer(doc.sprites[0]).id)
  const [frameIndex, setFrameIndex] = useState(0)

  const activeSprite = doc.sprites.find((s) => s.id === spriteId) ?? doc.sprites[0]
  const safeLayerId = activeSprite.layers.some((l) => l.id === layerId) ? layerId : topLayer(activeSprite).id
  const safeFrame = frameIndex < activeSprite.frameCount ? frameIndex : 0

  const selectSprite = (id) => {
    const sp = doc.sprites.find((s) => s.id === id)
    setSpriteId(id)
    setLayerId(topLayer(sp).id)
    setFrameIndex(0)
  }

  // Point selection at a freshly loaded document's first sprite.
  const resetSelection = (nextDoc) => {
    setSpriteId(nextDoc.sprites[0].id)
    setLayerId(topLayer(nextDoc.sprites[0]).id)
    setFrameIndex(0)
  }

  const target = { spriteId: activeSprite.id, layerId: safeLayerId, frameIndex: safeFrame }

  const getActiveCell = () => activeSprite.layers.find((l) => l.id === safeLayerId).cells[safeFrame]

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
    setTool('move')
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

  // Routes keydown through the shortcut registry: Cmd/Ctrl+Z undo,
  // Cmd/Ctrl+Shift+Z (or Ctrl+Y) redo, Cmd/Ctrl+C/X/V for the selection
  // clipboard, Escape to commit a floating move/paste (and cancel a pending
  // crop) and deselect, Enter to commit a pending crop, and a letter per tool
  // (see each tool's `key` in tools/registry.js).
  useEffect(() => {
    const ctx = {
      dispatch, setTool, tool, filled, setVariant: setToolVariant,
      copySelection, cutSelection, pasteClipboard, commitFloating, setSelection,
      commitCrop, cancelCrop,
    }
    const onKey = (e) => {
      if (isTypingTarget(e.target)) return
      const shortcut = matchShortcut(e)
      if (!shortcut) return
      e.preventDefault()
      shortcut.run(ctx)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [floating, selection, clipboard, activeSprite, safeLayerId, safeFrame, tool, filled, cropPending])

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
    downloadBlob(await projectToZipBlob(doc), 'beast-project.zip')
  }

  const handleOpen = async (file) => {
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
        projectName={activeSprite.name}
        onSave={handleSave}
        onOpen={handleOpen}
        previewOpen={previewOpen}
        onTogglePreview={() => setPreviewOpen((o) => !o)}
      />

      <div className="flex-1 flex min-h-0">
        <ToolRail
          active={tool}
          onPick={setTool}
          filled={filled}
          onFilled={setToolVariant}
          mirrorV={mirrorV}
          mirrorH={mirrorH}
          onMirrorV={() => setMirrorV((v) => !v)}
          onMirrorH={() => setMirrorH((v) => !v)}
        />
        <SpriteList sprites={doc.sprites} selectedId={spriteId} onSelect={selectSprite} dispatch={dispatch} />

        <CanvasStage
          tool={tool}
          color={color}
          onColor={setColor}
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
          mirrorV={mirrorV}
          mirrorH={mirrorH}
          previewOpen={previewOpen}
          onClosePreview={() => setPreviewOpen(false)}
        />

        <aside className="w-64 bg-panel border-l border-divider flex flex-col overflow-y-auto shrink-0">
          <LayersPanel
            layers={activeSprite.layers}
            selectedId={safeLayerId}
            onSelect={setLayerId}
            spriteId={activeSprite.id}
            dispatch={dispatch}
          />
          <ColorPanel color={color} onColor={setColor} />
        </aside>
      </div>

      <FramesTimeline
        sprite={activeSprite}
        frameCount={activeSprite.frameCount}
        active={safeFrame}
        onPick={setFrameIndex}
        spriteId={activeSprite.id}
        dispatch={dispatch}
      />
    </div>
  )
}

// Topmost layer in the stack (last in array; rendered first in the panel).
function topLayer(sprite) {
  return sprite.layers[sprite.layers.length - 1]
}
