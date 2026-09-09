import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

const style = page.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''

const varMap = new Map(
  [...style.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})/gi)].map(match => [match[1], match[2]]),
)

const bodyGradient = style.match(/body\s*\{[^}]*linear-gradient[^}]*\}/)?.[0] ?? ''
const stops = bodyGradient.match(/#[0-9a-f]{6}/gi) ?? []

function channels(hex) {
  return [0, 2, 4].map(i => Number.parseInt(hex.slice(1 + i, 3 + i), 16))
}

test('the page scrolls a marquee', () => {
  assert.match(page, /<marquee[\s>]/, 'no marquee element on the page')
})

test('every referenced gif exists and is an animated GIF89a', () => {
  const sources = [...page.matchAll(/src="(\/gifs\/[^"]+\.gif)"/g)].map(match => match[1])
  assert.ok(sources.length >= 3, `expected at least 3 gifs, found ${sources.length}`)
  for (const source of sources) {
    const file = new URL(`..${source}`, import.meta.url)
    const bytes = readFileSync(file)
    assert.equal(bytes.subarray(0, 6).toString('ascii'), 'GIF89a', `${source} is not a GIF89a`)
    const frames = [...bytes].filter(byte => byte === 0x2c).length
    assert.ok(frames >= 2, `${source} is not animated, found ${frames} frame(s)`)
  }
})

test('the body gradient is properly red', () => {
  assert.ok(stops.length >= 3, `expected red gradient stops, found ${stops.join(', ')}`)
  for (const stop of stops) {
    const [r, g, b] = channels(stop)
    assert.ok(r > g && r > b, `gradient stop ${stop} is not red-dominant`)
    assert.ok(r >= 0x50, `gradient stop ${stop} is not red enough`)
  }
})

test('an orange accent burns somewhere in the theme', () => {
  const oranges = [...varMap.values(), ...style.match(/#[0-9a-f]{6}/gi) ?? []]
    .map(hex => channels(hex))
    .filter(([r, g, b]) => r >= 0xff - 0x20 && g >= 0x50 && g <= 0xb0 && b < 0x60)
  assert.ok(oranges.length > 0, 'no orange accent found in the theme')
})
