const get = id => document.getElementById(id)
const url = new URL(location.href)
const parsedSince = Date.parse(url.searchParams.get('since') ?? '')
let since = Number.isFinite(parsedSince) ? parsedSince : null
let latest
let timer
let loading = false

function row(item) {
  const li = document.createElement('li')
  const link = document.createElement('a')
  link.href = item.url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.textContent = `#${item.number} ${item.title} ↗`
  const meta = document.createElement('div')
  meta.className = 'meta'
  for (const label of [item.state, ...item.labels.filter(label => label !== 'audience-feedback')]) {
    const badge = document.createElement('span')
    badge.className = `badge ${label === item.state ? item.state : ''}`
    badge.textContent = label
    meta.append(badge)
  }
  li.append(link, meta)
  return li
}

function list(id, items, empty) {
  const target = get(id)
  target.replaceChildren(...items.map(row))
  if (!items.length) {
    const li = document.createElement('li')
    li.className = 'empty'
    li.textContent = empty
    target.append(li)
  }
}

function render() {
  get('period').textContent = since === null ? 'All feedback' : `Since ${new Date(since).toLocaleString()}`
  get('reset').hidden = since === null
  const mergedUrl = new URL('https://github.com/harlan-zw/melbjs-clone/pulls')
  mergedUrl.searchParams.set('q', `is:pr is:merged${since === null ? '' : ` merged:>=${new Date(since).toISOString()}`}`)
  document.querySelector('header a').href = mergedUrl.href
  if (!latest)
    return
  const issues = latest.issues.filter(item => since === null || Date.parse(item.createdAt) >= since)
  const prs = latest.pullRequests.filter(item => since === null || Date.parse(item.mergedAt ?? item.createdAt) >= since)
    .sort((a, b) => Number(b.state === 'merged') - Number(a.state === 'merged') || b.number - a.number)
  get('feedback-count').textContent = issues.length
  get('open-count').textContent = prs.filter(item => item.state === 'open').length
  get('merged-count').textContent = prs.filter(item => item.state === 'merged').length
  list('feedback', issues, 'No feedback in this period yet.')
  list('prs', prs, 'No pull requests in this period yet.')
  get('truncated').hidden = !latest.truncated
  get('status').textContent = `Last updated ${new Date(latest.updatedAt).toLocaleTimeString()}`
}

function setSince(value) {
  since = value
  if (since === null)
    url.searchParams.delete('since')
  else
    url.searchParams.set('since', new Date(since).toISOString())
  history.replaceState(null, '', url)
  render()
}
get('start').addEventListener('click', () => setSince(Date.now()))
get('reset').addEventListener('click', () => setSince(null))

async function refresh() {
  clearTimeout(timer)
  if (loading || document.hidden)
    return
  loading = true
  let delay = 30_000
  try {
    const response = await fetch('/api/results', { signal: AbortSignal.timeout(15_000) })
    if (!response.ok) {
      delay = Math.max(delay, Number(response.headers.get('retry-after') || 60) * 1000)
      throw new Error('GitHub results are unavailable. Retrying soon.')
    }
    latest = await response.json()
    get('error').hidden = true
    render()
  }
  catch (error) {
    get('error').textContent = latest ? `${error.message} Showing the last successful update.` : error.message
    get('error').hidden = false
    if (!latest)
      get('status').textContent = 'Waiting for GitHub results.'
  }
  finally {
    loading = false
    timer = setTimeout(refresh, Number.isFinite(delay) ? delay : 60_000)
  }
}
document.addEventListener('visibilitychange', () => document.hidden ? clearTimeout(timer) : refresh())
render()
refresh()
