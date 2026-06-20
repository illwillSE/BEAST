import { useEffect, useReducer, useRef, useState } from 'react'
import Header from './components/Header.jsx'
import ToolRail from './components/ToolRail.jsx'
import SpriteList from './components/SpriteList.jsx'
import CanvasStage from './components/CanvasStage.jsx'
import LayersPanel from './components/LayersPanel.jsx'
import ColorPanel from './components/ColorPanel.jsx'
import FramesTimeline from './components/FramesTimeline.jsx'
import { createDocument } from './document/model.js'
import { historyReducer, initHistory } from './document/reducer.js'
import { saveAutosave, loadAutosave } from './persist/autosave.js'
import { projectToZipBlob, projectFromZipFile, downloadBlob } from './persist/zip.js'

// BEAST shell. The pixel document lives behind the history reducer; the pencil
// draws into the active sprite/layer/frame with undo/redo. Sprite/layer/frame
// selection drives the paint target — painting follows the UI. The project
// autosaves to the browser and can be saved/loaded as a .zip.
export default function App() {
  const [tool, setTool] = useState('pencil')
  const [color, setColor] = useState('#fbbf24')

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

  // Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z (or Ctrl+Y) redo.
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const k = e.key.toLowerCase()
      if (k === 'z') { e.preventDefault(); dispatch({ type: e.shiftKey ? 'REDO' : 'UNDO' }) }
      else if (k === 'y') { e.preventDefault(); dispatch({ type: 'REDO' }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
      <Header projectName={activeSprite.name} onSave={handleSave} onOpen={handleOpen} />

      <div className="flex-1 flex min-h-0">
        <ToolRail active={tool} onPick={setTool} />
        <SpriteList sprites={doc.sprites} selectedId={spriteId} onSelect={selectSprite} />

        <CanvasStage
          tool={tool}
          color={color}
          onColor={setColor}
          sprite={activeSprite}
          target={target}
          dispatch={dispatch}
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
