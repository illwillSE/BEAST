import { useEffect } from 'react'

// Closes a dialog on Escape regardless of which element inside it has focus
// — a plain onKeyDown on the dialog wouldn't fire if focus never landed
// inside it, so this listens on the document instead.
export default function useEscapeKey(active: boolean, onTrigger: () => void) {
  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onTrigger()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [active, onTrigger])
}
