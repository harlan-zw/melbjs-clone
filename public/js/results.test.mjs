import assert from 'node:assert/strict'
import { test } from 'node:test'

// Loads the real results.js top-level against a stubbed document, the way a
// browser would. Each call gets a fresh module via a cache-busting query.
const moduleUrl = new URL('./results.js', import.meta.url)
let caseCount = 0

function makeElement() {
  return {
    children: [], listeners: {}, hidden: false, textContent: '', className: '', href: '', disabled: false,
    append(...kids) { this.children.push(...kids) },
    replaceChildren(...kids) { this.children = kids },
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn) },
    focus() {},
  }
}

async function loadResultsPage({ fetch, AbortSignal = {} }) {
  const elements = new Map()
  const el = id => {
    if (!elements.has(id))
      elements.set(id, makeElement())
    return elements.get(id)
  }
  const saved = {}
  for (const key of ['document', 'location', 'history', 'AbortSignal', 'fetch', 'setTimeout', 'clearTimeout'])
    saved[key] = globalThis[key]
  globalThis.document = {
    hidden: false,
    listeners: {},
    getElementById: el,
    createElement: () => makeElement(),
    querySelector: () => makeElement(),
    addEventListener(type, fn) { this.listeners[type] = fn },
  }
  globalThis.location = { href: 'https://melbjs.harlanzw.com/results' }
  globalThis.history = { replaceState() {} }
  globalThis.AbortSignal = AbortSignal
  globalThis.fetch = fetch
  // Recording fakes: no real timers, so the polling loop cannot hang the run.
  globalThis.setTimeout = () => 1
  globalThis.clearTimeout = () => {}
  return {
    el,
    async restoreAfter(run) {
      try {
        await import(`${moduleUrl.href}?case=${++caseCount}`)
        for (let i = 0; i < 20; i++)
          await new Promise(setImmediate)
        return await run(el)
      }
      finally {
        Object.assign(globalThis, saved)
      }
    },
  }
}

const payload = () => ({
  repo: 'harlan-zw/melbjs-clone',
  updatedAt: '2026-09-08T08:00:00Z',
  truncated: false,
  issues: [{ number: 7, title: 'Speaker mic cuts out', url: 'https://github.com/harlan-zw/melbjs-clone/issues/7', state: 'open', labels: ['audience-feedback'] }],
  pullRequests: [],
})

test('without AbortSignal.timeout one fetch without a signal succeeds and renders rows', async () => {
  const calls = []
  const page = await loadResultsPage({
    fetch: async (url, init) => {
      calls.push({ url, init })
      return new Response(JSON.stringify(payload()), { headers: { 'content-type': 'application/json' } })
    },
  })
  await page.restoreAfter((el) => {
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, '/api/results')
    assert.equal(calls[0].init?.signal, undefined)
    assert.equal(el('feedback').children.length, 1)
    assert.equal(el('error').hidden, true)
  })
})

test('a real server failure still shows the friendly message, not a TypeError', async () => {
  const page = await loadResultsPage({
    fetch: async () => new Response('', { status: 503, headers: { 'retry-after': '60' } }),
  })
  await page.restoreAfter((el) => {
    assert.equal(el('error').hidden, false)
    assert.match(el('error').textContent, /GitHub results are unavailable/)
    assert.doesNotMatch(el('error').textContent, /AbortSignal/)
  })
})

test('when AbortSignal.timeout exists the fetch keeps its cutoff signal', async () => {
  const calls = []
  const page = await loadResultsPage({
    AbortSignal: { timeout: ms => ({ aborted: false, limit: ms }) },
    fetch: async (url, init) => {
      calls.push(init)
      return new Response(JSON.stringify(payload()), { headers: { 'content-type': 'application/json' } })
    },
  })
  await page.restoreAfter(() => {
    assert.equal(calls[0]?.signal?.limit, 15_000)
  })
})

test('clicking Refresh runs one request, disabled while it runs, re-enabled on success', async () => {
  const calls = []
  let release
  const page = await loadResultsPage({
    fetch: async (url) => {
      calls.push({ url })
      if (calls.length === 1)
        return new Response(JSON.stringify(payload()), { headers: { 'content-type': 'application/json' } })
      return new Promise((resolve) => { release = resolve })
    },
  })
  await page.restoreAfter(async (el) => {
    assert.equal(el('refresh').disabled, false)
    el('refresh').listeners.click[0]()
    assert.equal(calls.length, 2)
    assert.equal(el('refresh').disabled, true)
    release(new Response(JSON.stringify(payload()), { headers: { 'content-type': 'application/json' } }))
    for (let i = 0; i < 20; i++)
      await new Promise(setImmediate)
    assert.equal(el('refresh').disabled, false)
    assert.equal(el('error').hidden, true)
  })
})

test('a failed Refresh re-enables the button and keeps the friendly error', async () => {
  const calls = []
  let release
  const page = await loadResultsPage({
    fetch: async () => {
      calls.push(1)
      if (calls.length === 1)
        return new Response(JSON.stringify(payload()), { headers: { 'content-type': 'application/json' } })
      return new Promise((resolve) => { release = resolve })
    },
  })
  await page.restoreAfter(async (el) => {
    el('refresh').listeners.click[0]()
    assert.equal(el('refresh').disabled, true)
    release(new Response('', { status: 503, headers: { 'retry-after': '60' } }))
    for (let i = 0; i < 20; i++)
      await new Promise(setImmediate)
    assert.equal(el('refresh').disabled, false)
    assert.match(el('error').textContent, /GitHub results are unavailable/)
  })
})

test('a second Refresh click while a request is active starts no extra fetch', async () => {
  const calls = []
  let release
  const page = await loadResultsPage({
    fetch: async () => {
      calls.push(1)
      if (calls.length === 1)
        return new Response(JSON.stringify(payload()), { headers: { 'content-type': 'application/json' } })
      return new Promise((resolve) => { release = resolve })
    },
  })
  await page.restoreAfter(async (el) => {
    el('refresh').listeners.click[0]()
    el('refresh').listeners.click[0]()
    assert.equal(calls.length, 2)
    release(new Response(JSON.stringify(payload()), { headers: { 'content-type': 'application/json' } }))
    for (let i = 0; i < 20; i++)
      await new Promise(setImmediate)
    assert.equal(calls.length, 2)
    assert.equal(el('refresh').disabled, false)
  })
})
