import { useState } from 'react'
import { Eye, X } from 'lucide-react'
import { clearAllStorage } from '../persist/autosave.js'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  onionSkin: boolean
  onToggleOnionSkin: () => void
  onNewProject: () => void
}

type TabId = 'onion-skin' | 'system'

// Tab list lives here so adding a new settings section later is just another
// entry + another `activeTab === id` branch below.
const TABS: { id: TabId; label: string }[] = [
  { id: 'onion-skin', label: 'Onion Skin' },
  { id: 'system', label: 'System' },
]

const CONFIRM_WORD = 'yes'

// Settings modal opened from the Header cogwheel. Tabbed shell so future
// settings can be added as sibling panes; onion skin (moved out of
// FramesTimeline) is the first tab.
export default function SettingsModal({ open, onClose, onionSkin, onToggleOnionSkin, onNewProject }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('onion-skin')
  const [pendingAction, setPendingAction] = useState<'clear-data' | 'new-project' | null>(null)
  const [confirmText, setConfirmText] = useState('')

  if (!open) return null

  const clearData = async () => {
    await clearAllStorage()
    window.location.reload()
  }

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

          {activeTab === 'system' && (
            <div>
              <p className="text-[11px] text-faint mb-3">
                Discards the current project from the editor and starts a blank one.
                Anything not saved or exported will be lost.
              </p>
              <button
                onClick={() => { setConfirmText(''); setPendingAction('new-project') }}
                className="px-2.5 py-1.5 rounded text-sm bg-surface hover:bg-surface-hover text-ink-soft border border-edge mb-4"
              >
                New project
              </button>

              <p className="text-[11px] text-faint mb-3">
                Erases every BEAST project and setting saved in this browser
                (autosave, palettes, preview panel). This can't be undone.
              </p>
              <button
                onClick={() => { setConfirmText(''); setPendingAction('clear-data') }}
                className="px-2.5 py-1.5 rounded text-sm bg-danger-deep/15 hover:bg-danger-deep/25 text-danger-bright border border-danger-deep/40"
              >
                Clear all local data
              </button>
            </div>
          )}
        </div>
      </div>

      {pendingAction && (
        <div
          className="fixed inset-0 bg-black/50 grid place-items-center z-50"
          onMouseDown={() => setPendingAction(null)}
        >
          <form
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              if (confirmText.trim().toLowerCase() !== CONFIRM_WORD) return
              if (pendingAction === 'clear-data') clearData()
              else { onNewProject(); setPendingAction(null) }
            }}
            className="bg-panel border border-divider rounded-lg p-4 w-72 shadow-xl"
          >
            <h2 className="text-sm font-semibold text-ink mb-3">
              {pendingAction === 'clear-data' ? 'Clear all local data?' : 'Start a new project?'}
            </h2>
            <p className="text-[11px] text-faint mb-3">
              Type <span className="text-ink-soft font-medium">yes</span> to{' '}
              {pendingAction === 'clear-data'
                ? 'permanently delete all BEAST data saved in this browser.'
                : 'discard the current project and start a blank one.'}
            </p>
            <input
              autoFocus
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full bg-well text-sm text-ink-soft rounded px-2 py-1.5 border border-edge mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                className="px-2.5 py-1.5 rounded text-sm bg-surface hover:bg-surface-hover text-ink-soft"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={confirmText.trim().toLowerCase() !== CONFIRM_WORD}
                className="px-2.5 py-1.5 rounded text-sm bg-danger-deep/15 hover:bg-danger-deep/25 text-danger-bright border border-danger-deep/40 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {pendingAction === 'clear-data' ? 'Delete everything' : 'Start new project'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
