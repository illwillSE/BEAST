// Workspace prefs for the Real Preview panel (position/size/zoom/open state).
// All failures are swallowed so persistence never breaks editing.

const KEY = 'beast.preview-panel'

export function loadPreviewPrefs() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function savePreviewPrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch (err) {
    console.warn('BEAST preview-panel prefs save failed', err)
  }
}
