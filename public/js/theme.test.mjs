import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'

function harness({ stored, storageError = false, setStorageError = false } = {}) {
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const savedStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const root = {
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value) },
    getAttribute(name) { return this.attributes[name] ?? null },
  }
  const buttons = ['green', 'yellow', 'red'].map((theme) => {
    return {
      theme,
      dataset: { themeOption: theme },
      attributes: {},
      listeners: {},
      setAttribute(name, value) { this.attributes[name] = String(value) },
      getAttribute(name) { return this.attributes[name] ?? null },
      addEventListener(type, listener) { this.listeners[type] = listener },
    }
  })
  const written = []
  globalThis.document = {
    documentElement: root,
    querySelectorAll: selector => selector === '[data-theme-option]' ? buttons : [],
  }
  const storage = {
    getItem() {
      if (storageError)
        throw new DOMException('Storage blocked', 'SecurityError')
      return stored ?? null
    },
    setItem(key, value) {
      if (setStorageError)
        throw new DOMException('Storage blocked', 'SecurityError')
      written.push([key, value])
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  return {
    root,
    buttons,
    written,
    restore() {
      if (savedDocument)
        Object.defineProperty(globalThis, 'document', savedDocument)
      if (savedStorage)
        Object.defineProperty(globalThis, 'localStorage', savedStorage)
      else
        delete globalThis.localStorage
    },
  }
}

test('the page loads green when nothing is stored', async () => {
  const h = harness()
  try {
    await import('./theme.js?default-test')
    assert.equal(h.root.getAttribute('data-theme'), 'green')
    assert.deepEqual(h.buttons.map(button => button.getAttribute('aria-pressed')), ['true', 'false', 'false'])
    assert.deepEqual(h.written, [])
  }
  finally {
    h.restore()
  }
})

test('a stored colour wins over the default', async () => {
  const h = harness({ stored: 'red' })
  try {
    await import('./theme.js?stored-test')
    assert.equal(h.root.getAttribute('data-theme'), 'red')
    assert.deepEqual(h.buttons.map(button => button.getAttribute('aria-pressed')), ['false', 'false', 'true'])
  }
  finally {
    h.restore()
  }
})

test('an unknown stored colour falls back to green', async () => {
  const h = harness({ stored: 'chartreuse' })
  try {
    await import('./theme.js?stored-invalid-test')
    assert.equal(h.root.getAttribute('data-theme'), 'green')
  }
  finally {
    h.restore()
  }
})

test('a blocked store falls back to green and picks stay working', async () => {
  const h = harness({ stored: 'yellow', storageError: true, setStorageError: true })
  try {
    await import('./theme.js?blocked-storage-test')
    assert.equal(h.root.getAttribute('data-theme'), 'green')
    h.buttons[1].listeners.click()
    assert.equal(h.root.getAttribute('data-theme'), 'yellow')
    assert.deepEqual(h.buttons.map(button => button.getAttribute('aria-pressed')), ['false', 'true', 'false'])
    assert.deepEqual(h.written, [])
  }
  finally {
    h.restore()
  }
})

test('clicking a colour applies it, marks it pressed and keeps it for next visit', async () => {
  const h = harness()
  try {
    await import('./theme.js?click-test')
    h.buttons[2].listeners.click()
    assert.equal(h.root.getAttribute('data-theme'), 'red')
    assert.deepEqual(h.buttons.map(button => button.getAttribute('aria-pressed')), ['false', 'false', 'true'])
    assert.deepEqual(h.written, [['melbjs-theme', 'red']])
    h.buttons[0].listeners.click()
    assert.equal(h.root.getAttribute('data-theme'), 'green')
    assert.deepEqual(h.written, [['melbjs-theme', 'red'], ['melbjs-theme', 'green']])
  }
  finally {
    h.restore()
  }
})

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

const style = html
  .match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''

function withDom({ stored, storageError = false } = {}, run) {
  const savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const savedStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const root = {
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value) },
    getAttribute(name) { return this.attributes[name] ?? null },
  }
  const buttons = ['green', 'yellow', 'red'].map((theme) => {
    return {
      theme,
      attributes: { 'data-theme-option': theme, 'aria-pressed': String(theme === 'green') },
      setAttribute(name, value) { this.attributes[name] = String(value) },
      getAttribute(name) { return this.attributes[name] ?? null },
    }
  })
  globalThis.document = {
    documentElement: root,
    querySelectorAll: selector => selector === '[data-theme-option]' ? buttons : [],
  }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem() {
        if (storageError)
          throw new DOMException('Storage blocked', 'SecurityError')
        return stored ?? null
      },
      setItem() {},
    },
  })
  try {
    run()
  }
  finally {
    if (savedDocument)
      Object.defineProperty(globalThis, 'document', savedDocument)
    else
      delete globalThis.document
    if (savedStorage)
      Object.defineProperty(globalThis, 'localStorage', savedStorage)
    else
      delete globalThis.localStorage
  }
  return { root, buttons }
}

function runInlineScripts() {
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map(match => match[1])
  return withDom({ stored: 'red' }, () => {
    inline.forEach(source => new Function(source)())
  })
}

test('the stored colour and pressed states apply before first paint', () => {
  const { root, buttons } = runInlineScripts()
  assert.equal(root.getAttribute('data-theme'), 'red')
  assert.deepEqual(buttons.map(button => button.getAttribute('aria-pressed')), ['false', 'false', 'true'])
})

test('a blocked store never breaks the paint-time scripts', () => {
  assert.doesNotThrow(() => {
    withDom({ storageError: true }, () => {
      const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map(match => match[1])
      inline.forEach(source => new Function(source)())
    })
  })
})

const varMap = new Map(
  [...style.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})/gi)].map(match => [match[1], match[2]]),
)

function resolveVars(declarations) {
  return declarations.replace(/var\((--[\w-]+)\)/g, (name, ref) => varMap.get(ref) ?? name)
}

const rules = [...style.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selectors, declarations]) => ({
    selectors: selectors.trim(),
    declarations: resolveVars(declarations),
  }))

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
