import assert from 'node:assert/strict'
import { test } from 'node:test'

function harness({ reduceMotion = false, hidden = false } = {}) {
  const keys = ['document', 'window', 'matchMedia', 'requestAnimationFrame', 'setInterval', 'IntersectionObserver']
  const saved = Object.fromEntries(keys
    .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const rafQueue = []
  const intervals = []
  const contexts = []
  const observers = []

  function anchor(x, y, withImage = true) {
    return {
      listeners: {},
      addEventListener(type, listener) { this.listeners[type] = listener },
      getBoundingClientRect: () => ({ left: x, top: y, width: 100, height: 100 }),
      querySelector: selector => selector === 'img' && withImage ? { tagName: 'IMG' } : null,
    }
  }

  const avatars = [anchor(0, 100), anchor(0, 300), anchor(0, 500)]
  const nameLink = anchor(0, 150, false)
  const section = {
    children: [],
    appendChild(child) { this.children.push(child) },
    getBoundingClientRect: () => ({ left: 0, top: 100, width: 740, height: 600 }),
    querySelectorAll: selector => selector === '.media a' ? [...avatars, nameLink] : [],
  }

  globalThis.document = {
    hidden,
    createElement(tag) {
      assert.equal(tag, 'canvas')
      return {
        tagName: 'CANVAS',
        className: '',
        width: 0,
        height: 0,
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = String(value) },
        getAttribute(name) { return this.attributes[name] ?? null },
        getContext() {
          const calls = { cleared: 0, drawn: 0 }
          const ctx = {
            calls,
            clearRect() { calls.cleared++ },
            beginPath() {},
            arc() { calls.drawn++ },
            fill() {},
          }
          contexts.push(ctx)
          return ctx
        },
      }
    },
    querySelector: selector => selector === '.speakers' ? section : null,
  }
  globalThis.window = Object.assign(new EventTarget(), {
    matchMedia: query => ({ matches: query.includes('prefers-reduced-motion') ? reduceMotion : false }),
  })
  globalThis.requestAnimationFrame = callback => rafQueue.push(callback)
  globalThis.setInterval = (fn, ms) => { intervals.push({ fn, ms }); return intervals.length }
  globalThis.IntersectionObserver = class {
    constructor(callback) {
      this.callback = callback
      observers.push(this)
    }

    observe() { this.observed = true }
  }

  return {
    avatars,
    nameLink,
    section,
    intervals,
    observers,
    contexts,
    canvas: () => section.children.find(child => child.tagName === 'CANVAS'),
    pending: () => rafQueue.length,
    frame() {
      const callback = rafQueue.shift()
      if (callback)
        callback(0)
      return Boolean(callback)
    },
    drain() {
      let frames = 0
      while (rafQueue.length && frames < 500) {
        this.frame()
        frames++
      }
      return frames
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

test('reduced motion skips the fireworks entirely', async () => {
  const h = harness({ reduceMotion: true })
  try {
    await import('./avatars.js?reduced-motion-test')
    assert.equal(h.canvas(), undefined)
    assert.equal(h.intervals.length, 0)
    assert.equal(h.avatars[0].listeners.pointerenter, undefined)
    assert.equal(h.avatars[0].listeners.focus, undefined)
  }
  finally {
    h.restore()
  }
})

test('hovering an avatar bursts fireworks that clean up after themselves', async () => {
  const h = harness()
  try {
    await import('./avatars.js?hover-test')
    const canvas = h.canvas()
    assert.ok(canvas, 'the fireworks canvas is scoped to the speakers section')
    assert.equal(canvas.getAttribute('aria-hidden'), 'true')
    assert.equal(canvas.width, 740)
    assert.equal(canvas.height, 600)
    h.avatars[0].listeners.pointerenter()
    assert.equal(h.pending(), 1)
    const frames = h.drain()
    assert.ok(frames > 10, `the burst animates, ran ${frames} frames`)
    assert.ok(h.contexts[0].calls.drawn > 0, 'particles are drawn')
    assert.ok(h.contexts[0].calls.cleared > 0, 'the canvas is cleared each frame')
    assert.equal(h.pending(), 0, 'the animation loop stops when the particles die')
    assert.equal(h.nameLink.listeners.pointerenter, undefined, 'name links stay still')
  }
  finally {
    h.restore()
  }
})

test('a burst already running is not joined by a second loop', async () => {
  const h = harness()
  try {
    await import('./avatars.js?single-loop-test')
    h.avatars[0].listeners.pointerenter()
    h.avatars[0].listeners.pointerenter()
    assert.equal(h.pending(), 1)
    h.drain()
    assert.equal(h.pending(), 0)
  }
  finally {
    h.restore()
  }
})

test('focusing an avatar with the keyboard bursts too', async () => {
  const h = harness()
  try {
    await import('./avatars.js?focus-test')
    h.avatars[1].listeners.focus()
    assert.equal(h.pending(), 1)
    h.drain()
    assert.ok(h.contexts[0].calls.drawn > 0)
  }
  finally {
    h.restore()
  }
})

test('the periodic trigger bursts only while the section is visible and the tab is up', async () => {
  const h = harness()
  try {
    await import('./avatars.js?periodic-test')
    assert.equal(h.intervals.length, 1)
    assert.ok(h.intervals[0].ms >= 5000, 'the trigger stays gentle')
    const fire = h.intervals[0].fn
    fire()
    assert.equal(h.pending(), 0, 'nothing bursts before the section is observed')
    h.observers[0].callback([{ isIntersecting: true }])
    fire()
    assert.equal(h.pending(), 1)
    h.drain()
    h.observers[0].callback([{ isIntersecting: false }])
    fire()
    assert.equal(h.pending(), 0, 'offscreen sections stay quiet')
  }
  finally {
    h.restore()
  }
})

test('a hidden tab never fires the periodic burst', async () => {
  const h = harness({ hidden: true })
  try {
    await import('./avatars.js?hidden-test')
    h.observers[0].callback([{ isIntersecting: true }])
    h.intervals[0].fn()
    assert.equal(h.pending(), 0)
  }
  finally {
    h.restore()
  }
})
