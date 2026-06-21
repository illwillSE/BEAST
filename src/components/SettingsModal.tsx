import { useState } from 'react'
import { Eye, X } from 'lucide-react'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  onionSkin: boolean
  onToggleOnionSkin: () => void
}

type TabId = 'onion-skin'

// Tab list lives here so adding a new settings section later is just another
// entry + another `activeTab === id` branch below.
const TABS: { id: TabId; label: string }[] = [
  { id: 'onion-skin', label: 'Onion Skin' },
]

// Settings modal opened from the Header cogwheel. Tabbed shell so future
// settings can be added as sibling panes; onion skin (moved out of
// FramesTimeline) is the first tab.
export default function SettingsModal({ open, onClose, onionSkin, onToggleOnionSkin }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('onion-skin')

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 grid place-items-center z-50" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="bg-panel border border-divider rounded-lg shadow-xl w-[28rem] h-72 flex"
      >
        <nav className="w-32 border-r border-divider p-2 flex flex-col gap-0.5 shrink-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={
                'text-left px-2 py-1.5 rounded text-sm ' +
                (activeTab === t.id
                  ? 'bg-accent-deep/15 text-accent-bright'
                  : 'text-muted hover:bg-surface-hover hover:text-ink-soft')
              }
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 p-4 min-w-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink">Settings</h2>
            <button onClick={onClose} className="text-faint hover:text-ink-soft">
              <X size={15} />
            </button>
          </div>

          {activeTab === 'onion-skin' && (
            <button
              onClick={onToggleOnionSkin}
              className={'flex items-center gap-1.5 text-[11px] select-none ' + (onionSkin ? 'text-muted' : 'text-faint')}
            >
              <span
                className={
                  'grid place-items-center w-4 h-4 rounded-sm border ' +
                  (onionSkin ? 'bg-accent-deep/20 border-accent-deep text-accent-bright' : 'border-edge text-faint')
                }
              >
                <Eye size={11} />
              </span>
              Onion skin
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
