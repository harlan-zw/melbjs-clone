import assert from 'node:assert/strict'
import { test } from 'node:test'

function harness({ reduceMotion = false, withMarquee = true } = {}) {
  const saved = Object.fromEntries(['document', 'window', 'matchMedia']
    .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const marquee = {
    stopped: false,
    stop() { this.stopped = true },
  }
  globalThis.document = {
    querySelector: selector => selector === '.geo-marquee' && withMarquee ? marquee : null,
  }
  globalThis.window = {
    matchMedia: query => ({ matches: query.includes('prefers-reduced-motion') ? reduceMotion : false }),
  }
  return {
    marquee,
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

test('reduced motion stops the marquee', async () => {
  const h = harness({ reduceMotion: true })
  try {
    await import('./retro.js?reduced-motion-test')
    assert.equal(h.marquee.stopped, true)
  }
  finally {
    h.restore()
  }
})

test('full motion keeps the marquee scrolling', async () => {
  const h = harness()
  try {
    await import('./retro.js?full-motion-test')
    assert.equal(h.marquee.stopped, false)
  }
  finally {
    h.restore()
  }
})

test('a page without the marquee does not crash', async () => {
  const h = harness({ withMarquee: false })
  try {
    await import('./retro.js?missing-marquee-test')
  }
  finally {
    h.restore()
  }
})
