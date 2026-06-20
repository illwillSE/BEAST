// Bridge for the colors Tailwind can't reach: canvas `fillStyle`/`strokeStyle`.
// Reads the same `@theme` tokens defined in `src/theme.css` (exposed as CSS
// custom properties on :root), so the palette stays the single source of
// truth — no duplicated hex. Carried over from BLAST's `theme/colors.js`.
//
//   getColor('accent')        → '#fbbf24'
//   getColor('accent-deep', '88') → '#f59e0b88'  (append baked-in alpha)

export function getColor(name, alpha = '') {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(`--color-${name}`)
    .trim()
  return v + alpha
}
