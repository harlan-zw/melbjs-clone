// Mark Dalgleish dared the homepage to "do a breakthrough". Clicking the
// Melb.js title winds it up, punches the letters through the glass, cracks
// the screen, and quietly takes credit. Reduced motion keeps the credit line
// but drops the movement, and the CSS also kills the animations there.
;(function () {
  var title = document.querySelector('h1.heavy')
  if (!title || title.getAttribute('data-breakthrough') === 'ready')
    return
  var text = (title.textContent || '').trim()
  if (!text)
    return
  title.setAttribute('data-breakthrough', 'ready')

  var main = document.getElementById('main')
  var NOTE_DELAY = 1200
  var NOTE_VISIBLE = 3800
  var PUNCH_MS = 1500
  var SHAKE_MS = 900

  title.textContent = ''
  title.setAttribute('aria-label', text)
  title.setAttribute('tabindex', '0')
  title.setAttribute('aria-describedby', 'breakthrough-hint')
  var hint = document.createElement('span')
  hint.className = 'visually-hidden'
  hint.id = 'breakthrough-hint'
  hint.textContent = 'Activate to do a breakthrough'
  title.appendChild(hint)

  var wrap = document.createElement('span')
  wrap.className = 'breakthrough-title'
  wrap.setAttribute('aria-hidden', 'true')
  var letters = document.createElement('span')
  letters.className = 'breakthrough-letters'
  var center = (text.length - 1) / 2
  Array.prototype.forEach.call(text, function (char, i) {
    var letter = document.createElement('span')
    letter.className = 'breakthrough-letter'
    letter.textContent = char
    letter.style.setProperty('--bx', String(Math.round((i - center) * 90)))
    letter.style.setProperty('--by', String((i % 2 ? 1 : -1) * (26 + i * 7)))
    letter.style.setProperty('--br', String(Math.round((center - i) * -9)))
    letters.appendChild(letter)
  })
  wrap.appendChild(letters)
  wrap.insertAdjacentHTML('beforeend', '<svg class="breakthrough-crack" viewBox="0 0 600 300" aria-hidden="true" focusable="false"><g id="breakthrough-crack-lines" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="300 150 336 132 368 140 428 94"/><polyline points="300 150 268 120 276 84 244 40"/><polyline points="300 150 332 178 324 216 358 258"/><polyline points="300 150 252 160 214 138 150 152"/><polyline points="300 150 312 118 352 104 396 116 448 104"/><polyline points="300 150 282 176 240 188 196 232"/><polyline points="300 150 350 158 386 190 402 238"/><polyline points="300 150 262 142 226 108 178 112"/></g><use href="#breakthrough-crack-lines" stroke="rgba(240, 201, 135, 0.4)" stroke-width="10"/><use href="#breakthrough-crack-lines" stroke="rgba(255, 250, 240, 0.9)" stroke-width="3"/><circle cx="300" cy="150" r="13" fill="none" stroke="rgba(255, 250, 240, 0.85)" stroke-width="3"/></svg>')
  title.appendChild(wrap)

  var note = document.createElement('p')
  note.className = 'breakthrough-note'
  note.hidden = true
  note.textContent = 'Breakthrough achieved. As requested by Mark Dalgleish.'
  title.insertAdjacentElement('afterend', note)

  var running = false
  function activate() {
    if (running)
      return
    running = true
    wrap.classList.add('is-breaking')
    if (main)
      main.classList.add('breakthrough-shake')
    setTimeout(function () {
      if (main)
        main.classList.remove('breakthrough-shake')
    }, SHAKE_MS)
    setTimeout(function () {
      wrap.classList.remove('is-breaking')
    }, PUNCH_MS)
    setTimeout(function () {
      note.hidden = false
    }, NOTE_DELAY)
    setTimeout(function () {
      note.hidden = true
      running = false
    }, NOTE_DELAY + NOTE_VISIBLE)
  }

  title.addEventListener('click', activate)
  title.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      activate()
    }
  })
})()
