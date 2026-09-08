import assert from 'node:assert/strict'
import { test } from 'node:test'

const globalKeys = ['document', 'window', 'localStorage', 'fetch', 'FormData']

function saveGlobals() {
  return Object.fromEntries(globalKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
}

function restoreGlobals(saved) {
  for (const [key, descriptor] of Object.entries(saved)) {
    if (descriptor)
      Object.defineProperty(globalThis, key, descriptor)
    else
      delete globalThis[key]
  }
}

// Minimal DOM: elements found by id record listeners, appended children and
// resets. createElement hands out fresh nodes so every link is its own object.
function fakeDom() {
  const byId = new Map()
  function blankNode() {
    return { children: [], appendChild(child) { this.children.push(child) } }
  }
  function element(id) {
    if (!byId.has(id)) {
      byId.set(id, {
        ...blankNode(),
        listeners: {},
        textContent: '',
        resetCount: 0,
        addEventListener(type, listener) { this.listeners[type] = listener },
        querySelector: element,
        reset() { this.resetCount++ },
      })
    }
    return byId.get(id)
  }
  return {
    element,
    document: {
      getElementById: element,
      createElement: blankNode,
      createTextNode: text => ({ text }),
    },
  }
}

function textFormData() {
  return { get: key => key === 'text' ? 'Make the heading clearer.' : '' }
}

test('feedback keeps a browser allowance when the localStorage getter throws', async () => {
  const saved = saveGlobals()
  const dom = fakeDom()
  const requests = []
  globalThis.document = dom.document
  globalThis.window = globalThis
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new DOMException('Storage blocked', 'SecurityError') },
  })
  globalThis.FormData = textFormData
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init })
    return new Response(JSON.stringify({ ok: true, number: 1 }))
  }
  try {
    await import('./feedback.js?blocked-storage-test')
    const submit = dom.element('feedback').listeners.submit
    submit({ preventDefault() {} })
    submit({ preventDefault() {} })
    await new Promise(setImmediate)
    assert.equal(requests[0].url, '/api/feedback')
    const clientId = requests[0].init.headers['x-feedback-client']
    assert.match(clientId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    assert.equal(requests[1].init.headers['x-feedback-client'], clientId)
  }
  finally {
    restoreGlobals(saved)
  }
})

test('a successful submit links the filed issue and the results page', async () => {
  const saved = saveGlobals()
  const dom = fakeDom()
  globalThis.document = dom.document
  globalThis.window = globalThis
  globalThis.FormData = textFormData
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, number: 42 }))
  try {
    await import('./feedback.js?issue-link-test')
    dom.element('feedback').listeners.submit({ preventDefault() {} })
    await new Promise(setImmediate)
    const status = dom.element('feedback-status')
    const links = status.children.filter(child => child.href)
    assert.deepEqual(links.map(link => [link.href, link.target, link.rel, link.textContent]), [
      ['https://github.com/harlan-zw/melbjs-clone/issues/42', '_blank', 'noopener noreferrer', '#42'],
      ['/results', '_blank', 'noopener noreferrer', 'View results'],
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
    restoreGlobals(saved)
  }
})

test('server errors stay plain text with no links', async () => {
  const saved = saveGlobals()
  const dom = fakeDom()
  globalThis.document = dom.document
  globalThis.window = globalThis
  globalThis.FormData = textFormData
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error: 'Too many messages. Try again in a minute.' }), { status: 429 })
  try {
    await import('./feedback.js?error-plain-text-test')
    dom.element('feedback').listeners.submit({ preventDefault() {} })
    await new Promise(setImmediate)
    const status = dom.element('feedback-status')
    assert.equal(status.textContent, 'Too many messages. Try again in a minute.')
    assert.equal(status.children.some(child => child.href), false)
  }
  finally {
    restoreGlobals(saved)
  }
})
