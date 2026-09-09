import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

const style = page.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''

const varMap = new Map(
  [...style.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})/gi)].map(match => [match[1], match[2]]),
)

const bodyGradient = style.match(/body\s*\{[^}]*linear-gradient[^}]*\}/)?.[0] ?? ''
const stops = [...bodyGradient.matchAll(/linear-gradient\([^)]*\)/g)]
  .flatMap(match => match[0].match(/#[0-9a-f]{6}/gi) ?? [])

function channels(hex) {
  return [0, 2, 4].map(i => Number.parseInt(hex.slice(1 + i, 3 + i), 16))
}

test('the page scrolls a welcome ticker', () => {
  assert.match(page, /class="marquee-bar"/, 'no marquee bar on the page')
  assert.match(style, /\.marquee-track\s*\{[^}]*animation:\s*ticker/, 'the ticker does not scroll')
  const copies = [...page.matchAll(/class="marquee-copy"/g)].length
  assert.ok(copies >= 2, `the ticker needs a duplicated copy to loop, found ${copies}`)
})

test('every referenced gif exists and is an animated GIF89a', () => {
  const sources = [...page.matchAll(/src="(\/gifs\/[^"]+\.gif)"/g)].map(match => match[1])
  assert.ok(sources.length >= 1, `expected at least 1 gif, found ${sources.length}`)
  for (const source of sources) {
    const file = new URL(`..${source}`, import.meta.url)
    const bytes = readFileSync(file)
    assert.equal(bytes.subarray(0, 6).toString('ascii'), 'GIF89a', `${source} is not a GIF89a`)
    const frames = [...bytes].filter(byte => byte === 0x2c).length
    assert.ok(frames >= 2, `${source} is not animated, found ${frames} frame(s)`)
  }
})

test('the New! gif keeps its vertical alignment', () => {
  assert.match(page, /class="geo-new"/, 'no hot-new gif on the page')
  assert.match(style, /\.geo-new\s*\{[^}]*vertical-align:\s*middle/, 'the .geo-new rule lost its vertical-align: middle')
})

test('the body paints a dark blue-violet night sky', () => {
  assert.ok(stops.length >= 3, `expected night sky stops, found ${stops.join(', ')}`)
  for (const stop of stops) {
    const [r, g, b] = channels(stop)
    assert.ok(b > r && b > g, `night sky stop ${stop} is not blue-violet dominant`)
    assert.ok(r + g + b <= 0xc0, `night sky stop ${stop} is not dark`)
  }
})

test('an orange accent burns somewhere in the theme', () => {
  const oranges = [...varMap.values(), ...style.match(/#[0-9a-f]{6}/gi) ?? []]
    .map(hex => channels(hex))
    .filter(([r, g, b]) => r >= 0xff - 0x20 && g >= 0x50 && g <= 0xb0 && b < 0x60)
  assert.ok(oranges.length > 0, 'no orange accent found in the theme')
})

test('links keep one top-level theme colour rule', () => {
  const openers = [...style.matchAll(/\ba \{/g)].length
  assert.equal(openers, 1, `expected 1 top-level "a {" rule, found ${openers}`)
  assert.match(style, /\n\s*a \{\n\s*color: #00ffff/, 'the a rule must start with color: #00ffff')
})

test('the style block has balanced braces', () => {
  const open = (style.match(/\{/g) ?? []).length
  const close = (style.match(/\}/g) ?? []).length
  assert.equal(close, open, `expected balanced braces, found ${open} "{" and ${close} "}"`)
})
