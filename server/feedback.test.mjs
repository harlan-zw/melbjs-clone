import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { createHandler, createRateLimiter, issueFromSubmission, parseSubmission } from './feedback.mjs'

test('parseSubmission rejects short text and reads the honeypot', () => {
  assert.equal(parseSubmission({ text: 'short' })._tag, 'Err')
  assert.equal(parseSubmission({ text: 'long enough text', website: 'x' })._tag, 'Honeypot')
  assert.deepEqual(parseSubmission({ text: '  The register button is off screen on mobile  ', name: ' Sam ' }), { _tag: 'Ok', submission: { text: 'The register button is off screen on mobile', name: 'Sam' } })
})

test('issueFromSubmission uses the first line as the title', () => {
  const issue = issueFromSubmission({ text: 'Dates are wrong\nThe event says Wednesday but it is Thursday.', name: 'Sam' }, { site: 'https://melbjs.harlanzw.com', at: '2026-09-09T08:00:00.000Z' })
  assert.equal(issue.title, 'Dates are wrong')
  assert.match(issue.body, /Thursday/)
  assert.match(issue.body, /by Sam/)
  assert.deepEqual(issue.labels, ['audience-feedback'])
})

test('rate limiter allows five per window then refuses', () => {
  let t = 0
  const limiter = createRateLimiter({ limit: 5, windowMs: 1000, now: () => t })
  for (let i = 0; i < 5; i++)
    assert.equal(limiter.allow('a'), true)
  assert.equal(limiter.allow('a'), false)
  t = 1001
  assert.equal(limiter.allow('a'), true)
})

async function withServer(handler, run) {
  const server = createServer((req, res) => { handler(req, res) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    await run(base)
  }
  finally {
    server.close()
  }
}

test('POST /api/feedback files an issue through the injected fetch', async () => {
  const calls = []
  const fakeFetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), auth: init.headers.authorization })
    return { ok: true, status: 201, json: async () => ({ number: 7, html_url: 'https://github.com/x/y/issues/7' }), text: async () => '' }
  }
  const handler = createHandler({ fetch: fakeFetch, token: 'tok', repo: 'harlan-zw/melbjs-clone', site: 'https://melbjs.harlanzw.com', now: () => 0, log: { info() {}, error() {} } })
  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'The sponsor links open in the same tab' }) })
    assert.equal(res.status, 201)
    assert.deepEqual(await res.json(), { ok: true, number: 7 })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://api.github.com/repos/harlan-zw/melbjs-clone/issues')
    assert.equal(calls[0].auth, 'Bearer tok')
    assert.equal(calls[0].body.title, 'The sponsor links open in the same tab')
  })
})

test('a GitHub refusal becomes a 502 and a bad body a 400', async () => {
  const fakeFetch = async () => ({ ok: false, status: 401, text: async () => 'Bad credentials', json: async () => ({}) })
  const handler = createHandler({ fetch: fakeFetch, token: 'tok', repo: 'r/r', site: 's', log: { info() {}, error() {} } })
  await withServer(handler, async (base) => {
    const refused = await fetch(`${base}/api/feedback`, { method: 'POST', body: JSON.stringify({ text: 'Something worth ten characters' }) })
    assert.equal(refused.status, 502)
    const bad = await fetch(`${base}/api/feedback`, { method: 'POST', body: '{not json' })
    assert.equal(bad.status, 400)
  })
})
