import assert from 'node:assert/strict'
import { test } from 'node:test'
import { webcrypto } from 'node:crypto'
import { createClientId } from './client-id.mjs'

// The server (server/feedback.mjs) accepts a UUID v4 shaped client id.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function storage(initial) {
  const map = initial ? new Map([['melbjs-feedback-client', initial]]) : new Map()
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
  }
}

test('a crypto without randomUUID still yields a usable id', () => {
  const crypto = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) }
  assert.match(createClientId({ crypto, storage: storage() }), uuid)
})

test('no crypto at all still yields a usable id', () => {
  assert.match(createClientId({ crypto: undefined, storage: storage() }), uuid)
})

test('randomUUID is used when present', () => {
  const crypto = { randomUUID: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
  assert.equal(createClientId({ crypto, storage: storage() }), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
})

test('the same browser keeps one id across visits', () => {
  const saved = storage()
  const crypto = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) }
  const first = createClientId({ crypto, storage: saved })
  assert.equal(createClientId({ crypto, storage: saved }), first)
  const remembered = storage('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
  assert.equal(createClientId({ crypto, storage: remembered }), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
})

test('disabled storage never blocks an id', () => {
  const broken = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
  assert.match(createClientId({ crypto: webcrypto, storage: broken }), uuid)
})
