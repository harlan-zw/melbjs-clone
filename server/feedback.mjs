// Audience feedback endpoint for the melbjs.com clone.
// POST /api/feedback {text, name?} files one GitHub issue with a token.
// Web-standard Request and Response, so the same handler runs in the
// Cloudflare Worker and under `node --test`. Pure core (parse, shape the
// issue, rate limit) and one effectful shell (`handleFeedback`).

export const LIMITS = { textMin: 10, textMax: 2000, nameMax: 60, selectorMax: 300, targetTextMax: 300, targetHtmlMax: 2000, bodyBytes: 16 * 1024, perWindow: 5, windowMs: 10 * 60 * 1000 }

function integer(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
}

/**
 * The element the reporter pointed at. Anything malformed becomes null rather
 * than an error: the words matter more than the pointer, so a bad pointer
 * never blocks a submission.
 */
export function parseTarget(input) {
  if (typeof input !== 'object' || input === null || typeof input.selector !== 'string')
    return null
  const selector = input.selector.trim().slice(0, LIMITS.selectorMax)
  if (selector.length === 0)
    return null
  const rect = typeof input.rect === 'object' && input.rect !== null
    ? { x: integer(input.rect.x), y: integer(input.rect.y), width: integer(input.rect.width), height: integer(input.rect.height) }
    : null
  const viewport = typeof input.viewport === 'object' && input.viewport !== null
    ? { width: integer(input.viewport.width), height: integer(input.viewport.height) }
    : null
  return {
    selector,
    text: typeof input.text === 'string' ? input.text.trim().slice(0, LIMITS.targetTextMax) : '',
    html: typeof input.html === 'string' ? input.html.trim().slice(0, LIMITS.targetHtmlMax) : '',
    rect: rect && Object.values(rect).every(v => v !== null) ? rect : null,
    viewport: viewport && Object.values(viewport).every(v => v !== null) ? viewport : null,
  }
}

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
  const name = typeof input.name === 'string' ? input.name.replace(/\s+/g, ' ').trim().slice(0, LIMITS.nameMax) : ''
  return { _tag: 'Ok', submission: { text, name, target: parseTarget(input.target) } }
}

/** The issue the factory will triage. Title is the first line, body keeps the rest. */
export function issueFromSubmission({ text, name, target = null }, { site, at }) {
  const [first, ...rest] = text.split(/\r?\n/)
  const credit = name ? ` .. by ${name}` : ''
  const titleLimit = 80 - credit.length
  const title = `${first.length > titleLimit ? `${first.slice(0, titleLimit - 1)}…` : first}${credit}`
  const detail = rest.join('\n').trim()
  const where = target
    ? [
        '',
        '### Where',
        '',
        `Selector: \`${target.selector}\``,
        target.text ? `Text: "${target.text}"` : null,
        target.rect ? `Position: ${target.rect.width}×${target.rect.height} at (${target.rect.x}, ${target.rect.y}) on the page` : null,
        target.viewport ? `Viewport: ${target.viewport.width}×${target.viewport.height}` : null,
        target.html ? `\n\`\`\`html\n${target.html.replace(/```/g, '` ` `')}\n\`\`\`` : null,
      ].filter(line => line !== null)
    : []
  const body = [
    detail || text,
    ...where,
    '',
    '---',
    `Submitted from ${site} on ${at}${name ? ` by ${name}` : ''}.`,
  ].join('\n')
  const labels = ['audience-feedback']
  if (name)
    labels.push('name-provided')
  if (target)
    labels.push('pointed-at')
  return { title, body, labels }
}

/**
 * Sliding window per key. `now` is injected so tests do not sleep.
 * In the Worker this lives per isolate, so it is a best-effort brake on one
 * burst, not a global quota. The honeypot and the issue label do the rest.
 */
export function createRateLimiter({ limit = LIMITS.perWindow, windowMs = LIMITS.windowMs, now = () => Date.now() } = {}) {
  const hits = new Map()
  return {
    allow(key) {
      const t = now()
      for (const [storedKey, stamps] of hits) {
        if (t - stamps[stamps.length - 1] >= windowMs)
          hits.delete(storedKey)
      }
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

function json(status, payload) {
  return new Response(status === 204 ? null : JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

async function readJson(request, maxBytes = LIMITS.bodyBytes) {
  const text = await request.text()
  if (text.length > maxBytes)
    return { _tag: 'Err', reason: 'Request too large.' }
  try {
    return { _tag: 'Ok', value: JSON.parse(text || '{}') }
  }
  catch {
    // A malformed body is the client's mistake, reported as a 400 below.
    return { _tag: 'Err', reason: 'Body is not valid JSON.' }
  }
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

/**
 * Explicit dependencies: the shell passes fetch, token, clock, and limiter.
 * `token` may be undefined when the secret is not set yet; the endpoint then
 * says so instead of filing nothing quietly.
 */
export function createFeedbackHandler({ fetch, token, repo, site, now = () => Date.now(), limiter = createRateLimiter({ now }), networkLimiter = createRateLimiter({ limit: 60, windowMs: 60_000, now }), log = console }) {
  return async (request) => {
    const url = new URL(request.url)
    if (url.pathname === '/api/feedback/health' && request.method === 'GET')
      return json(200, { ok: true, repo, configured: Boolean(token) })
    if (url.pathname !== '/api/feedback')
      return json(404, { ok: false, error: 'Not found.' })
    if (request.method !== 'POST')
      return json(405, { ok: false, error: 'Use POST.' })

    const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    // Browser IDs separate venue attendees. They are a courtesy limit, not authentication.
    const client = request.headers.get('x-feedback-client') ?? ''
    const key = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(client) ? `${ip}:${client}` : ip
    if (!networkLimiter.allow(ip))
      return json(429, { ok: false, error: 'This network sent too much feedback. Wait one minute.' })
    if (!limiter.allow(key))
      return json(429, { ok: false, error: 'Five per browser per ten minutes. Try again soon.' })

    const body = await readJson(request)
    if (body._tag === 'Err')
      return json(400, { ok: false, error: body.reason })
    const parsed = parseSubmission(body.value)
    if (parsed._tag === 'Honeypot')
      return json(204, {})
    if (parsed._tag === 'Err')
      return json(400, { ok: false, error: parsed.reason })
    if (!token) {
      log.error('GITHUB_TOKEN is not set. Run: wrangler secret put GITHUB_TOKEN')
      return json(503, { ok: false, error: 'Feedback is not wired up yet. Tell Harlan.' })
    }

    const issue = issueFromSubmission(parsed.submission, { site, at: new Date(now()).toISOString() })
    const filed = await fileIssue({ fetch, token, repo, issue })
    if (filed._tag === 'Err') {
      log.error(`GitHub refused the issue: ${filed.status} ${filed.detail}`)
      return json(502, { ok: false, error: 'Could not file the issue. Tell Harlan.' })
    }
    log.info(`Filed ${repo}#${filed.number} from ${ip}`)
    return json(201, { ok: true, number: filed.number })
  }
}
