// Module-level singleton tracking the most recent pointer position anywhere
// in the window. Lets a tool that just activated (toolbar click, keyboard
// shortcut) show position-dependent UI (the eyedropper magnifier) right away
// instead of waiting for the next pointermove.
let last: { clientX: number; clientY: number } | null = null

if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', (e) => { last = { clientX: e.clientX, clientY: e.clientY } }, { passive: true })
}

export const getLastPointer = () => last
