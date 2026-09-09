import assert from 'node:assert/strict'
import { test } from 'node:test'

function harness({ stored, storageError = false, setStorageError = false } = {}) {
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const savedStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const root = {
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value) },
    getAttribute(name) { return this.attributes[name] ?? null },
  }
  const buttons = ['green', 'yellow', 'red'].map((theme) => {
    return {
      theme,
      dataset: { themeOption: theme },
      attributes: {},
      listeners: {},
      setAttribute(name, value) { this.attributes[name] = String(value) },
      getAttribute(name) { return this.attributes[name] ?? null },
      addEventListener(type, listener) { this.listeners[type] = listener },
    }
  })
  const written = []
  globalThis.document = {
    documentElement: root,
    querySelectorAll: selector => selector === '[data-theme-option]' ? buttons : [],
  }
  const storage = {
    getItem() {
      if (storageError)
        throw new DOMException('Storage blocked', 'SecurityError')
      return stored ?? null
    },
    setItem(key, value) {
      if (setStorageError)
        throw new DOMException('Storage blocked', 'SecurityError')
      written.push([key, value])
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  return {
    root,
    buttons,
    written,
    restore() {
      if (savedDocument)
        Object.defineProperty(globalThis, 'document', savedDocument)
      if (savedStorage)
        Object.defineProperty(globalThis, 'localStorage', savedStorage)
      else
        delete globalThis.localStorage
    },
  }
}

test('the page loads green when nothing is stored', async () => {
  const h = harness()
  try {
    await import('./theme.js?default-test')
    assert.equal(h.root.getAttribute('data-theme'), 'green')
    assert.deepEqual(h.buttons.map(button => button.getAttribute('aria-pressed')), ['true', 'false', 'false'])
    assert.deepEqual(h.written, [])
  }
  finally {
    h.restore()
  }
})

test('a stored colour wins over the default', async () => {
  const h = harness({ stored: 'red' })
  try {
    await import('./theme.js?stored-test')
    assert.equal(h.root.getAttribute('data-theme'), 'red')
    assert.deepEqual(h.buttons.map(button => button.getAttribute('aria-pressed')), ['false', 'false', 'true'])
  }
  finally {
    h.restore()
  }
})

test('an unknown stored colour falls back to green', async () => {
  const h = harness({ stored: 'chartreuse' })
  try {
    await import('./theme.js?stored-invalid-test')
    assert.equal(h.root.getAttribute('data-theme'), 'green')
  }
  finally {
    h.restore()
  }
})

test('a blocked store falls back to green and picks stay working', async () => {
  const h = harness({ stored: 'yellow', storageError: true, setStorageError: true })
  try {
    await import('./theme.js?blocked-storage-test')
    assert.equal(h.root.getAttribute('data-theme'), 'green')
    h.buttons[1].listeners.click()
    assert.equal(h.root.getAttribute('data-theme'), 'yellow')
    assert.deepEqual(h.buttons.map(button => button.getAttribute('aria-pressed')), ['false', 'true', 'false'])
    assert.deepEqual(h.written, [])
  }
  finally {
    h.restore()
  }
})

test('clicking a colour applies it, marks it pressed and keeps it for next visit', async () => {
  const h = harness()
  try {
    await import('./theme.js?click-test')
    h.buttons[2].listeners.click()
    assert.equal(h.root.getAttribute('data-theme'), 'red')
    assert.deepEqual(h.buttons.map(button => button.getAttribute('aria-pressed')), ['false', 'false', 'true'])
    assert.deepEqual(h.written, [['melbjs-theme', 'red']])
    h.buttons[0].listeners.click()
    assert.equal(h.root.getAttribute('data-theme'), 'green')
    assert.deepEqual(h.written, [['melbjs-theme', 'red'], ['melbjs-theme', 'green']])
  }
  finally {
    h.restore()
  }
})
