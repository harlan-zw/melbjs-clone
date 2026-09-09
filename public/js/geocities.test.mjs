import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

const style = page.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''

const varMap = new Map(
  [...style.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})/gi)].map(match => [match[1], match[2]]),
)

const bodyGradient = style.match(/body\s*\{[^}]*linear-gradient[^}]*\}/)?.[0] ?? ''
const stops = bodyGradient
  .replace(/var\((--[\w-]+)\)/g, (_, name) => varMap.get(name) ?? '')
  .match(/#[0-9a-f]{6}/gi) ?? []

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

test('the body gradient is properly teal', () => {
  assert.ok(stops.length >= 3, `expected teal gradient stops, found ${stops.join(', ')}`)
  for (const stop of stops) {
    const [r, g, b] = channels(stop)
    assert.ok(g > r && g > b, `gradient stop ${stop} is not teal-dominant`)
    assert.ok(g >= 0x42, `gradient stop ${stop} is not teal enough`)
  }
})

test('a pale teal accent glows somewhere in the theme', () => {
  const teals = [...varMap.values(), ...style.match(/#[0-9a-f]{6}/gi) ?? []]
    .map(hex => channels(hex))
    .filter(([r, g, b]) => g >= 0xc0 && b >= 0x90 && b <= g)
  assert.ok(teals.length > 0, 'no teal accent found in the theme')
})
