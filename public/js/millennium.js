// Ben asked the homepage to solve a Millennium Prize Problem. Each visit
// picks one of the seven at random. The Poincaré conjecture is the only one
// with a claimed prize, so we take partial credit for it.
;(function () {
  var problems = [
    { name: 'Birch and Swinnerton-Dyer conjecture' },
    { name: 'Hodge conjecture' },
    { name: 'Navier-Stokes existence and smoothness' },
    { name: 'P versus NP' },
    { name: 'Riemann hypothesis' },
    { name: 'Yang-Mills existence and mass gap' },
    { name: 'Poincaré conjecture', solved: true },
  ]
  var element = document.getElementById('millennium-problem')
  if (!element)
    return
  var pick = problems[Math.floor(Math.random() * problems.length)]
  element.textContent = pick.name
  var status = document.getElementById('millennium-status')
  if (status)
    status.textContent = pick.solved
      ? 'Status: solved (Grigori Perelman, 2002). You are welcome.'
      : 'Status: unsolved. We are on it.'
})()
