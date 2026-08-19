# Oracle VM — Read-Only Verification Checklist (Pre-Cutover Investigation)

> **STATUS: INVESTIGATION ONLY.** Nothing in this document changes anything.
> Railway (known-working production) is **untouched**. No env vars, no CORS, no OAuth,
> no DNS, no firewall rules, no redeploys, no restarts, no migrations, no large-file
> transfers. Every command below is **read-only**.

## Safety rules (apply to every step)

1. **Read-only only.** If a command would create, modify, delete, restart, or write anything, it is forbidden here.
2. **Never print secrets.** Do not paste raw `GOOGLE_OAUTH_CLIENT_SECRET`, service-account keys, or MEGA passwords anywhere. Every env check below masks values to `SET` / `EMPTY` / `NOT PRESENT`.
3. **Never restart the backend or the VM.** The backend holds **all state in memory** (see §8) — a restart destroys it.
4. **Railway stays exactly as it is.** Do not touch `BACKEND_API_URL`, `VITE_API_URL`, the web proxy, Google Cloud Console, or anything on the Railway side.
5. **Stop at any command you are unsure about.** Record `UNKNOWN` rather than guessing.
6. All commands assume you are on the Oracle VM as the deploy user (or with `sudo` for inspection-only commands). If a command needs `sudo` and you don't have it, record `UNKNOWN` and move on.

---

## Ground truth from the source code (read before running anything)

These facts come from `apps/api` in this repo and tell us exactly what to look for:

- **Entry point / start command:** `node dist/main.js` (production, `npm start`); dev uses `tsx watch src/main.ts`.
- **Listen address:** `0.0.0.0` on `PORT` (default `4000`).
- **Health endpoint:** `GET /api/health` → HTTP 200 `{ "status": "ok", "uptimeSeconds": N }`.
- **Env vars actually read** (`src/config/env.ts`) — *none are required to boot* (all have defaults or are optional), but these are the ones that matter:
  | Variable | Default if unset | Required before cutover? |
  |---|---|---|
  | `NODE_ENV` | `development` | **Yes** — must be `production` (changes CORS behavior + logging) |
  | `PORT` | `4000` | Match whatever the process manager expects |
  | `CORS_ORIGIN` | `http://localhost:5173` | **Yes** — must include the frontend origin |
  | `GOOGLE_OAUTH_CLIENT_ID` | unset | Yes, with the other two OAuth vars (all-or-nothing) |
  | `GOOGLE_OAUTH_CLIENT_SECRET` | unset | Yes, with the other two OAuth vars (all-or-nothing) |
  | `GOOGLE_OAUTH_REDIRECT_URI` | unset | **Yes** — must be HTTPS for non-localhost |
  | `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` | unset | Only if the service-account path is used |
  | `GOOGLE_SERVICE_ACCOUNT_KEY` | unset | Only if the service-account path is used |
  | `GOOGLE_DRIVE_ROOT_FOLDER_ID` | unset (Drive root) | No |
- **OAuth endpoints** (`src/modules/connections/oauth.routes.ts`): start = `GET /api/connections/oauth/google/start`, callback = `GET /api/connections/oauth/google/callback`. The `GOOGLE_OAUTH_REDIRECT_URI` value must **exactly** equal the future `https://<api-domain>/api/connections/oauth/google/callback`.
- **State is in-memory only** (`credentials.store.ts`, `connections.repository.ts`): connections, stored credentials, and OAuth state maps live in `new Map()`s. **Any restart wipes all saved connections** — users must reconnect after every restart. This is true on Railway too; it is a property of the current code, not of the host.
- **Temp storage** (`src/modules/migrations/engine/temp-storage.ts`): migration files live under `<os.tmpdir()>/cloudbridge-migrations/<jobId>/` → on Linux, `/tmp/cloudbridge-migrations/…`. Files are per-job, deleted after upload.
- **Outbound endpoints the backend uses:** `googleapis.com` (Drive + OAuth), `mega.nz` / `g.api.mega.co.nz` (megajs), and npm registry (build-time only).

---

## 1. Current Oracle backend

Find the process, its manager, and its launch configuration. **All read-only.**

