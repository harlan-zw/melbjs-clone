// Classic page, classic courtesy: stop the marquee for people who ask
// their device for reduced motion.
;(function () {
  var marquee = document.querySelector('.geo-marquee')
  if (!marquee)
    return
  var motion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)')
  if (motion && motion.matches)
    marquee.stop()
})()
