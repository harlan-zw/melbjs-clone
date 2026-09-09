import assert from 'node:assert/strict'
import { test } from 'node:test'

const TITLE_TEXT = 'Melb.js'

function harness({ titleText = TITLE_TEXT, withMain = true } = {}) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const main = element('main')
  main.setAttribute('id', 'main')
  const title = element('h1')
  title.className = 'heavy'
  title.textContent = titleText
  main.appendChild(title)
  globalThis.document = {
    querySelector: selector => (selector === 'h1.heavy' ? title : null),
    getElementById: id => (withMain && id === 'main' ? main : null),
    createElement: tag => element(tag),
  }
  return {
    title,
    main,
    wrap() {
      return title.children.find(child => child.classList?.contains('breakthrough-title'))
    },
    note() {
      return main.children.find(child => child.tagName === 'P')
    },
    restore() {
      if (saved)
        Object.defineProperty(globalThis, 'document', saved)
      else
        delete globalThis.document
    },
  }
}

function element(tag) {
  const classes = new Set()
  const el = {
    tagName: tag.toUpperCase(),
    children: [],
    attrs: {},
    handlers: {},
    textContent: '',
    html: '',
    hidden: false,
    style: {
      vars: {},
      setProperty(name, value) {
        this.vars[name] = value
      },
    },
    setAttribute(name, value) {
      el.attrs[name] = String(value)
    },
    getAttribute(name) {
      return name in el.attrs ? el.attrs[name] : null
    },
    appendChild(child) {
      child.parent = el
      el.children.push(child)
      return child
    },
    insertAdjacentHTML(_, html) {
      el.html += html
      el.children.push({ raw: html })
    },
    insertAdjacentElement(_, node) {
      const at = el.parent.children.indexOf(el)
      el.parent.children.splice(at + 1, 0, node)
      node.parent = el.parent
      return node
    },
    addEventListener(type, handler) {
      ;(el.handlers[type] ??= []).push(handler)
    },
    dispatch(type, event = {}) {
      for (const handler of el.handlers[type] ?? [])
        handler(event)
    },
  }
  el.classList = {
    add: (...names) => names.forEach(name => classes.add(name)),
    remove: (...names) => names.forEach(name => classes.delete(name)),
    contains: name => classes.has(name),
  }
  Object.defineProperty(el, 'className', {
    get: () => [...classes].join(' '),
    set: value => {
      classes.clear()
      value.split(/\s+/).filter(Boolean).forEach(name => classes.add(name))
    },
  })
  return el
}

test('the title splits into accessible letters behind a real label', async () => {
  const h = harness()
  try {
    await import('./breakthrough.js?split-test')
    assert.equal(h.title.getAttribute('aria-label'), TITLE_TEXT)
    assert.equal(h.title.getAttribute('tabindex'), '0')
    const wrap = h.wrap()
    assert.ok(wrap, 'missing breakthrough wrapper')
    assert.equal(wrap.getAttribute('aria-hidden'), 'true')
    const letters = wrap.children[0].children
    assert.deepEqual(letters.map(letter => letter.textContent), [...TITLE_TEXT])
    for (const letter of letters) {
      assert.ok(letter.style.vars['--bx'], 'letter is missing a punch direction')
      assert.ok(letter.style.vars['--by'], 'letter is missing a lift direction')
    }
    const hint = h.title.children.find(child => child.id === 'breakthrough-hint')
    assert.ok(hint, 'missing activation hint')
    assert.match(hint.className, /visually-hidden/)
    assert.equal(h.title.getAttribute('aria-describedby'), 'breakthrough-hint')
  }
  finally {
    h.restore()
  }
})

test('activating the title punches, shakes, and reveals the credit note', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const h = harness()
  try {
    await import('./breakthrough.js?punch-test')
    h.title.dispatch('click')
    assert.ok(h.wrap().classList.contains('is-breaking'), 'punch class missing')
    assert.ok(h.main.classList.contains('breakthrough-shake'), 'shake class missing')
    assert.ok(h.note(), 'credit note missing')
    assert.ok(h.note().hidden, 'credit note starts hidden')
    t.mock.timers.tick(1000)
    assert.ok(!h.main.classList.contains('breakthrough-shake'), 'shake never cleans up')
    assert.ok(h.wrap().classList.contains('is-breaking'), 'punch ended too early')
    assert.ok(h.note().hidden, 'credit note shown too early')
    t.mock.timers.tick(200)
    assert.ok(!h.note().hidden, 'credit note never shown')
    t.mock.timers.tick(300)
    assert.ok(!h.wrap().classList.contains('is-breaking'), 'punch never cleans up')
    t.mock.timers.tick(3500)
    assert.ok(h.note().hidden, 'credit note never hides')
    h.title.dispatch('click')
    assert.ok(h.wrap().classList.contains('is-breaking'), 'punch cannot repeat')
  }
  finally {
    h.restore()
  }
})

test('clicks during a running punch are ignored', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const h = harness()
  try {
    await import('./breakthrough.js?guard-test')
    h.title.dispatch('click')
    t.mock.timers.tick(1000)
    h.title.dispatch('click')
    t.mock.timers.tick(4000)
    assert.ok(h.note().hidden, 'a queued punch left the note stuck open')
    assert.ok(!h.wrap().classList.contains('is-breaking'), 'a queued punch left classes behind')
  }
  finally {
    h.restore()
  }
})

test('enter and space activate, other keys do not', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const cases = [
    { key: 'Enter', activates: true, tag: 'enter' },
    { key: ' ', activates: true, tag: 'space' },
    { key: 'b', activates: false, tag: 'other' },
  ]
  for (const { key, activates, tag } of cases) {
    const h = harness()
    try {
      await import(`./breakthrough.js?keys-${tag}`)
      h.title.dispatch('keydown', { key, preventDefault() {} })
      assert.equal(h.wrap().classList.contains('is-breaking'), activates, `key "${key}"`)
    }
    finally {
      h.restore()
    }
  }
})

test('a page without the title does not crash', async () => {
  const h = harness({ titleText: '' })
  globalThis.document.querySelector = () => null
  try {
    await import('./breakthrough.js?missing-test')
  }
  finally {
    h.restore()
  }
})
