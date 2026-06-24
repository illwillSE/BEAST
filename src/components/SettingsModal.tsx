import { useEffect, useRef, useState } from 'react'
import { Eraser, Eye, X } from 'lucide-react'
import { clearAllStorage } from '../persist/autosave.js'
import { focusAdjacentButton } from '../hooks/dialogFocusNav.js'
import useEscapeKey from '../hooks/useEscapeKey.js'
import useFocusTrap from '../hooks/useFocusTrap.js'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  onionSkin: boolean
  onToggleOnionSkin: () => void
  eraseToBg: boolean
  onToggleEraseToBg: () => void
}

type TabId = 'onion-skin' | 'eraser' | 'system'

// Tab list lives here so adding a new settings section later is just another
// entry + another `activeTab === id` branch below.
const TABS: { id: TabId; label: string }[] = [
  { id: 'onion-skin', label: 'Onion Skin' },
  { id: 'eraser', label: 'Eraser' },
  { id: 'system', label: 'System' },
]

const CONFIRM_WORD = 'yes'

// Settings modal opened from the Header cogwheel. Tabbed shell so future
// settings can be added as sibling panes; onion skin (moved out of
// FramesTimeline) is the first tab.
export default function SettingsModal({ open, onClose, onionSkin, onToggleOnionSkin, eraseToBg, onToggleEraseToBg }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('onion-skin')
  const [confirmingClearData, setConfirmingClearData] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const confirmFormRef = useRef<HTMLFormElement>(null)
  const firstTabRef = useRef<HTMLButtonElement>(null)

  // Without this, focus stays on the cogwheel button that opened the modal —
  // Tab would then walk through the rest of the page before ever reaching
  // the dialog, instead of cycling within it right away.
  useEffect(() => {
    if (open) firstTabRef.current?.focus()
  }, [open])

  // Escape closes whichever layer is on top: the "clear data" confirm if
  // it's up, otherwise the settings modal itself.
  useEscapeKey(open, () => {
    if (confirmingClearData) setConfirmingClearData(false)
    else onClose()
  })

  // Only one layer traps Tab at a time — the confirm dialog while it's up,
  // otherwise the main panel.
  useFocusTrap(open && !confirmingClearData, panelRef)
  useFocusTrap(confirmingClearData, confirmFormRef)

  if (!open) return null

  const clearData = async () => {
    await clearAllStorage()
    window.location.reload()
  }

  return (
    <div className="fixed inset-0 bg-black/50 grid place-items-center z-50" onMouseDown={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        onMouseDown={(e) => e.stopPropagation()}
        className="bg-panel border border-divider rounded-lg shadow-xl w-[28rem] h-72 flex"
      >
        <nav className="w-32 border-r border-divider p-2 flex flex-col gap-0.5 shrink-0">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={i === 0 ? firstTabRef : undefined}
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

          {activeTab === 'eraser' && (
            <button
              onClick={onToggleEraseToBg}
              className={'flex items-center gap-1.5 text-[11px] select-none ' + (eraseToBg ? 'text-muted' : 'text-faint')}
            >
              <span
                className={
                  'grid place-items-center w-4 h-4 rounded-sm border ' +
                  (eraseToBg ? 'bg-accent-deep/20 border-accent-deep text-accent-bright' : 'border-edge text-faint')
                }
              >
                <Eraser size={11} />
              </span>
              Erase to background color
            </button>
          )}

          {activeTab === 'system' && (
            <div>
              <p className="text-[11px] text-faint mb-3">
                Erases every BEAST project and setting saved in this browser
                (autosave, palettes, preview panel). This can't be undone.
              </p>
              <button
                onClick={() => { setConfirmText(''); setConfirmingClearData(true) }}
                className="px-2.5 py-1.5 rounded text-sm bg-danger-deep/15 hover:bg-danger-deep/25 text-danger-bright border border-danger-deep/40"
              >
                Clear all local data
              </button>
            </div>
          )}
        </div>
      </div>

      {confirmingClearData && (
        <div
          className="fixed inset-0 bg-black/50 grid place-items-center z-50"
          onMouseDown={() => setConfirmingClearData(false)}
        >
          <form
            ref={confirmFormRef}
            role="dialog"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              if (confirmText.trim().toLowerCase() !== CONFIRM_WORD) return
              clearData()
            }}
            className="bg-panel border border-divider rounded-lg p-4 w-72 shadow-xl"
          >
            <h2 className="text-sm font-semibold text-ink mb-3">Clear all local data?</h2>
            <p className="text-[11px] text-faint mb-3">
              Type <span className="text-ink-soft font-medium">yes</span> to permanently delete all
              BEAST data saved in this browser.
            </p>
            <input
              autoFocus
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full bg-well text-sm text-ink-soft rounded px-2 py-1.5 border border-edge mb-4"
            />
            <div className="flex justify-end gap-2" onKeyDown={focusAdjacentButton}>
              <button
                type="button"
                onClick={() => setConfirmingClearData(false)}
                className="px-2.5 py-1.5 rounded text-sm bg-surface hover:bg-surface-hover text-ink-soft"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={confirmText.trim().toLowerCase() !== CONFIRM_WORD}
                className="px-2.5 py-1.5 rounded text-sm bg-danger-deep/15 hover:bg-danger-deep/25 text-danger-bright border border-danger-deep/40 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Delete everything
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
