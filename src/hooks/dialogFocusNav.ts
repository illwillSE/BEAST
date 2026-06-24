import type { KeyboardEvent } from 'react'

// Lets arrow keys move focus between a dialog's footer buttons (Cancel /
// primary action, etc.), the same way Tab already does. Attach directly to
// the footer's container element so e.currentTarget only ever sees that
// row's own buttons.
export function focusAdjacentButton(e: KeyboardEvent<HTMLElement>) {
  const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
    : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1
    : 0
  if (!dir) return

  const buttons = Array.from(e.currentTarget.querySelectorAll('button'))
  const idx = buttons.indexOf(document.activeElement as HTMLButtonElement)
  if (idx === -1) return

  e.preventDefault()
  buttons[(idx + dir + buttons.length) % buttons.length]?.focus()
}
