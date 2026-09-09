// The hacker-mode easter egg: the Konami code (↑ ↑ ↓ ↓ ← → ← → B A) flips
// a green-on-black terminal theme onto <html>. Type it again to flip it
// back. The console drops the hint so the code is discoverable.
(function () {
  var CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']
  var progress = []

  function announce(on) {
    if (!document.body)
      return
    var note = document.getElementById('hacker-mode-status')
    if (!note) {
      note = document.createElement('p')
      note.id = 'hacker-mode-status'
      note.className = 'visually-hidden'
      note.setAttribute('role', 'status')
      document.body.appendChild(note)
    }
    note.textContent = on ? 'Hacker mode on. Type the code again to turn it off.' : 'Hacker mode off.'
  }

  function toggle() {
    var on = document.documentElement.classList.toggle('hacker')
    announce(on)
  }

  document.addEventListener('keydown', function (event) {
    if (event.ctrlKey || event.metaKey || event.altKey)
      return
    var tag = event.target && event.target.tagName
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || event.target.isContentEditable)
      return
    var key = event.key && event.key.length === 1 ? event.key.toLowerCase() : event.key
    if (key !== CODE[progress.length]) {
      progress = key === CODE[0] ? [key] : []
      return
    }
    progress.push(key)
    if (progress.length === CODE.length) {
      progress = []
      toggle()
    }
  })

  if (typeof console !== 'undefined' && typeof console.log === 'function')
    console.log('%chack the planet', 'color:#00ff41;font-family:monospace;font-weight:bold;font-size:16px', '↑ ↑ ↓ ↓ ← → ← → B A')
})()
