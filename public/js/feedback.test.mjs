import assert from 'node:assert/strict'
import { test } from 'node:test'

function harness({ storageError = false, body = { ok: true, number: 1 }, status = 200 } = {}) {
  const keys = ['document', 'window', 'FormData', 'fetch']
  if (storageError)
    keys.push('localStorage')
  const saved = Object.fromEntries(keys
    .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const elements = new Map()
  const requests = []
  function blankNode() {
    return { children: [], appendChild(child) { this.children.push(child) } }
  }
  function element(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        ...blankNode(),
        textContent: '',
        resetCount: 0,
        listeners: {},
        value: '',
        attributes: {},
        addEventListener(type, listener) { this.listeners[type] = listener },
        querySelector: element,
        reset() { this.resetCount++; element('textarea').value = '' },
        requestSubmit() { this.requested = (this.requested || 0) + 1 },
        setAttribute(name, value) { this.attributes[name] = String(value) },
        getAttribute(name) { return this.attributes[name] ?? null },
        removeAttribute(name) { delete this.attributes[name] },
      })
    }
    return elements.get(id)
  }
  element('textarea').maxLength = 2000
  globalThis.document = { getElementById: element, createElement: blankNode, createTextNode: text => ({ text }) }
  globalThis.window = globalThis
  globalThis.FormData = function () {
    return { get: key => key === 'text' ? 'Make the heading clearer.' : '' }
  }
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init })
    return new Response(JSON.stringify(typeof body === 'function' ? body() : body), { status })
  }
  if (storageError) {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('Storage blocked', 'SecurityError') },
    })
  }
  return {
    element,
    requests,
    restore() {
      for (const [key, descriptor] of Object.entries(saved)) {
        if (descriptor)
          Object.defineProperty(globalThis, key, descriptor)
        else
          delete globalThis[key]
      }
    },
  }
}

test('feedback keeps a browser allowance when the localStorage getter throws', async () => {
  const h = harness({ storageError: true })
  try {
    await import('./feedback.js?blocked-storage-test')
    const submit = h.element('feedback').listeners.submit
    submit({ preventDefault() {} })
    await new Promise(setImmediate)
    submit({ preventDefault() {} })
    await new Promise(setImmediate)
    assert.equal(h.requests[0].url, '/api/feedback')
    const clientId = h.requests[0].init.headers['x-feedback-client']
    assert.match(clientId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    assert.equal(h.requests[1].init.headers['x-feedback-client'], clientId)
  }
  finally {
    h.restore()
  }
})

test('a submit while one is in flight does not send a second request', async () => {
  const h = harness()
  try {
    await import('./feedback.js?in-flight-test')
    const submit = h.element('feedback').listeners.submit
    submit({ preventDefault() {} })
    submit({ preventDefault() {} })
    await new Promise(setImmediate)
    assert.equal(h.requests.length, 1)
    submit({ preventDefault() {} })
    await new Promise(setImmediate)
    assert.equal(h.requests.length, 2)
  }
  finally {
    h.restore()
  }
})

test('ctrl+enter and cmd+enter submit, plain enter keeps its newline', async () => {
  const h = harness()
  try {
    await import('./feedback.js?shortcut-test')
    const form = h.element('feedback')
    const keydown = h.element('textarea').listeners.keydown
    let prevented = 0
    const press = extra => keydown({ key: 'Enter', preventDefault() { prevented++ }, ...extra })
    press({ ctrlKey: true })
    press({ metaKey: true })
    press({ ctrlKey: true, metaKey: true })
    press({})
    press({ shiftKey: true })
    press({ key: 'a', ctrlKey: true })
    assert.equal(form.requested, 3)
    assert.equal(prevented, 3)
  }
  finally {
    h.restore()
  }
})

test('the counter tracks the textarea and resets after a successful submission', async () => {
  const h = harness()
  try {
    await import('./feedback.js?counter-test')
    const text = h.element('textarea')
    const counter = h.element('feedback-text-count')
    assert.equal(counter.textContent, '0 / 2000')
    text.value = 'Nice talk'
    text.listeners.input()
    assert.equal(counter.textContent, '9 / 2000')
    const submit = h.element('feedback').listeners.submit
    submit({ preventDefault() {} })
    await new Promise(setImmediate)
    assert.equal(counter.textContent, '0 / 2000')
  }
  finally {
    h.restore()
  }
})

test('the form reports aria-busy while sending and clears it after success', async () => {
  const h = harness()
  try {
    await import('./feedback.js?aria-busy-success-test')
    const form = h.element('feedback')
    const submit = form.listeners.submit
    submit({ preventDefault() {} })
    assert.equal(form.getAttribute('aria-busy'), 'true')
    await new Promise(setImmediate)
    assert.equal(form.getAttribute('aria-busy'), null)
  }
  finally {
    h.restore()
  }
})

test('aria-busy also clears after a failed submission', async () => {
  const h = harness({ body: { ok: false, error: 'Slow down' } })
  try {
    await import('./feedback.js?aria-busy-failure-test')
    const form = h.element('feedback')
    const submit = form.listeners.submit
    submit({ preventDefault() {} })
    assert.equal(form.getAttribute('aria-busy'), 'true')
    await new Promise(setImmediate)
    assert.equal(form.getAttribute('aria-busy'), null)
  }
  finally {
    h.restore()
  }
})

test('a failed submission keeps the text and the counter', async () => {
  const h = harness({ body: { ok: false, error: 'Slow down' } })
  try {
    await import('./feedback.js?counter-failure-test')
    const text = h.element('textarea')
    const counter = h.element('feedback-text-count')
    text.value = 'Still here'
    text.listeners.input()
    const submit = h.element('feedback').listeners.submit
    submit({ preventDefault() {} })
    await new Promise(setImmediate)
    assert.equal(counter.textContent, '10 / 2000')
  }
  finally {
    h.restore()
  }
})

test('a successful submit links the filed issue and GitHub results', async () => {
  const dom = harness({ body: { ok: true, number: 42 } })
  try {
    await import('./feedback.js?issue-link-test')
    dom.element('feedback').listeners.submit({ preventDefault() {} })
    await new Promise(setImmediate)
    const status = dom.element('feedback-status')
    const links = status.children.filter(child => child.href)
    assert.deepEqual(links.map(link => [link.href, link.target, link.rel, link.textContent]), [
      ['https://github.com/harlan-zw/melbjs-clone/issues/42', '_blank', 'noopener noreferrer', '#42'],
      ['https://github.com/harlan-zw/melbjs-clone/pulls?q=is%3Apr+is%3Amerged', '_blank', 'noopener noreferrer', 'View results'],
    ])
    const spoken = status.children
      .filter(child => typeof child.text === 'string')
      .map(child => child.text)
      .join('')
    assert.match(spoken, /Filed as issue /)
    assert.match(spoken, /Watch the board/)
    assert.equal(status.textContent, '')
    assert.equal(dom.element('feedback').resetCount, 1)
  }
  finally {
    dom.restore()
  }
})

test('server errors stay plain text with no links', async () => {
  const dom = harness({ body: { ok: false, error: 'Too many messages. Try again in a minute.' }, status: 429 })
  try {
    await import('./feedback.js?error-plain-text-test')
    dom.element('feedback').listeners.submit({ preventDefault() {} })
    await new Promise(setImmediate)
    const status = dom.element('feedback-status')
    assert.equal(status.textContent, 'Too many messages. Try again in a minute.')
    assert.equal(status.children.some(child => child.href), false)
  }
  finally {
    dom.restore()
  }
})
