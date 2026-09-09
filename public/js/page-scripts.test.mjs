import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

const scriptSources = [...page.matchAll(/<script[^>]*src="([^"]+)"/g)].map(match => match[1])

// A script may query a selector the static page lacks when it creates the
// element itself first (see hacker-mode.js), so allow self-assigned ids and
// classes. A query with no creation anywhere is a reference to removed markup.
function scriptCreates(script, name) {
  const patterns = [
    `\\.id\\s*=\\s*['"]${name}['"]`,
    `setAttribute\\(['"]id['"],\\s*['"]${name}['"]\\)`,
    `classList\\.add\\(['"]${name}['"]\\)`,
    `className\\s*=\\s*['"][^'"]*\\b${name}\\b`,
  ]
  return patterns.some(pattern => new RegExp(pattern).test(script))
}

test('loaded scripts only query selectors the page still has', () => {
  assert.ok(scriptSources.length >= 1, `expected loaded scripts, found ${scriptSources.length}`)
  for (const source of scriptSources) {
    const script = readFileSync(new URL(`..${source}`, import.meta.url), 'utf8')
    const selectors = [...script.matchAll(/(?:querySelector(?:All)?|getElementById)\('([^']+)'\)/g)]
      .map(match => match[1])
    assert.ok(selectors.length >= 1, `${source} queries no selectors`)
    for (const selector of selectors) {
      const token = selector.match(/[#.]?[\w-]+/)?.[0] ?? ''
      const name = token.startsWith('#') || token.startsWith('.') ? token.slice(1) : token
      if (name === '')
        continue
      assert.ok(
        page.includes(name) || scriptCreates(script, name),
        `${source} queries "${selector}" but the page no longer contains "${name}"`,
      )
    }
  }
})
