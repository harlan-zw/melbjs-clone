# Runbook: serve the clone from Hogwild

Everything here runs on Hogwild as `harlan`. Steps marked `sudo` change system config; nothing touches `harlan-github-agent.service` except the last section.

## 1. Checkout Caddy can read

`~/sites` is mode 700, and Caddy runs as user `caddy`. Use `/srv`.

```sh
sudo mkdir -p /srv/melbjs-clone
sudo chown harlan:caddy /srv/melbjs-clone
git clone git@github.com:harlan-zw/melbjs-clone.git /srv/melbjs-clone
chmod -R g+rX /srv/melbjs-clone
```

If the clone fails, the `harlan` account on Hogwild has no read access to the private repo. Add its SSH key as a read-only deploy key on the repo, then retry.

## 2. Keep it current

Merged PRs reach the site within a minute.

```sh
mkdir -p ~/.config/systemd/user
cp /srv/melbjs-clone/infra/melbjs-clone-pull.service ~/.config/systemd/user/
cp /srv/melbjs-clone/infra/melbjs-clone-pull.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now melbjs-clone-pull.timer
systemctl --user list-timers melbjs-clone-pull.timer
```

## 3. Public hostname

DNS: in the Cloudflare zone for `harlanzw.com`, add a proxied CNAME `melbjs` pointing at the tunnel, `01ae8636-4e43-4a6e-b658-856c1e3cce15.cfargotunnel.com`. `hogwild.harlanzw.com` already resolves the same way.

Caddy route:

```sh
sudo cp /srv/melbjs-clone/infra/20-melbjs-clone.caddy /etc/caddy/routes/
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Check:

```sh
curl -sI -H 'Host: melbjs.harlanzw.com' http://127.0.0.1:8080/ | head -3
curl -sI https://melbjs.harlanzw.com/ | head -3
```

If the first check answers 200 and the second does not, the DNS record or the tunnel ingress is the problem, not Caddy.

## 4. Let the factory work on it

1. Install the Harlan GitHub Agent app (app id 4579275) on `harlan-zw/melbjs-clone`.
2. Add this block under `repositories:` in `~/.config/harlan-github-agent/config.yml`:

```yaml
  - github: harlan-zw/melbjs-clone
    checkout: /home/harlan/sites/melbjs-clone
    enabled: true
    ownership: owned
    default_branch: main
    writable_pr_authors: [harlan-zw, "harlan-github-agent[bot]"]
    writable_pr_head_prefixes: [fix/, feat/, chore/, docs/, refactor/, perf/, test/]
    issue_work: true
    max_open_pull_requests: 4
    pr_review: true
    pr_conformance: true
    conflict_resolution: true
    take_ownership:
      enabled: false
```

3. The factory needs its own checkout under `~/sites`, separate from `/srv`:

```sh
git clone git@github.com:harlan-zw/melbjs-clone.git ~/sites/melbjs-clone
```

4. Restart the service and watch the board: `systemctl --user restart harlan-github-agent.service`, then open https://hogwild.tailcad325.ts.net/ and confirm the repository appears.

## 5. Before the talk

- Open one test issue, watch it get a triage label, and let the factory take it through to a PR. Merge it, wait a minute, reload https://melbjs.harlanzw.com/.
- Set `NUXT_PUBLIC_FEEDBACK_URL` for the deck to the audience submission URL so slide 5 shows the real QR.
