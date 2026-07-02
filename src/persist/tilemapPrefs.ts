// Workspace prefs for the Tilemap panel (position/size/zoom/open state) —
// window chrome only; the tilemap's cell contents live in the document.
// All failures are swallowed so persistence never breaks editing.

const KEY = 'beast.tilemap-panel'

export interface TilemapPrefs {
  open: boolean
  x: number
  y: number
  w: number
  h: number
  scale: number
}

export function loadTilemapPrefs(): TilemapPrefs | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveTilemapPrefs(prefs: TilemapPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch (err) {
    console.warn('BEAST tilemap-panel prefs save failed', err)
  }
}
