// Cloudflare Worker entry. Static files are served from `public/` by the
// assets binding; only `/api/*` reaches this code (see wrangler.jsonc).
import { createFeedbackHandler, createRateLimiter } from './feedback.mjs'

const limiter = createRateLimiter()
const networkLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 })

export default {
  fetch(request, env) {
    const handle = createFeedbackHandler({
      fetch: globalThis.fetch,
      token: env.GITHUB_TOKEN,
      repo: env.GITHUB_REPO,
      site: env.SITE,
      limiter,
      networkLimiter,
    })
    return handle(request)
  },
}
