import assert from 'node:assert/strict'
import { test } from 'node:test'

const PROBLEMS = [
  'Birch and Swinnerton-Dyer conjecture',
  'Hodge conjecture',
  'Navier-Stokes existence and smoothness',
  'P versus NP',
  'Riemann hypothesis',
  'Yang-Mills existence and mass gap',
  'Poincaré conjecture',
]

function harness({ ids = ['millennium-problem', 'millennium-status'], random = Math.random } = {}) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const savedRandom = Math.random
  Math.random = random
  const elements = new Map()
  function element(id) {
    if (!elements.has(id))
      elements.set(id, { textContent: '' })
    return elements.get(id)
  }
  globalThis.document = {
    getElementById: id => (ids.includes(id) ? element(id) : null),
  }
  return {
    element,
    restore() {
      Math.random = savedRandom
      if (saved)
        Object.defineProperty(globalThis, 'document', saved)
      else
        delete globalThis.document
    },
  }
}

test('a visit shows one Millennium Prize Problem and its status', async () => {
  const h = harness()
  try {
    await import('./millennium.js?pick-test')
    const shown = h.element('millennium-problem').textContent
    assert.ok(PROBLEMS.includes(shown), `unexpected problem: ${shown}`)
    assert.match(h.element('millennium-status').textContent, /^Status: (solved|unsolved)/)
  }
  finally {
    h.restore()
  }
})

test('an unsolved pick claims we are on it', async () => {
  const h = harness({ random: () => 0 })
  try {
    await import('./millennium.js?unsolved-test')
    assert.equal(h.element('millennium-problem').textContent, PROBLEMS[0])
    assert.match(h.element('millennium-status').textContent, /^Status: unsolved/)
  }
  finally {
    h.restore()
  }
})

test('the solved Poincaré conjecture takes credit', async () => {
  const h = harness({ random: () => 0.999 })
  try {
    await import('./millennium.js?solved-test')
    assert.equal(h.element('millennium-problem').textContent, PROBLEMS[6])
    assert.match(h.element('millennium-status').textContent, /^Status: solved/)
  }
  finally {
    h.restore()
  }
})

test('a page without the section does not crash', async () => {
  const h = harness({ ids: [] })
  try {
    await import('./millennium.js?missing-test')
  }
  finally {
    h.restore()
  }
})
