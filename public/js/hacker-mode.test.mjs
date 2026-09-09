import assert from 'node:assert/strict'
import { test } from 'node:test'

const CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']

function harness() {
  const saved = Object.fromEntries(['document', 'console']
    .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const listeners = {}
  const classNames = new Set()
  const classList = {
    toggle(name, force) {
      const present = classNames.has(name)
      const next = force === undefined ? !present : force
      if (next)
        classNames.add(name)
      else
        classNames.delete(name)
      return classNames.has(name)
    },
  }
  const notes = []
  const logs = []
  globalThis.document = {
    documentElement: { classList },
    body: { appendChild(child) { notes.push(child) } },
    getElementById: () => null,
    createElement: () => ({ id: '', className: '', textContent: '' }),
    addEventListener(type, listener) { listeners[type] = listener },
  }
  globalThis.console = { log: (...args) => logs.push(args) }
  return {
    listeners,
    classNames,
    notes,
    logs,
    press(key, extra = {}) {
      listeners.keydown({ key, ctrlKey: false, metaKey: false, altKey: false, target: {}, ...extra })
    },
    type() {
      for (const key of CODE) this.press(key)
    },
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

test('the konami code turns hacker mode on, then off again', async () => {
  const h = harness()
  try {
    await import('./hacker-mode.js?toggle-test')
    assert.equal(h.classNames.has('hacker'), false)
    h.type()
    assert.equal(h.classNames.has('hacker'), true)
    h.type()
    assert.equal(h.classNames.has('hacker'), false)
    assert.equal(h.notes.length, 2)
    assert.match(h.notes[0].textContent, /Hacker mode on/)
    assert.match(h.notes[1].textContent, /Hacker mode off/)
    assert.equal(h.notes[0].className, 'visually-hidden')
  }
  finally {
    h.restore()
  }
})

test('a wrong key restarts the code instead of creeping toward a toggle', async () => {
  const h = harness()
  try {
    await import('./hacker-mode.js?reset-test')
    for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown'])
      h.press(key)
    h.press('ArrowLeft')
    h.type()
    assert.equal(h.classNames.has('hacker'), true)
    assert.equal(h.notes.length, 1)
  }
  finally {
    h.restore()
  }
})

test('modifier keys and form fields never arm the code', async () => {
  const h = harness()
  try {
    await import('./hacker-mode.js?guard-test')
    h.press('b', { ctrlKey: true })
    h.press('a', { target: { tagName: 'TEXTAREA' } })
    h.press('ArrowUp')
    h.press('ArrowUp')
    h.press('ArrowDown', { metaKey: true })
    for (const key of ['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'])
      h.press(key)
    assert.equal(h.classNames.has('hacker'), false)
    h.press('a', { target: { tagName: 'INPUT' } })
    assert.equal(h.classNames.has('hacker'), false)
  }
  finally {
    h.restore()
  }
})

test('shifted B and A still finish the code', async () => {
  const h = harness()
  try {
    await import('./hacker-mode.js?shift-test')
    for (const key of CODE) {
      if (key === 'b')
        h.press('B', { shiftKey: true })
      else if (key === 'a')
        h.press('A', { shiftKey: true })
      else
        h.press(key)
    }
    assert.equal(h.classNames.has('hacker'), true)
  }
  finally {
    h.restore()
  }
})

test('the console drops the hint when the page loads', async () => {
  const h = harness()
  try {
    await import('./hacker-mode.js?hint-test')
    assert.equal(h.logs.length, 1)
    const flat = h.logs[0].map(String).join(' ')
    assert.match(flat, /↑/)
    assert.match(flat, /B A/)
  }
  finally {
    h.restore()
  }
})
