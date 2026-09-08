import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createFeedbackHandler, createRateLimiter, issueFromSubmission, parseSubmission, parseTarget } from './feedback.mjs'

const silent = { info() {}, error() {} }

function post(body, headers = {}) {
  return new Request('https://melbjs.harlanzw.com/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

test('parseSubmission rejects short text and reads the honeypot', () => {
  assert.equal(parseSubmission({ text: 'short' })._tag, 'Err')
  assert.equal(parseSubmission({ text: 'long enough text', website: 'x' })._tag, 'Honeypot')
  assert.deepEqual(parseSubmission({ text: '  The register button is off screen on mobile  ', name: ' Sam ' }), { _tag: 'Ok', submission: { text: 'The register button is off screen on mobile', name: 'Sam', target: null } })
})

test('parseTarget keeps a pointed-at element and drops a malformed one', () => {
  assert.equal(parseTarget(undefined), null)
  assert.equal(parseTarget({ selector: '' }), null)
  assert.equal(parseTarget({ selector: 42 }), null)
  const target = parseTarget({
    selector: '#register',
    text: 'Register now',
    html: '<a id="register" class="button">Register now</a>',
    rect: { x: 24.4, y: 300, width: 180.6, height: 48 },
    viewport: { width: 390, height: 844 },
  })
  assert.deepEqual(target, {
    selector: '#register',
    text: 'Register now',
    html: '<a id="register" class="button">Register now</a>',
    rect: { x: 24, y: 300, width: 181, height: 48 },
    viewport: { width: 390, height: 844 },
  })
  assert.equal(parseTarget({ selector: 'main > a', rect: { x: 'no' } }).rect, null)
  assert.equal(parseTarget({ selector: 'x'.repeat(400) }).selector.length, 300)
})

test('issueFromSubmission credits a named reporter in the title', () => {
  const issue = issueFromSubmission({ text: 'Dates are wrong\nThe event says Wednesday but it is Thursday.', name: 'Sam' }, { site: 'https://melbjs.harlanzw.com', at: '2026-09-09T08:00:00.000Z' })
  assert.equal(issue.title, 'Dates are wrong .. by Sam')
  assert.match(issue.body, /Thursday/)
  assert.match(issue.body, /by Sam/)
  assert.deepEqual(issue.labels, ['audience-feedback', 'name-provided'])
})

test('issueFromSubmission keeps the reporter when a long title is shortened', () => {
  const issue = issueFromSubmission({ text: 'a'.repeat(100), name: 'Sam' }, { site: 's', at: 't' })
  assert.equal(issue.title, `${'a'.repeat(69)}… .. by Sam`)
})

test('handler labels only names and pointed-at elements that survived parsing', async () => {
  for (const [input, expected] of [
    [{}, ['audience-feedback']],
    [{ name: '  ' }, ['audience-feedback']],
    [{ name: 'Sam' }, ['audience-feedback', 'name-provided']],
    [{ target: { selector: '#register' } }, ['audience-feedback', 'pointed-at']],
    [{ target: { selector: '' } }, ['audience-feedback']],
    [{ name: 'Sam', target: { selector: '#register' } }, ['audience-feedback', 'name-provided', 'pointed-at']],
  ]) {
    let sent
    const handle = createFeedbackHandler({
      fetch: async (_url, init) => {
        sent = JSON.parse(init.body)
        return new Response(JSON.stringify({ number: 7 }), { status: 201 })
      },
      token: 'tok', repo: 'r', site: 's', log: silent,
    })
    assert.equal((await handle(post({ text: 'Dates are wrong', ...input }))).status, 201)
    assert.deepEqual(sent.labels, expected)
  }
})

test('issueFromSubmission adds a Where section for a pointed-at element', () => {
  const target = { selector: '#register', text: 'Register now', html: '<a id="register">Register now</a>', rect: { x: 24, y: 300, width: 181, height: 48 }, viewport: { width: 390, height: 844 } }
  const issue = issueFromSubmission({ text: 'Button is off screen on my phone', name: '', target }, { site: 's', at: 't' })
  assert.match(issue.body, /### Where/)
  assert.match(issue.body, /Selector: `#register`/)
  assert.match(issue.body, /181×48 at \(24, 300\)/)
  assert.match(issue.body, /Viewport: 390×844/)
  assert.match(issue.body, /```html\n<a id="register">Register now<\/a>\n```/)
  const plain = issueFromSubmission({ text: 'Button is off screen on my phone', name: '' }, { site: 's', at: 't' })
  assert.doesNotMatch(plain.body, /Where/)
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

test('handler files an issue and reports its number', async () => {
  const calls = []
  const fetch = async (url, init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ number: 7, html_url: 'https://github.com/harlan-zw/melbjs-clone/issues/7' }), { status: 201 })
  }
  const handle = createFeedbackHandler({ fetch, token: 'tok', repo: 'harlan-zw/melbjs-clone', site: 'https://melbjs.harlanzw.com', now: () => 0, log: silent })

  const response = await handle(post({ text: 'The register button is off screen on mobile', name: 'Sam', target: { selector: '#register', text: 'Register now' } }, { 'cf-connecting-ip': '1.1.1.1' }))
  assert.equal(response.status, 201)
  assert.deepEqual(await response.json(), { ok: true, number: 7 })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.github.com/repos/harlan-zw/melbjs-clone/issues')
  assert.equal(calls[0].init.headers.authorization, 'Bearer tok')
  const sent = JSON.parse(calls[0].init.body)
  assert.equal(sent.title, 'The register button is off screen on mobile .. by Sam')
  assert.deepEqual(sent.labels, ['audience-feedback', 'name-provided', 'pointed-at'])
  assert.match(sent.body, /Selector: `#register`/)
})

test('handler answers 400 for bad input, 204 for the honeypot, and never calls GitHub', async () => {
  let called = false
  const handle = createFeedbackHandler({ fetch: async () => { called = true }, token: 'tok', repo: 'r', site: 's', log: silent })
  assert.equal((await handle(post({ text: 'short' }))).status, 400)
  assert.equal((await handle(post('{not json'))).status, 400)
  assert.equal((await handle(post({ text: 'long enough text here', website: 'spam' }))).status, 204)
  assert.equal(called, false)
})

test('handler rate limits by connecting IP', async () => {
  const handle = createFeedbackHandler({
    fetch: async () => new Response(JSON.stringify({ number: 1, html_url: 'u' }), { status: 201 }),
    token: 'tok',
    repo: 'r',
    site: 's',
    limiter: createRateLimiter({ limit: 2, windowMs: 1000, now: () => 0 }),
    log: silent,
  })
  const body = { text: 'The register button is off screen on mobile' }
  assert.equal((await handle(post(body, { 'cf-connecting-ip': '2.2.2.2' }))).status, 201)
  assert.equal((await handle(post(body, { 'cf-connecting-ip': '2.2.2.2' }))).status, 201)
  assert.equal((await handle(post(body, { 'cf-connecting-ip': '2.2.2.2' }))).status, 429)
  assert.equal((await handle(post(body, { 'cf-connecting-ip': '3.3.3.3' }))).status, 201)
})

test('handler surfaces a GitHub refusal as 502 and a missing token as 503', async () => {
  const refused = createFeedbackHandler({ fetch: async () => new Response('bad credentials', { status: 401 }), token: 'tok', repo: 'r', site: 's', log: silent })
  assert.equal((await refused(post({ text: 'The register button is off screen' }))).status, 502)

  const unset = createFeedbackHandler({ fetch: async () => { throw new Error('must not be called') }, token: undefined, repo: 'r', site: 's', log: silent })
  const response = await unset(post({ text: 'The register button is off screen' }))
  assert.equal(response.status, 503)
  const health = await unset(new Request('https://melbjs.harlanzw.com/api/feedback/health'))
  assert.deepEqual(await health.json(), { ok: true, repo: 'r', configured: false })
})

test('browsers on shared Wi-Fi have separate allowances and a shared network cap', async () => {
  const handle = createFeedbackHandler({
    fetch: async () => new Response(JSON.stringify({ number: 1 }), { status: 201 }),
    token: 'tok', repo: 'r', site: 's', log: silent,
    limiter: createRateLimiter({ limit: 1 }),
    networkLimiter: createRateLimiter({ limit: 3 }),
  })
  const send = id => handle(post({ text: 'The register button is off screen' }, {
    'cf-connecting-ip': '2.2.2.2', 'x-feedback-client': `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  }))
  assert.equal((await send(1)).status, 201)
  assert.equal((await send(2)).status, 201)
  assert.equal((await send(1)).status, 429)
  assert.equal((await send(3)).status, 429)
})

test('handler answers 404 off the route and 405 for GET', async () => {
  const handle = createFeedbackHandler({ fetch: async () => {}, token: 'tok', repo: 'r', site: 's', log: silent })
  assert.equal((await handle(new Request('https://melbjs.harlanzw.com/api/other'))).status, 404)
  assert.equal((await handle(new Request('https://melbjs.harlanzw.com/api/feedback'))).status, 405)
})
