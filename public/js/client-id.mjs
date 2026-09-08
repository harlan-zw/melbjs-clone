// One stable id per browser, sent as x-feedback-client so the server can
// rate limit per browser. It falls down the Web Crypto ladder because
// crypto.randomUUID (Chrome 92 / Safari 15.4 / Firefox 95) is newer than
// the rest of this feature: getRandomValues, then Date plus Math.random.

var STORAGE_KEY = 'melbjs-feedback-client'

function hexByte(byte) {
  return (byte + 0x100).toString(16).slice(1)
}

function randomHex(crypto) {
  if (crypto && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID().replace(/-/g, '')
  if (crypto && typeof crypto.getRandomValues === 'function') {
    var bytes = crypto.getRandomValues(new Uint8Array(16))
    var hex = ''
    for (var i = 0; i < bytes.length; i++)
      hex += hexByte(bytes[i])
    return hex
  }
  // No Web Crypto at all. Date breaks same-tick collisions and Math.random
  // fills the rest of the digits.
  var fallback = '' + Date.now().toString(16)
  while (fallback.length < 12)
    fallback = '0' + fallback
  while (fallback.length < 32)
    fallback += Math.floor(Math.random() * 16).toString(16)
  return fallback
}

// Shape 32 hex digits into the UUID v4 format the server accepts.
function v4Shape(hex) {
  var variant = (Number.parseInt(hex[16], 16) & 0x3) | 0x8
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-4' + hex.slice(13, 16)
    + '-' + variant.toString(16) + hex.slice(17, 20) + '-' + hex.slice(20, 32)
}

export function createClientId({ crypto, storage } = {}) {
  var stored = null
  try {
    stored = storage && storage.getItem(STORAGE_KEY)
  }
  catch {
    // Storage can be disabled. Make a fresh id instead of failing.
  }
  if (stored)
    return stored
  var id = v4Shape(randomHex(crypto))
  try {
    if (storage)
      storage.setItem(STORAGE_KEY, id)
  }
  catch {
    // Storage can be disabled. Keep the id in memory for this page.
  }
  return id
}
