import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createResultsHandler } from './results.mjs'

const repo = 'harlan-zw/melbjs-clone'
const request = () => new Request('https://melbjs.harlanzw.com/api/results')
const item = (number, overrides = {}) => ({
  number, title: `Feedback ${number}`, state: 'open', created_at: '2026-09-08T08:00:00Z',
  updated_at: '2026-09-08T08:00:00Z', labels: [{ name: 'audience-feedback' }], ...overrides,
})
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })

test('results distinguish merged pull requests from closed feedback and omit issue bodies', async () => {
  const handle = createResultsHandler({ repo, now: () => 0, fetch: async url => url.endsWith(`/repos/${repo}`)
    ? json({ private: false })
    : json([
        item(1, { state: 'closed', body: 'Full issue body is not needed here.' }),
        item(2, { state: 'closed', pull_request: { merged_at: '2026-09-08T09:00:00Z' } }),
        item(3, { state: 'closed', pull_request: { merged_at: null } }),
        item(4, { pull_request: { merged_at: null } }),
      ]),
  })
  const response = await handle(request())
  const result = await response.json()
  assert.equal(response.status, 200)
  assert.deepEqual(result.issues.map(issue => [issue.number, issue.state]), [[1, 'closed']])
  assert.deepEqual(result.pullRequests.map(pr => [pr.number, pr.state]), [[2, 'merged'], [3, 'closed'], [4, 'open']])
  assert.equal(result.issues[0].body, undefined)
  assert.equal(result.pullRequests[0].url, `https://github.com/${repo}/pull/2`)
})

test('results never publish private repository data', async () => {
  let calls = 0
  const handle = createResultsHandler({ repo, fetch: async () => { calls++; return json({ private: true }) } })
  const response = await handle(request())
  assert.equal(response.status, 503)
  assert.equal(calls, 1)
  assert.match((await response.json()).error, /public/)
})

test('results reuse one cache entry for every query string', async () => {
  let cached
  let calls = 0
  const cache = {
    match: async key => { assert.equal(key.url, request().url); return cached?.clone() },
    put: async (key, response) => { assert.equal(key.url, request().url); cached = response.clone() },
  }
  const handle = createResultsHandler({ repo, cache, fetch: async () => json(++calls === 1 ? { private: false } : [item(1)]) })
  await handle(request())
  const response = await handle(new Request(`${request().url}?since=today`))
  assert.equal(response.status, 200)
  assert.equal(calls, 2)
  assert.match(cached.headers.get('cache-control'), /max-age=30/)
})

test('results report a rate limit and do not cache failures', async () => {
  const handle = createResultsHandler({ repo, cache: {
    match: async () => undefined,
    put: async () => { throw new Error('Failures must not be cached.') },
  }, fetch: async () => new Response('', { status: 429, headers: { 'retry-after': '60' } }) })
  const response = await handle(request())
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('retry-after'), '60')
  assert.match((await response.json()).error, /rate limit/)
})

test('results follow pagination so older open feedback stays visible', async () => {
  const urls = []
  const handle = createResultsHandler({ repo, fetch: async url => {
    urls.push(url)
    if (urls.length === 1) return json({ private: false })
    if (urls.length === 2) return json(Array.from({ length: 100 }, (_, i) => item(i + 1)))
    return json([item(101)])
  } })
  const result = await (await handle(request())).json()
  assert.equal(result.issues.length, 101)
  assert.match(urls[2], /page=2$/)
  assert.equal(result.truncated, false)
})
