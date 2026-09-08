# Runbook: melbjs.harlanzw.com

The site is a Cloudflare Worker with static assets. Nothing runs on Hogwild except the factory that works on the repository.

## 1. Cloudflare

`wrangler.jsonc` names the Worker `melbjs-clone`, the account, and the custom domain `melbjs.harlanzw.com`. The first deploy created the DNS record. To deploy from a desktop:

```sh
pnpm install
pnpm exec wrangler deploy
curl -s https://melbjs.harlanzw.com/api/feedback/health
```

Expect `{"ok":true,"repo":"harlan-zw/melbjs-clone","configured":true}`. If `configured` is `false`, do step 2.

## 2. Feedback token

The Worker files issues with a GitHub token held as a Worker secret. Create a fine-grained personal access token scoped to `harlan-zw/melbjs-clone` only, with Issues: read and write. Nothing else.

```sh
pnpm exec wrangler secret put GITHUB_TOKEN
curl -s https://melbjs.harlanzw.com/api/feedback/health
curl -s -X POST https://melbjs.harlanzw.com/api/feedback \
  -H 'content-type: application/json' \
  -d '{"text":"Runbook test: the register button label is fine, close me","name":"Harlan"}'
```

Expect `{"ok":true,"number":N}` and a new issue in the repository. Close it.

If the reply is `503`, the secret is not set. If it is `502`, the token is wrong or lacks Issues write; `pnpm exec wrangler tail` shows the GitHub status.

## 3. Continuous deployment

`.github/workflows/ci.yml` runs `test` on every pull request and `test` then `deploy` on every push to `main`. `deploy` needs two repository secrets, already set: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Branch protection on `main` requires the `test` check.

A merged pull request is live within about a minute. Check the run: `gh run list --limit 3`.

## 4. The factory

The Harlan GitHub Agent app is installed on every `harlan-zw` repository. Hogwild's `~/.config/harlan-github-agent/config.yml` carries this block, and `~/sites/melbjs-clone` is its checkout:

```yaml
  - github: harlan-zw/melbjs-clone
    checkout: /home/harlan/sites/melbjs-clone
    enabled: true
    ownership: owned
    default_branch: main
    writable_pr_authors: [harlan-zw, "harlan-github-agent[bot]"]
    writable_pr_head_prefixes: [fix/, feat/, chore/, docs/, refactor/, perf/, test/, ci/]
    issue_work: true
    max_open_pull_requests: 4
    pr_review: true
    pr_conformance: true
    conflict_resolution: true
    auto_merge:
      pull_requests: every
      minimum_confidence: 80
    take_ownership:
      enabled: false
```

`auto_merge.pull_requests: every` makes the service merge every trusted pull request here after a `READY` review at or above 80, no label needed. It needs a harlan-agent-kit build that knows the repository `auto_merge` block; an older build ignores the block and waits for the label.

After a config change, request a restart from the board (`scripts/hogwild-service.sh` in harlan-agent-kit does this) and confirm the repository appears on https://hogwild.tailcad325.ts.net/.

## 5. Before the talk

- Open one test issue, watch it get a triage label, and let the factory take it to a merged pull request. Wait a minute, reload https://melbjs.harlanzw.com/.
- The deck's QR points at https://melbjs.harlanzw.com/ (nuxt.config default). Override with `NUXT_PUBLIC_FEEDBACK_URL` if the hostname changes.

## Results

Keep benchmark records outside this repository. At the end of the talk, open the [merged pull requests](https://github.com/harlan-zw/melbjs-clone/pulls?q=is%3Apr+is%3Amerged).

A merged pull request does not confirm deployment. Check its target branch and deployment before counting a completed change.
