import { Pin, PinOff } from 'lucide-react'

interface PinToggleProps {
  pinned: boolean
  onClick: () => void
}

// Sits next to a panel's title. Pinned panels stay inline always (today's
// behavior); unpinning lets the panel fold to an edge tab (see FoldTab).
export default function PinToggle({ pinned, onClick }: PinToggleProps) {
  return (
    <button
      title={pinned ? 'Unpin (collapsible)' : 'Pin open'}
      onClick={onClick}
      className={pinned ? 'text-muted hover:text-ink' : 'text-accent-bright hover:text-accent-soft'}
    >
      {pinned ? <Pin size={13} /> : <PinOff size={13} />}
    </button>
  )
}
