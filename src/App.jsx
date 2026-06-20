import { useEffect, useReducer, useState } from 'react'
import Header from './components/Header.jsx'
import ToolRail from './components/ToolRail.jsx'
import SpriteList from './components/SpriteList.jsx'
import CanvasStage from './components/CanvasStage.jsx'
import LayersPanel from './components/LayersPanel.jsx'
import ColorPanel from './components/ColorPanel.jsx'
import FramesTimeline from './components/FramesTimeline.jsx'
import { createDocument } from './document/model.js'
import { historyReducer, initHistory } from './document/reducer.js'

// BEAST shell. The pixel document lives behind the history reducer; the pencil
// draws into the active sprite/layer/frame with undo/redo. Sprite/layer/frame
// selection drives the paint target — painting follows the UI.
export default function App() {
  const [tool, setTool] = useState('pencil')
  const [color, setColor] = useState('#fbbf24')

  const [state, dispatch] = useReducer(historyReducer, undefined, () => initHistory(createDocument()))
  const doc = state.present

  // Active selection. Layer/frame are reset to a valid value when the sprite
  // changes (ids and frame counts differ per sprite).
  const [spriteId, setSpriteId] = useState(() => doc.sprites[0].id)
  const activeSprite = doc.sprites.find((s) => s.id === spriteId) ?? doc.sprites[0]
  const [layerId, setLayerId] = useState(() => topLayer(activeSprite).id)
  const [frameIndex, setFrameIndex] = useState(0)

  const selectSprite = (id) => {
    const sp = doc.sprites.find((s) => s.id === id)
    setSpriteId(id)
    setLayerId(topLayer(sp).id)
    setFrameIndex(0)
  }

  const target = { spriteId: activeSprite.id, layerId, frameIndex }

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

  return (
    <div className="h-screen flex flex-col text-ink-soft">
      <Header />

      <div className="flex-1 flex min-h-0">
        <ToolRail active={tool} onPick={setTool} />
        <SpriteList sprites={doc.sprites} selectedId={spriteId} onSelect={selectSprite} />

        <CanvasStage
          tool={tool}
          color={color}
          sprite={activeSprite}
          target={target}
          dispatch={dispatch}
        />

        <aside className="w-64 bg-panel border-l border-divider flex flex-col overflow-y-auto shrink-0">
          <LayersPanel layers={activeSprite.layers} selectedId={layerId} onSelect={setLayerId} />
          <ColorPanel color={color} onColor={setColor} />
        </aside>
      </div>

      <FramesTimeline frameCount={activeSprite.frameCount} active={frameIndex} onPick={setFrameIndex} />
    </div>
  )
}

// Topmost layer in the stack (last in array; rendered first in the panel).
function topLayer(sprite) {
  return sprite.layers[sprite.layers.length - 1]
}
