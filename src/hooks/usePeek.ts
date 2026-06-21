import { useEffect, useRef, useState } from 'react'

// Temporary open/close state for a folded panel's peek overlay — opens on
// demand, closes again on an outside click or when the panel calls close()
// (its primary "select" action).
export default function usePeek() {
  const [peeking, setPeeking] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!peeking) return
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setPeeking(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [peeking])

  return {
    peeking,
    ref,
    toggle: () => setPeeking((p) => !p),
    close: () => setPeeking(false),
  }
}