```bash
# What's running and how
ps aux | grep -E 'node|tsx' | grep -v grep

# Process manager detection (in order of likelihood)
which pm2 && pm2 list
systemctl list-units --type=service --state=running | grep -iE 'api|node|cloud|cloudbridge'
systemctl status <UNIT-NAME> --no-pager   # replace with what the listing shows
which pm2 systemctl

# Working directory + launch command + node binary of the live process
PID=<the backend pid from ps>
ls -l /proc/$PID/cwd
tr '\0' ' ' < /proc/$PID/cmdline; echo
ls -l /proc/$PID/exe

# Node/npm versions available on the box
node -v
npm -v

# Deployed code location + uptime
readlink -f /proc/$PID/cwd
ps -o etime=,lstart= -p $PID

# Is it managed/auto-restarted?
pm2 describe <APP> 2>/dev/null | grep -E 'script|exec_mode|restarts|uptime|status'   # if pm2
systemctl is-enabled <UNIT-NAME> 2>/dev/null                                          # if systemd
cat /proc/$PID/status | grep -E 'State|PPid'
```

Record: process name / PID / PPid, manager (pm2, systemd, bare `nohup`/screen/tmux, or other), working directory, code path, Node + npm versions, start command, port (see `ss` below), uptime, and whether it auto-restarts (pm2 `restart_delay`, `systemctl is-enabled`).

---

## 2. Environment configuration

Check presence of every variable the source reads — **without printing values**.

```bash
# If the process is systemd-managed (masks values)
systemctl show <UNIT-NAME> -p Environment 2>/dev/null | tr ' ' '\n' \
  | grep -E '^(NODE_ENV|PORT|CORS_ORIGIN|GOOGLE_|GOOGLE_OAUTH_|GOOGLE_SERVICE_|GOOGLE_DRIVE_)' \
  | awk -F= '{print $1 " = " (length($2)>0 ? "SET" : "EMPTY")}'

# If the process is pm2-managed (masks values)
pm2 env <APP> 2>/dev/null | grep -E '^(NODE_ENV|PORT|CORS_ORIGIN|GOOGLE_|GOOGLE_OAUTH_|GOOGLE_SERVICE_|GOOGLE_DRIVE_)' \
  | awk -F= '{print $1 " = " (length($2)>0 ? "SET" : "EMPTY")}'

# If the process is bare node (masks values; needs same user or root to read /proc/<pid>/environ)
for pid in $(pgrep -f 'dist/main.js|src/main.ts'); do
  echo "PID $pid:"; tr '\0' '\n' < /proc/$pid/environ \
    | grep -E '^(NODE_ENV|PORT|CORS_ORIGIN|GOOGLE_|GOOGLE_OAUTH_|GOOGLE_SERVICE_|GOOGLE_DRIVE_)' \
    | awk -F= '{print "  " $1 " = " (length($2)>0 ? "SET" : "EMPTY")}'
done

# If the deployment uses a .env file: check presence only, never cat it
test -f <WORKING_DIR>/.env && echo ".env present" || echo ".env NOT present"
```

> Do **not** run `cat .env`, `pm2 env` unmasked, or `systemctl show -p Environment` unmasked, and do **not** paste any values back. Report only `SET` / `EMPTY` / `NOT PRESENT` / `UNKNOWN`.

Record one line per variable from the table at the top of this document.

---

## 3. Code version — is Oracle running the same code as Railway?

Prove equality if possible; if you can't, **say so explicitly**.

```bash
cd <WORKING_DIR>

# Is it a git checkout at all?
git rev-parse --is-inside-work-tree 2>&1
git -C <WORKING_DIR> log -1 --format='commit %H%n  %ci%n  %s'
git -C <WORKING_DIR> status --porcelain

# Package identity + lockfile fingerprint (compare against the repo's apps/api/package-lock.json)
node -e "console.log(require('./package.json').version || 'no version field')"
sha256sum package.json package-lock.json

# Source-tree fingerprint (compare against a fresh clone of the repo at the same commit)
find src -type f \( -name '*.ts' -o -name '*.json' \) -print0 | sort -z | xargs -0 sha256sum | sha256sum
```

