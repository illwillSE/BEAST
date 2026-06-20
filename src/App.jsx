import { useState } from 'react'
import Header from './components/Header.jsx'
import ToolRail from './components/ToolRail.jsx'
import SpriteList from './components/SpriteList.jsx'
import CanvasStage from './components/CanvasStage.jsx'
import LayersPanel from './components/LayersPanel.jsx'
import ColorPanel from './components/ColorPanel.jsx'
import FramesTimeline from './components/FramesTimeline.jsx'

// BEAST mockup shell. Only selection state is wired (active tool / sprite /
// frame / color) so the layout shows highlights; nothing actually draws yet.
export default function App() {
  const [tool, setTool] = useState('pencil')
  const [sprite, setSprite] = useState('s1')
  const [frame, setFrame] = useState(1)
  const [color, setColor] = useState('#fbbf24')

  return (
    <div className="h-screen flex flex-col text-ink-soft">
      <Header />

      <div className="flex-1 flex min-h-0">
        <ToolRail active={tool} onPick={setTool} />
        <SpriteList selected={sprite} onSelect={setSprite} />

        <CanvasStage tool={tool} />

        <aside className="w-64 bg-panel border-l border-divider flex flex-col overflow-y-auto shrink-0">
          <LayersPanel />
          <ColorPanel color={color} onColor={setColor} />
        </aside>
      </div>

      <FramesTimeline active={frame} onPick={setFrame} />
    </div>
  )
}
