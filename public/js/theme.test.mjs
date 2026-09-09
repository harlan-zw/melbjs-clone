import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const style = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  .match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''

const rules = [...style.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selectors, declarations]) => ({ selectors: selectors.trim(), declarations }))

function colorOf(selector) {
  const rule = rules.find(r => r.selectors === selector)
  assert.ok(rule, `missing css rule for selector "${selector}"`)
  return rule.declarations.match(/color:\s*(#[0-9a-f]{6})/i)?.[1]
}

function luminance(hex) {
  const [r, g, b] = [0, 2, 4]
    .map(i => Number.parseInt(hex.slice(1 + i, 3 + i), 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(foreground, background) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (light + 0.05) / (dark + 0.05)
}

test('links stay WCAG AA readable over every body gradient stop', () => {
  const bodyRule = rules.find(r => r.selectors === 'body' && r.declarations.includes('linear-gradient'))
  assert.ok(bodyRule, 'missing body gradient rule')
  const stops = bodyRule.declarations.match(/#[0-9a-f]{6}/gi) ?? []
  assert.ok(stops.length > 0, 'body gradient rule has no color stops')
  const link = colorOf('a')
  const hover = colorOf('a:hover')
  assert.ok(link, 'link color missing')
  assert.ok(hover, 'link hover color missing')
  for (const stop of stops) {
    assert.ok(
      contrast(link, stop) >= 4.5,
      `link ${link} on gradient stop ${stop} is ${contrast(link, stop).toFixed(2)}:1, needs >= 4.5:1`,
    )
    assert.ok(
      contrast(hover, stop) >= 4.5,
      `link hover ${hover} on gradient stop ${stop} is ${contrast(hover, stop).toFixed(2)}:1, needs >= 4.5:1`,
    )
  }
})
