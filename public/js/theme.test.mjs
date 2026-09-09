import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

test('the inert page colour picker is fully removed', () => {
  // The picker kept its buttons while every page rule went hardcoded teal,
  // so a click restyled only the picker. None of it may ship: no buttons,
  // no data-theme CSS or script state, no stored colour, no theme script
  // tag, and no dead --geo-* overrides.
  for (const marker of [
    'data-theme-option',
    ':root[data-theme',
    "setAttribute('data-theme'",
    'melbjs-theme',
    '/js/theme.js',
    'theme-pick',
    '--geo-',
  ]) {
    assert.ok(!page.includes(marker), `leftover theme picker marker in index.html: ${marker}`)
  }
})
