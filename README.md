# melbjs-clone

A static clone of melbjs.com, used as the audience feedback target for the Zero To Software Factories talk.

Serve locally: `python3 -m http.server 4173 --directory .` then open http://127.0.0.1:4173/

Vanilla HTML, CSS, and JS with no build step.

Audience feedback: the page posts to `/api/feedback`, served by `server/feedback.mjs` (Node, no dependencies). Run `node --test server/feedback.test.mjs` for its tests. Deployment: `RUNBOOK.md`.
