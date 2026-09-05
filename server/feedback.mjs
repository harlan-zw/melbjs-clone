// Audience feedback endpoint for the melbjs.com clone.
// POST /api/feedback {text, name?} files one GitHub issue with a token.
// No dependencies. Node 20 or later. Pure core (parse, shape the issue,
// rate limit) and one effectful shell (the HTTP server).

import { createServer } from 'node:http'
import process from 'node:process'

export const LIMITS = { textMin: 10, textMax: 2000, nameMax: 60, perWindow: 5, windowMs: 10 * 60 * 1000 }

/** Parse untrusted JSON once into a submission, or say why not. */
export function parseSubmission(input) {
  if (typeof input !== 'object' || input === null)
    return { _tag: 'Err', reason: 'Send a JSON object.' }
  if (typeof input.website === 'string' && input.website.length > 0)
    return { _tag: 'Honeypot' }
  const text = typeof input.text === 'string' ? input.text.trim() : ''
  if (text.length < LIMITS.textMin)
    return { _tag: 'Err', reason: `Write at least ${LIMITS.textMin} characters.` }
  if (text.length > LIMITS.textMax)
    return { _tag: 'Err', reason: `Keep it under ${LIMITS.textMax} characters.` }
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, LIMITS.nameMax) : ''
  return { _tag: 'Ok', submission: { text, name } }
}

/** The issue the factory will triage. Title is the first line, body keeps the rest. */
export function issueFromSubmission({ text, name }, { site, at }) {
  const [first, ...rest] = text.split(/\r?\n/)
  const title = first.length > 80 ? `${first.slice(0, 77)}…` : first
  const detail = rest.join('\n').trim()
  const body = [
    detail || text,
    '',
    '---',
    `Submitted from ${site} on ${at}${name ? ` by ${name}` : ''}.`,
  ].join('\n')
  return { title, body, labels: ['audience-feedback'] }
}

/** Sliding window per key. `now` is injected so tests do not sleep. */
export function createRateLimiter({ limit = LIMITS.perWindow, windowMs = LIMITS.windowMs, now = () => Date.now() } = {}) {
  const hits = new Map()
  return {
    allow(key) {
      const t = now()
      const recent = (hits.get(key) ?? []).filter(stamp => t - stamp < windowMs)
      if (recent.length >= limit) {
        hits.set(key, recent)
        return false
      }
      recent.push(t)
      hits.set(key, recent)
      return true
    },
  }
}

async function readJson(req, maxBytes = 16 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes)
      return { _tag: 'Err', reason: 'Request too large.' }
    chunks.push(chunk)
  }
  try {
    return { _tag: 'Ok', value: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }
  }
  catch {
    // A malformed body is the client's mistake, reported as a 400 below.
    return { _tag: 'Err', reason: 'Body is not valid JSON.' }
  }
}

function send(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(body) })
  res.end(body)
}

/** File the issue. Returns the number, or a tagged failure with the GitHub status. */
export async function fileIssue({ fetch, token, repo, issue }) {
  const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${token}`,
      'accept': 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'melbjs-clone-feedback',
      'x-github-api-version': '2022-11-28',
    },
    body: JSON.stringify(issue),
  })
  if (!response.ok)
    return { _tag: 'Err', status: response.status, detail: (await response.text()).slice(0, 300) }
  const data = await response.json()
  return { _tag: 'Ok', number: data.number, url: data.html_url }
}

/** Explicit dependencies: the shell passes fetch, token, clock, and limiter. */
export function createHandler({ fetch, token, repo, site, now = () => Date.now(), limiter = createRateLimiter({ now }), log = console }) {
  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/api/feedback/health' && req.method === 'GET')
      return send(res, 200, { ok: true, repo })
    if (url.pathname !== '/api/feedback')
      return send(res, 404, { ok: false, error: 'Not found.' })
    if (req.method !== 'POST')
      return send(res, 405, { ok: false, error: 'Use POST.' })

    const ip = req.headers['cf-connecting-ip'] ?? req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? 'unknown'
    if (!limiter.allow(ip))
      return send(res, 429, { ok: false, error: 'Five per ten minutes. Try again soon.' })

    const body = await readJson(req)
    if (body._tag === 'Err')
      return send(res, 400, { ok: false, error: body.reason })
    const parsed = parseSubmission(body.value)
    if (parsed._tag === 'Honeypot')
      return send(res, 204, {})
    if (parsed._tag === 'Err')
      return send(res, 400, { ok: false, error: parsed.reason })

    const issue = issueFromSubmission(parsed.submission, { site, at: new Date(now()).toISOString() })
    const filed = await fileIssue({ fetch, token, repo, issue })
    if (filed._tag === 'Err') {
      log.error(`GitHub refused the issue: ${filed.status} ${filed.detail}`)
      return send(res, 502, { ok: false, error: 'Could not file the issue. Tell Harlan.' })
    }
    log.info(`Filed ${repo}#${filed.number} from ${ip}`)
    return send(res, 201, { ok: true, number: filed.number })
  }
}

function main() {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    process.stderr.write('GITHUB_TOKEN is not set. Set it in the environment file and restart.\n')
    process.exit(1)
  }
  const repo = process.env.GITHUB_REPO ?? 'harlan-zw/melbjs-clone'
  const site = process.env.SITE ?? 'https://melbjs.harlanzw.com'
  const port = Number(process.env.PORT ?? 8790)
  const host = process.env.BIND ?? '127.0.0.1'
  const handler = createHandler({ fetch: globalThis.fetch, token, repo, site })
  createServer((req, res) => {
    handler(req, res).catch((error) => {
      console.error(error)
      if (!res.headersSent)
        send(res, 500, { ok: false, error: 'Unexpected failure.' })
    })
  }).listen(port, host, () => {
    process.stdout.write(`melbjs-clone feedback listening on http://${host}:${port}, filing to ${repo}\n`)
  })
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href)
  main()
