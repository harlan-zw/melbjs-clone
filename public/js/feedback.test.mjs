import assert from 'node:assert/strict'
import { test } from 'node:test'

test('feedback keeps a browser allowance when the localStorage getter throws', async () => {
  const saved = Object.fromEntries(['document', 'window', 'localStorage', 'fetch', 'FormData']
    .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const elements = new Map()
  function element(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        listeners: {},
        addEventListener(type, listener) { this.listeners[type] = listener },
        querySelector: element,
        reset() {},
      })
    }
    return elements.get(id)
  }
  const requests = []
  globalThis.document = { getElementById: element, createElement: element }
  globalThis.window = globalThis
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new DOMException('Storage blocked', 'SecurityError') },
  })
  globalThis.FormData = function () {
    return { get: key => key === 'text' ? 'Make the heading clearer.' : '' }
  }
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init })
    return new Response(JSON.stringify({ ok: true, number: 1 }))
  }
  try {
    await import('./feedback.js?blocked-storage-test')
    const submit = element('feedback').listeners.submit
    submit({ preventDefault() {} })
    submit({ preventDefault() {} })
    await new Promise(setImmediate)
    assert.equal(requests[0].url, '/api/feedback')
    const clientId = requests[0].init.headers['x-feedback-client']
    assert.match(clientId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    assert.equal(requests[1].init.headers['x-feedback-client'], clientId)
  }
  finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor)
        Object.defineProperty(globalThis, key, descriptor)
      else
        delete globalThis[key]
    }
  }
})
