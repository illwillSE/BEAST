import { useState } from 'react'
import usePeek from './usePeek.js'

// Pin/peek state for a foldable chrome panel that owns its own slice of
// screen real estate (no siblings sharing the same space). Pinned (default)
// renders the panel inline, same as before this feature existed. Unpinning
// collapses it to an edge tab; clicking the tab peeks it open as an overlay.
export default function useFoldable() {
  const [pinned, setPinned] = useState(true)
  const peek = usePeek()

  return {
    pinned,
    peeking: peek.peeking,
    ref: peek.ref,
    togglePin: () => { setPinned((p) => !p); peek.close() },
    togglePeek: peek.toggle,
    closePeek: peek.close,
  }
}