How to compare against Railway safely (no SSH into Railway needed):
- Ask whoever deployed Railway for its git commit / build SHA, **or**
- `sha256sum` the **source tree** (`src/**`) and `package-lock.json` here, and compare with the same command run on a clean checkout of the repo at the commit Railway claims to run.
- `dist/` artifacts are **not** proof: build output varies with timestamps/versions. Hash the source, not the build.

**If the Oracle deployment is not a git checkout, or the source hashes differ, or you cannot obtain Railway's commit: record "EXACT EQUALITY NOT PROVEN"** — that is an acceptable, correct answer. Do not modify anything to "fix" a mismatch.

---

## 4. CORS

Determine the **current** value. Do not change it.

```bash
# From §2's masked env output, read CORS_ORIGIN as SET/EMPTY.
# If EMPTY/NOT PRESENT, the code default applies: CORS_ORIGIN = http://localhost:5173
# Confirm the runtime value from outside (this only works for non-localhost origins):
curl -sS -i -X OPTIONS http://130.210.50.67:4000/api/providers \
  -H "Origin: https://cloudbridge-production.up.railway.app" \
  -H "Access-Control-Request-Method: GET" --max-time 10 | head -20
```

Report:

- **CURRENT CORS_ORIGIN:** (from §2; if unset → code default `http://localhost:5173`)
- **SAFE TO CHANGE LATER?** **YES.** CORS is a runtime env var only — changing it later is a config edit + restart, touches nothing on Railway, and requires no code change.
- **WHAT EXACT VALUE WILL EVENTUALLY BE REQUIRED:** `https://cloudbridge-production.up.railway.app` (the frontend origin, no trailing slash). Multiple origins are comma-separated. Note the code also always allows requests with **no** `Origin` header (curl/server-to-server), so CORS only gates browser cross-origin calls — it is **not** a security boundary for non-browser clients.

---

## 5. HTTPS / reverse proxy

Find out what exists. Do not configure anything.

```bash
which nginx caddy apache2 httpd 2>/dev/null
systemctl status nginx caddy apache2 httpd 2>/dev/null | head -30   # whichever exist
ss -tlnp | grep -E ':(80|443)\b'
ls /etc/letsencrypt/live/ 2>/dev/null
ls /etc/ssl/certs/ 2>/dev/null | head
```

Record: reverse proxy present (which one) / absent; anything listening on `:80` / `:443`; any TLS certificates (issuer/domains from cert files — do **not** print private keys); any HTTP→HTTPS redirect config (check proxy configs under `/etc/nginx/`, `/etc/caddy/` — read-only).

The eventual (not now) shape: Browser → HTTPS `:443` → reverse proxy → `localhost:4000`. Note that **Google OAuth requires the redirect URI to be HTTPS on any non-localhost host** (enforced in `google-drive.oauth-config.ts`), so a TLS reverse proxy is a hard prerequisite for OAuth on Oracle — regardless of whether the direct `:4000` path "works".

---

## 6. Domain / DNS

Find out if anything already points at this VM. Do not modify DNS.

```bash
# Only if you know of a candidate hostname — do NOT invent one
host <candidate-hostname> 2>/dev/null || dig +short <candidate-hostname> 2>/dev/null
# Reverse lookup of the public IP (may be unset; that's a valid answer)
dig +short -x 130.210.50.67 2>/dev/null
# Reverse proxy configs may already reference a server_name — read-only peek
grep -rE 'server_name|proxy_pass' /etc/nginx/ /etc/caddy/ 2>/dev/null
```

Record: whether any domain/subdomain exists. If none: the eventual requirement is an **A record** (or the equivalent) pointing a new API subdomain (e.g. `api.<something>`) at `130.210.50.67`, plus the HTTPS hostname in §5 and `GOOGLE_OAUTH_REDIRECT_URI` pointing at `https://<that-hostname>/api/connections/oauth/google/callback`. **Do not invent or register a hostname now** — just record "none exists; one will be required."

---

## 7. Google OAuth

Check the Oracle-side status only. Do not change Google Cloud Console.

