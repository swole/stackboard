// Stackboard theme boot (0.5.0). A plain, render-blocking script in <head> of newtab.html and
// popup.html: it puts the saved palette, scheme, density and background on <html> before the
// first frame, so a dark board never flashes cream. Extension pages allow no inline script, hence
// this file. It reads the localStorage mirror that store/useAppearance.ts writes (the settings
// themselves live in chrome.storage.local, which is async and too late for the first paint).
// 0.7.0: the mirror's `look` is the Pro look on screen (accent colours, font, tile size,
// wallpaper, and time of day since 0.9.0), worked out in lib/looks.ts; it is empty while Pro is off.
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
  var look = a.look && typeof a.look === 'object' ? a.look : {}
  // 0.9.0: time of day (Pro) is light from 07:00 to 19:00 by this computer's clock and dark the rest
  // of the day (keep in step with DAY_STARTS and DAY_ENDS in lib/appearance.ts).
  var timed = look.timeOfDay === true
  var hour = new Date().getHours()
  var asked = timed ? (hour >= 7 && hour < 19 ? 'light' : 'dark') : mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode
  var scheme = a.only === 'light' || a.only === 'dark' ? a.only : asked
  root.setAttribute('data-palette', typeof a.palette === 'string' ? a.palette : 'stackboard')
  root.setAttribute('data-mode', timed ? 'time' : mode)
  root.setAttribute('data-scheme', scheme)
  root.setAttribute('data-density', a.density === 'compact' ? 'compact' : 'comfortable')

  var hex = /^#[0-9a-f]{6}$/i
  if (typeof look.accent === 'string' && hex.test(look.accent) && look.vars && typeof look.vars === 'object') {
    for (var name in look.vars) {
      if (name.indexOf('--sb-custom-') === 0 && hex.test(look.vars[name])) root.style.setProperty(name, look.vars[name])
    }
    root.setAttribute('data-accent', 'custom')
  }
  if (typeof look.fontStack === 'string' && look.fontStack) root.style.setProperty('--font-sans', look.fontStack)
  root.setAttribute('data-font', typeof look.font === 'string' ? look.font : 'default')
  root.setAttribute('data-tile', look.tile === 'small' || look.tile === 'large' ? look.tile : 'medium')

  // Backgrounds belong to the board only, never the toolbar popup.
  if (root.hasAttribute('data-board')) {
    var wallpaper = typeof look.wallpaper === 'string' && /^[a-z]{2,16}$/.test(look.wallpaper) ? look.wallpaper : null
    root.setAttribute('data-bg', wallpaper ? 'wallpaper' : a.bg === 'gradient' || a.bg === 'image' ? a.bg : 'solid')
    root.setAttribute('data-gradient', a.gradient === 2 || a.gradient === 3 ? String(a.gradient) : '1')
    if (wallpaper) root.setAttribute('data-wallpaper', wallpaper)
  }
})()
