# ST CI/CD - Phase 0 discovery

`scripts/discover.sh` is a read-only inspection of the DoneHai ST VPS. Its output decides how the candidate environment and the zero-downtime proxy switch will be built.

For the Playwright-gated candidate deploy workflow, scripts, and safety flags, see **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

## What it does and does not do

- It prints a report to stdout and writes no files on the VPS.
- It does not install, restart, reload, or edit anything (Docker, proxy, git checkout).
- It never reads private keys, `.env` contents, container environment variables, or database data.
- From proxy configs it prints only routing directives (`server_name`, `listen`, `proxy_pass`, `reverse_proxy`, ingress `hostname`/`service`, certificate *paths*).
- Git commands are read-only (`status` runs with `--no-optional-locks`; no fetch, checkout, or clean).
- All output goes through a redaction filter. Redaction is best effort, so read the report before sharing it.

## How to run

From Git Bash, WSL, macOS or Linux (nothing is copied to the VPS):

```bash
ssh <user>@<vps> 'tr -d "\r" | bash -s' < deployment/st-ci/scripts/discover.sh > st-discovery.txt
```

From PowerShell:

```powershell
Get-Content -Raw deployment\st-ci\scripts\discover.sh | ssh <user>@<vps> 'tr -d "\r" | bash -s' | Out-File -Encoding utf8 st-discovery.txt
```

`tr -d "\r"` strips Windows line endings in case the file was checked out with CRLF.

Run it as the user that normally operates Docker on the VPS. Running as root (`sudo bash -s`) shows more of the proxy config and listening process names, and is still read-only.

If the live checkout is not found automatically (from the `donehai-server` compose labels), pass its path:

```bash
ssh <user>@<vps> 'tr -d "\r" | LIVE_REPO_DIR=/path/to/DoneHai-Feature bash -s' < deployment/st-ci/scripts/discover.sh > st-discovery.txt
```

## What to share

Share `st-discovery.txt` after reviewing it. The most important sections are:

- `REVERSE PROXY` (proxy type, upstreams for app.st and api.st, certificate issuer)
- `DOCKER - CONTAINER DETAILS`, `NETWORKS`, `VOLUMES`
- `HOST` (free RAM and disk)
- `LIVE REPOSITORY` (branch, `git status --short`, protected untracked files)
