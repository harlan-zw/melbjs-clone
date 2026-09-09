// The page colour: three feedback reports asked for green, yellow and red,
// so the page ships all three. The pick lands in localStorage so the next
// visit keeps it, and a blocked store leaves the default green in place.
(function () {
  var KEY = 'melbjs-theme'
  var THEMES = ['green', 'yellow', 'red']
  var root = document.documentElement
  var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-theme-option]'))
  if (!buttons.length)
    return

  function apply(theme) {
    root.setAttribute('data-theme', theme)
    buttons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.themeOption === theme))
    })
  }

  function pick(theme) {
    if (THEMES.indexOf(theme) === -1)
      return
    apply(theme)
    try {
      localStorage.setItem(KEY, theme)
    }
    catch {
      // Storage can be disabled. The pick lives for this page only.
    }
  }

  var stored = null
  try {
    stored = localStorage.getItem(KEY)
  }
  catch {
    // Storage can be disabled. Keep the default green.
  }
  apply(THEMES.indexOf(stored) === -1 ? 'green' : stored)

  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      pick(button.dataset.themeOption)
    })
  })
})()
