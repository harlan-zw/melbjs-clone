// Opens the feedback dialog from the floating button, sends the form to
// /api/feedback, and shows the filed issue number.
(function () {
  var dialog = document.getElementById('feedback-dialog')
  var form = document.getElementById('feedback')
  if (!dialog || !form)
    return
  var status = document.getElementById('feedback-status')
  var button = form.querySelector('button[type="submit"]')

  document.getElementById('feedback-open').addEventListener('click', function () {
    dialog.showModal()
    form.querySelector('textarea').focus()
  })
  document.getElementById('feedback-close').addEventListener('click', function () {
    dialog.close()
  })
  dialog.addEventListener('click', function (event) {
    if (event.target === dialog)
      dialog.close()
  })

  form.addEventListener('submit', function (event) {
    event.preventDefault()
    var data = new FormData(form)
    button.disabled = true
    status.textContent = 'Sending…'
    fetch('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: data.get('text'), name: data.get('name'), website: data.get('website') }),
    }).then(function (res) {
      return res.json().then(function (body) { return { res: res, body: body } })
    }).then(function (result) {
      if (result.res.ok && result.body.ok) {
        status.textContent = 'Filed as issue #' + result.body.number + '. Watch the board at the end of the talk.'
        form.reset()
      }
      else {
        status.textContent = result.body.error || 'Something went wrong. Try again.'
      }
    }).catch(function () {
      status.textContent = 'Could not reach the server. Try again in a moment.'
    }).finally(function () {
      button.disabled = false
    })
  })
})()
