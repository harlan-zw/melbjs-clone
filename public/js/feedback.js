// The feedback dialog: a floating launcher opens it, "Point at it" lets the
// reporter pick one element on the page, and submit posts text plus the
// picked element to /api/feedback.
import { createClientId } from './client-id.mjs'

(function () {
  var dialog = document.getElementById('feedback-dialog')
  var form = document.getElementById('feedback')
  if (!dialog || !form)
    return
  var status = document.getElementById('feedback-status')
  var submit = form.querySelector('button[type="submit"]')
  var launcher = document.getElementById('feedback-open')
  var pickButton = document.getElementById('feedback-pick')
  var targetLabel = document.getElementById('feedback-target-label')
  var clearButton = document.getElementById('feedback-target-clear')
  var target = null
  var storage
  try {
    storage = typeof localStorage === 'undefined' ? undefined : localStorage
  }
  catch {
    // Storage can be disabled. Keep the browser id in memory for this page.
  }
  var clientId = createClientId({
    crypto: typeof crypto === 'undefined' ? undefined : crypto,
    storage: storage,
  })

  // The visible "0 / 2000" counter under the textarea, and Ctrl/Cmd+Enter
  // to submit. Plain Enter keeps its newline.
  var text = form.querySelector('textarea')
  var counter = document.getElementById('feedback-text-count')
  var limit = text.maxLength

  function updateCount() {
    counter.textContent = text.value.length + ' / ' + limit
  }
  text.addEventListener('input', updateCount)
  updateCount()
  text.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      form.requestSubmit()
    }
  })

  function openDialog() {
    dialog.showModal()
    form.querySelector('textarea').focus()
  }
  launcher.addEventListener('click', openDialog)
  document.getElementById('feedback-close').addEventListener('click', function () { dialog.close() })
  dialog.addEventListener('click', function (event) {
    if (event.target === dialog)
      dialog.close()
  })

  // A selector a human and an agent can both follow: nearest id, then
  // tag:nth-of-type steps down to the element.
  function selectorFor(element) {
    var parts = []
    var node = element
    while (node && node !== document.body) {
      if (node.id) {
        parts.unshift('#' + node.id)
        break
      }
      var tag = node.tagName.toLowerCase()
      var index = 1
      var sibling = node
      while ((sibling = sibling.previousElementSibling))
        if (sibling.tagName === node.tagName)
          index++
      parts.unshift(tag + (index > 1 ? ':nth-of-type(' + index + ')' : ''))
      node = node.parentElement
    }
    return parts.join(' > ')
  }

  function describe(element) {
    var rect = element.getBoundingClientRect()
    return {
      selector: selectorFor(element),
      text: (element.innerText || '').trim().slice(0, 300),
      html: element.outerHTML.slice(0, 2000),
      rect: { x: Math.round(rect.left + window.scrollX), y: Math.round(rect.top + window.scrollY), width: Math.round(rect.width), height: Math.round(rect.height) },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    }
  }

  function showTarget() {
    if (!target) {
      targetLabel.textContent = 'Nothing picked yet, tap the button and then the part of the page.'
      clearButton.hidden = true
      return
    }
    targetLabel.textContent = ''
    var code = document.createElement('code')
    code.textContent = target.selector
    targetLabel.appendChild(document.createTextNode('Pointing at '))
    targetLabel.appendChild(code)
    if (target.text)
      targetLabel.appendChild(document.createTextNode(' "' + target.text.slice(0, 40) + (target.text.length > 40 ? '…' : '') + '"'))
    clearButton.hidden = false
  }
  clearButton.addEventListener('click', function () {
    target = null
    showTarget()
  })

  // Picking: close the dialog, highlight whatever is under the pointer, take
  // the next click as the pick, and reopen the dialog with it.
  var highlight = document.createElement('div')
  highlight.className = 'feedback-highlight'
  var hint = document.createElement('div')
  hint.className = 'feedback-hint'
  hint.textContent = 'Tap the part of the page. Esc to cancel.'

  function pickable(element) {
    return element && element !== document.body && element !== document.documentElement
      && !launcher.contains(element) && element !== highlight && element !== hint
  }
  function moveHighlight(element) {
    var rect = element.getBoundingClientRect()
    highlight.style.left = rect.left + 'px'
    highlight.style.top = rect.top + 'px'
    highlight.style.width = rect.width + 'px'
    highlight.style.height = rect.height + 'px'
  }
  function elementAt(event) {
    highlight.hidden = true
    var element = document.elementFromPoint(event.clientX, event.clientY)
    highlight.hidden = false
    return pickable(element) ? element : null
  }
  function onMove(event) {
    var element = elementAt(event)
    if (element)
      moveHighlight(element)
  }
  function onPick(event) {
    event.preventDefault()
    event.stopPropagation()
    var element = elementAt(event)
    if (!element)
      return
    target = describe(element)
    stopPicking()
    showTarget()
    openDialog()
  }
  function onKey(event) {
    if (event.key === 'Escape') {
      stopPicking()
      openDialog()
    }
  }
  function startPicking() {
    dialog.close()
    document.body.classList.add('picking')
    launcher.hidden = true
    document.body.appendChild(highlight)
    document.body.appendChild(hint)
    document.addEventListener('pointermove', onMove, true)
    document.addEventListener('click', onPick, true)
    document.addEventListener('keydown', onKey, true)
  }
  function stopPicking() {
    document.body.classList.remove('picking')
    launcher.hidden = false
    highlight.remove()
    hint.remove()
    document.removeEventListener('pointermove', onMove, true)
    document.removeEventListener('click', onPick, true)
    document.removeEventListener('keydown', onKey, true)
  }
  pickButton.addEventListener('click', startPicking)

  form.addEventListener('submit', function (event) {
    event.preventDefault()
    if (submit.disabled)
      return
    var data = new FormData(form)
    submit.disabled = true
    status.textContent = 'Sending…'
    fetch('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-feedback-client': clientId },
      body: JSON.stringify({ text: data.get('text'), name: data.get('name'), website: data.get('website'), target: target }),
    }).then(function (res) {
      return res.json().then(function (body) { return { res: res, body: body } })
    }).then(function (result) {
      if (result.res.ok && result.body.ok) {
        status.textContent = ''
        status.appendChild(document.createTextNode('Filed as issue '))
        var issue = document.createElement('a')
        issue.href = 'https://github.com/harlan-zw/melbjs-clone/issues/' + result.body.number
        issue.target = '_blank'
        issue.rel = 'noopener noreferrer'
        issue.textContent = '#' + result.body.number
        status.appendChild(issue)
        status.appendChild(document.createTextNode('. Watch the board at the end of the talk. '))
        var results = document.createElement('a')
        results.href = 'https://github.com/harlan-zw/melbjs-clone/pulls?q=is%3Apr+is%3Amerged'
        results.target = '_blank'
        results.rel = 'noopener noreferrer'
        results.textContent = 'View results'
        status.appendChild(results)
        form.reset()
        updateCount()
        target = null
        showTarget()
      }
      else {
        status.textContent = result.body.error || 'Something went wrong. Try again.'
      }
    }).catch(function () {
      status.textContent = 'Could not reach the server. Try again in a moment.'
    }).finally(function () {
      submit.disabled = false
    })
  })
})()
