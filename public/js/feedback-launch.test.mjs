import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const style = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  .match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''

const rules = [...style.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selectors, declarations]) => ({ selectors: selectors.trim(), declarations }))

test('the feedback launch button lifts on hover', () => {
  const rule = rules.find(r => r.selectors === '.feedback-launch:hover')
  assert.ok(rule, 'missing css rule for selector ".feedback-launch:hover"')
  assert.match(rule.declarations, /transform:\s*translateY\(-2px\)/)
})