```bash
# From §2: GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REDIRECT_URI -> SET/EMPTY
# Without printing the URI value, sanity-check its shape WITHOUT leaking it:
tr '\0' '\n' < /proc/$PID/environ 2>/dev/null | grep '^GOOGLE_OAUTH_REDIRECT_URI=' \
  | sed -E 's#^(GOOGLE_OAUTH_REDIRECT_URI=)(https?)://([^/]+)(/.*)$#\1 \2://\3 <path-present>#' \
  | sed -E 's#([a-z0-9.-]+)#<host:#'  # trims the host so the value never leaves the box in full
# Simpler alternative if the above is awkward: just record SET and note scheme/host from memory,
# or mark UNKNOWN — never print the URI in full.
```

Report:
- **Oracle status:** each of the three OAuth vars = `SET` / `EMPTY` / `UNKNOWN` (and whether the URI is `http` vs `https` if you can tell without printing it).
- **What must change later (do NOT do it now):**
  1. Oracle env: set all three vars, with `GOOGLE_OAUTH_REDIRECT_URI = https://<api-domain>/api/connections/oauth/google/callback` (exact match required).
  2. Google Cloud Console: add that same URI to the existing OAuth client's Authorized redirect URIs (or register a new client).
  3. Frontend/API wiring: the web app must talk to the Oracle origin instead of Railway (`BACKEND_API_URL` on the web proxy — currently a Railway URL — and `CORS_ORIGIN` on Oracle). **None of this happens today.**

---

## 8. Filesystem / migration-engine prerequisites

Inspect only. Do not run a migration; do not create large files; do not create temp dirs.

```bash
# Where temp files land and whether it's RAM-backed or disk-backed
echo "TMPDIR=${TMPDIR:-<unset -> os.tmpdir()=/tmp>}"
findmnt /tmp
df -h /tmp /

# Can the service user write to /tmp without creating anything?
sudo -u <SERVICE-USER> test -w /tmp && echo "service user CAN write /tmp" || echo "cannot verify (no sudo or user unknown)"

# Any leftover job dirs from previous runs? (ls only — no cleanup)
ls -la /tmp/cloudbridge-migrations 2>/dev/null || echo "no cloudbridge-migrations dir (clean)"

# What a restart would destroy — see the in-memory facts above:
#  - connections + stored credentials: IN MEMORY -> wiped on any restart
#  - in-flight migration jobs: lost on restart (temp files orphaned under /tmp/cloudbridge-migrations)
#  - /tmp contents: wiped on VM reboot (and possibly by systemd-tmpfiles on some images)
```

Record: temp location, `tmpfs` vs disk, free space, service-user write access, leftover job dirs, and the restart/reboot behavior implied above.

---

## 9. Resource capacity

Read-only reporting. No changes, no claims about max migration sizes.

```bash
nproc
free -h
df -h /
lscpu | grep -E '^Model name|^CPU\(s\)|^Thread|^Core|^Socket'
lsblk -d -o NAME,SIZE,ROTA,MODEL   # ROTA 0 = SSD, 1 = spinning disk
ip -brief addr
```

Record: cores, RAM, free disk, disk type (SSD/HDD, and whether `/tmp` is RAM-backed), network interfaces. **Do not** claim a maximum safe migration size from these numbers — the only honest statement is the raw capacity.

---

## 10. Network — outbound HTTPS connectivity

Lightweight checks only. No auth, no logins, no large transfers.

```bash
for host in https://www.googleapis.com https://g.api.mega.co.nz https://mega.nz https://registry.npmjs.org; do
  printf '%s -> ' "$host"
  curl -sS -o /dev/null -w '%{http_code} (%{time_total}s)\n' --max-time 10 "$host" || echo "FAILED"
done
```

Record each host as reachable/unreachable. `www.googleapis.com` covers Drive API + OAuth token endpoint; `g.api.mega.co.nz`/`mega.nz` cover megajs; `registry.npmjs.org` matters only if you will ever build on the VM. These are GET requests to public endpoints — they create no state and transfer no data.

---

## 11. Health test

Verify the live endpoint. Nothing here modifies state.

