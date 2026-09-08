const MAX_PAGES = 10

function json(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  })
}

function summary(item, repo) {
  const isPr = Boolean(item.pull_request)
  return {
    number: item.number,
    title: item.title,
    url: `https://github.com/${repo}/${isPr ? 'pull' : 'issues'}/${item.number}`,
    state: isPr && item.pull_request.merged_at ? 'merged' : item.state,
    labels: item.labels.map(label => label.name),
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    mergedAt: item.pull_request?.merged_at ?? null,
  }
}

/** Publish a small view of the fixed public repository. The token stays here. */
export function createResultsHandler({ repo, token, fetch, cache, now = () => Date.now(), log = console }) {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'melbjs-clone-results',
    'x-github-api-version': '2022-11-28',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  }
  async function read(path) {
    const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      headers, signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      const limited = response.status === 429 || response.status === 403
      return { _tag: 'Err', response: json(503, {
        error: limited ? 'GitHub rate limit reached. Try again soon.' : 'GitHub results are unavailable. Try again soon.',
      }, { 'retry-after': response.headers.get('retry-after') || '60' }) }
    }
    return { _tag: 'Ok', value: await response.json() }
  }

  return async (request) => {
    if (request.method !== 'GET')
      return json(405, { error: 'Use GET.' }, { allow: 'GET' })
    const key = new Request(new URL('/api/results', request.url))
    const cached = await cache?.match(key)
    if (cached)
      return cached

    const load = async () => {
      const metadata = await read('')
      if (metadata._tag === 'Err')
        return metadata.response
      if (metadata.value.private !== false)
        return json(503, { error: 'Results require a public repository.' })

      const items = []
      let truncated = false
      for (let page = 1; page <= MAX_PAGES; page++) {
        const result = await read(`/issues?state=all&per_page=100&page=${page}`)
        if (result._tag === 'Err')
          return result.response
        if (!Array.isArray(result.value) || result.value.some(item => !Number.isSafeInteger(item.number)
          || typeof item.title !== 'string' || !['open', 'closed'].includes(item.state)
          || !Array.isArray(item.labels)))
          return json(503, { error: 'GitHub returned invalid results. Try again soon.' })
        items.push(...result.value)
        if (result.value.length < 100)
          break
        truncated = page === MAX_PAGES
      }
      const response = json(200, {
        repo,
        updatedAt: new Date(now()).toISOString(),
        truncated,
        issues: items.filter(item => !item.pull_request && item.labels.some(label => label.name === 'audience-feedback')).map(item => summary(item, repo)),
        pullRequests: items.filter(item => item.pull_request).map(item => summary(item, repo)),
      }, { 'cache-control': 'public, max-age=30' })
      await cache?.put(key, response.clone())
      return response
    }
    return load().catch((error) => {
      log.error('Could not load GitHub results.', error)
      return json(503, { error: 'Results are unavailable. Try again soon.' }, { 'retry-after': '60' })
    })
  }
}
