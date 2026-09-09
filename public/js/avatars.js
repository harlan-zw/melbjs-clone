// Playful motion for the speaker avatars: a slow CSS spin, plus a small
// canvas fireworks burst from an avatar when it is hovered, focused, or
// picked by a periodic trigger. Everything is skipped for reduced motion.
(function () {
  var section = document.querySelector('.speakers')
  var avatars = []
  if (section) {
    Array.prototype.forEach.call(section.querySelectorAll('.media a'), function (link) {
      if (link.querySelector('img'))
        avatars.push(link)
    })
  }
  if (!section || !avatars.length)
    return
  var motion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)')
  if (motion && motion.matches)
    return

  var COLORS = ['#f0c987', '#e8bd7a', '#fff3e0', '#d9a05b', '#b5763a']
  var PARTICLES = 24
  var particles = []
  var frame = null

  var canvas = document.createElement('canvas')
  canvas.className = 'fireworks'
  canvas.setAttribute('aria-hidden', 'true')
  var ctx = canvas.getContext('2d')
  if (!ctx)
    return
  section.appendChild(canvas)

  function resize() {
    var box = section.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(box.width))
    canvas.height = Math.max(1, Math.round(box.height))
  }

  function centerOf(avatar) {
    var rect = avatar.getBoundingClientRect()
    var box = section.getBoundingClientRect()
    return {
      x: rect.left - box.left + rect.width / 2,
      y: rect.top - box.top + rect.height / 2,
    }
  }

  function tick() {
    frame = null
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    particles = particles.filter(function (particle) {
      particle.x += particle.vx
      particle.y += particle.vy
      particle.vy += 0.06
      particle.vx *= 0.985
      particle.vy *= 0.985
      particle.life -= 0.02
      if (particle.life <= 0)
        return false
      ctx.globalAlpha = particle.life
      ctx.fillStyle = particle.color
      ctx.beginPath()
      ctx.arc(particle.x, particle.y, 2.5, 0, Math.PI * 2)
      ctx.fill()
      return true
    })
    ctx.globalAlpha = 1
    if (particles.length)
      frame = requestAnimationFrame(tick)
  }

  function burst(x, y) {
    for (var i = 0; i < PARTICLES; i++) {
      var angle = (Math.PI * 2 * i) / PARTICLES + Math.random() * 0.2
      var speed = 2.5 + Math.random() * 3
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life: 1,
        color: COLORS[i % COLORS.length],
      })
    }
    if (frame === null)
      frame = requestAnimationFrame(tick)
  }

  function burstAt(avatar) {
    var center = centerOf(avatar)
    burst(center.x, center.y)
  }

  Array.prototype.forEach.call(avatars, function (avatar) {
    avatar.addEventListener('pointerenter', function () { burstAt(avatar) })
    avatar.addEventListener('focus', function () { burstAt(avatar) })
  })

  // A gentle periodic trigger keeps the page alive without a pointer, but
  // only while the section is on screen and the tab is visible.
  var visible = typeof IntersectionObserver !== 'function'
  if (!visible) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting
    }).observe(section)
  }
  setInterval(function () {
    if (document.hidden || !visible)
      return
    burstAt(avatars[Math.floor(Math.random() * avatars.length)])
  }, 7000)

  window.addEventListener('resize', resize)
  resize()
})()