```bash
curl -sS -i http://130.210.50.67:4000/api/health --max-time 10
curl -sS -o /dev/null -w 'providers: %{http_code}\n' http://130.210.50.67:4000/api/providers --max-time 10
curl -sS -i -X OPTIONS http://130.210.50.67:4000/api/providers \
  -H "Origin: https://cloudbridge-production.up.railway.app" \
  -H "Access-Control-Request-Method: GET" --max-time 10 | head -15
```

Expected: `/api/health` → `200` + `{"status":"ok","uptimeSeconds":N}`; `/api/providers` → `200` (public provider list, read-only); OPTIONS preflight → `204`/`200` with an `Access-Control-Allow-Origin` header echoing the origin **only if** that origin is in `CORS_ORIGIN` — a missing header here is expected until CORS is configured, and is not a failure of the checklist.

Do **not** hit `/api/connections/oauth/google/start` — it creates pending state server-side.

---

## 12. Security — is port 4000 public?

Report only. Do not close it, do not touch firewall rules.

```bash
ss -tlnp | grep -E ':4000\b'
sudo iptables -L -n --line-numbers 2>/dev/null | head -40     # read-only listing
sudo firewall-cmd --list-all 2>/dev/null                       # read-only listing
sudo ufw status 2>/dev/null                                    # read-only listing
```

Record: what listens on `:4000` (bound to `0.0.0.0` per the code), and whether firewall rules allow public access. **Evidence already in hand:** the health endpoint responds from the public IP over plain HTTP — that **proves** `:4000` is directly reachable from the internet today (no TLS, no auth in front). Eventually (not now): Internet → HTTPS `:443` → reverse proxy → `localhost:4000`, and `:4000` ideally not publicly reachable.

---

# Cutover Readiness Assessment

Fill this in after executing §1–§12. Do not mark anything GREEN without evidence.

| Requirement | Current Oracle Status | Evidence | Required Before Cutover? |
|---|---|---|---|
| Backend running | | | Yes |
| Correct code version | | | Yes (else "NOT PROVEN") |
| Required env vars (`NODE_ENV=production`, `CORS_ORIGIN`, OAuth trio) | | | Yes |
| CORS (`https://cloudbridge-production.up.railway.app`) | | | Yes |
| HTTPS + reverse proxy + TLS cert | | | Yes (hard prerequisite for OAuth) |
| API domain / DNS | | | Yes |
| Google OAuth (redirect URI registered + HTTPS) | | | Yes |
| Filesystem / temp storage (`/tmp` writable, disk-backed) | | | Yes |
| Disk capacity | | | Yes (adequate free space on temp volume) |
| Network access (googleapis, mega.nz) | | | Yes |
| Process manager (auto-restart; **restart wipes in-memory connections**) | | | Yes — and understand the wipe |
| Health endpoint (`/api/health` 200) | | | Yes |

## Status framework

- **GREEN** — Already safe. Verified by evidence; nothing to do.
- **YELLOW** — Needs configuration/change later, but does **not** block today's Railway production. Examples expected here: CORS not yet including the Railway origin, no HTTPS yet, no API domain yet, env vars not set on Oracle. These are all fine to remain as-is while Railway serves traffic.
- **RED** — Must be fixed before any production traffic can move. Examples: backend not running, wrong/unknown code version, missing env vars, `/tmp` not writable or RAM-backed with insufficient space, outbound connectivity to Google/MEGA blocked, no TLS (blocks OAuth), no process manager (nothing restarts the API).

## Final recommendation (do not deviate)

**Do not switch any production traffic to Oracle yet.** Railway remains the known-working production system and must stay untouched until **all** of the following are true:

1. Oracle is configured (env, CORS, process manager).
2. Oracle is independently tested (health, providers, connectivity).
3. The frontend can communicate with Oracle (CORS + API wiring verified end-to-end).
4. OAuth works **through** Oracle (HTTPS domain + registered redirect URI + real sign-in).
5. A real migration is tested safely on Oracle (small file first).
6. Production cutover is planned (exact switch steps + timing).
7. Rollback is confirmed (Railway still healthy and switch-back is a config flip).

Until every critical row in the table above is GREEN with evidence, the answer is: **investigate, don't switch.**
