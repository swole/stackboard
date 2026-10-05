// Stackboard theme boot (0.5.0). A plain, render-blocking script in <head> of newtab.html and
// popup.html: it puts the saved palette, scheme, density and background on <html> before the
// first frame, so a dark board never flashes cream. Extension pages allow no inline script, hence
// this file. It reads the localStorage mirror that store/useAppearance.ts writes (the settings
// themselves live in chrome.storage.local, which is async and too late for the first paint).
;(function () {
  var root = document.documentElement
  var saved = null
  try {
    saved = JSON.parse(localStorage.getItem('stackable:appearance') || 'null')
  } catch (e) {
    saved = null
  }
  var a = saved && typeof saved === 'object' ? saved : {}
  var mode = a.mode === 'light' || a.mode === 'dark' ? a.mode : 'system'
  var prefersDark = false
  try {
    prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch (e) {
    prefersDark = false
  }
  var scheme = a.only === 'light' || a.only === 'dark' ? a.only : mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode
  root.setAttribute('data-palette', typeof a.palette === 'string' ? a.palette : 'stackboard')
  root.setAttribute('data-mode', mode)
  root.setAttribute('data-scheme', scheme)
  root.setAttribute('data-density', a.density === 'compact' ? 'compact' : 'comfortable')
  // Backgrounds belong to the board only, never the toolbar popup.
  if (root.hasAttribute('data-board')) {
    root.setAttribute('data-bg', a.bg === 'gradient' || a.bg === 'image' ? a.bg : 'solid')
    root.setAttribute('data-gradient', a.gradient === 2 || a.gradient === 3 ? String(a.gradient) : '1')
  }
})()
