# melbjs-clone

A static clone of melbjs.com, used as the audience feedback target for the Zero To Software Factories talk. Live at https://melbjs.harlanzw.com/.

Vanilla HTML, CSS, and JS in `public/`, no build step. A Cloudflare Worker (`server/worker.mjs`) answers `/api/feedback` and files one GitHub issue per submission with the `audience-feedback` label. Everything else is served as static assets.

- Run locally: `pnpm dev` then open the printed URL. Put a token in `.dev.vars` as `GITHUB_TOKEN=...` to file real issues.
- Test: `pnpm test` (Node's own test runner, no dependencies).
- Deploy: a push to `main` runs `test` then `deploy` (`.github/workflows/ci.yml`). `pnpm deploy` does the same from a desktop with `wrangler login`.
- Setup and factory wiring: `RUNBOOK.md`.
