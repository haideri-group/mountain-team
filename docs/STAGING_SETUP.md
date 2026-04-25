# Staging Environment Setup

One-time server bootstrap for the TeamFlow staging stack on the homelab.
After this guide, every push to the `stage` branch automatically redeploys
the staging site at **https://staging-haider-team.appz.cc**.

---

## Architecture

- **Web container:** `tmstage-web` on `127.0.0.1:3007`, Docker image pulled from `registry.appz.cc/teamflow:stage-latest` (self-hosted registry — see `/opt/registry/` on the homelab).
- **MySQL:** shared with the existing `mysql-server` container — staging uses its own `teamflow` database + dedicated user.
- **phpMyAdmin:** reuses the existing `https://phpmyadmin.appz.cc` — log in as `teamflow_user` to see only staging data.
- **nginx:** system-level nginx proxies `staging-haider-team.appz.cc` → `127.0.0.1:3007` and handles TLS via certbot.
- **CI/CD:** GitHub Actions builds + pushes the image on every push to `stage`, then SSHes in and runs `docker compose pull && docker compose up -d web` with `yarn db:migrate:apply` sandwiched between.

---

## 1. DNS

In Cloudflare (`appz.cc` zone):

| Type | Name | Value | Proxy |
|---|---|---|---|
| A | `staging-haider-team` | your dedicated homelab IP | 🟠 Proxied (recommended — free DDoS + caching) |

Orange cloud works fine alongside the existing `haider-team.appz.cc` setup.

---

## 2. Create the staging database

Log in to `https://phpmyadmin.appz.cc` as `root` (credentials in `/home/haider/mysql-phpmyadmin/.env`) and run:

```sql
-- Create the staging database
CREATE DATABASE IF NOT EXISTS teamflow
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Create a dedicated user scoped to that database only
CREATE USER 'teamflow_user'@'%' IDENTIFIED BY 'REPLACE_WITH_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON teamflow.* TO 'teamflow_user'@'%';
FLUSH PRIVILEGES;
```

Pick a strong password (32+ chars, generate via `openssl rand -base64 32`).
Save it — you'll paste it into `.env` in step 4.

---

## 3. nginx site config + TLS

Create `/etc/nginx/sites-available/staging-haider-team.appz.cc`:

```nginx
server {
    listen 80;
    server_name staging-haider-team.appz.cc;

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:3007;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

Enable + reload:

```bash
sudo ln -s /etc/nginx/sites-available/staging-haider-team.appz.cc \
           /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Issue + install the TLS cert (auto-adds the 443 server block + http→https redirect)
sudo certbot --nginx -d staging-haider-team.appz.cc
```

---

## 4. Create `/home/haider/teamflow-staging/`

```bash
mkdir -p /home/haider/teamflow-staging
cd /home/haider/teamflow-staging
```

Copy `docker-compose.staging.yml` from the repo to this directory (keep the same filename — CI also SCPs the file as `docker-compose.staging.yml`, so matching names prevents having two parallel compose files on the host):

```bash
curl -fsSL https://raw.githubusercontent.com/haideri-group/mountain-team/stage/docker-compose.staging.yml \
  -o docker-compose.staging.yml
```

Copy `.env.staging.example` from the repo to this directory as `.env`, fill in every value:

```bash
curl -fsSL https://raw.githubusercontent.com/haideri-group/mountain-team/stage/.env.staging.example \
  -o .env
nano .env
```

Critical values to fill:
- `DATABASE_URL` — `mysql://teamflow_user:<PASSWORD_FROM_STEP_2>@mysql-server:3306/teamflow`
- `AUTH_SECRET` — `openssl rand -base64 32`
- `AUTH_URL` — `https://staging-haider-team.appz.cc`
- `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` — create a staging OAuth client in Google Cloud Console with redirect `https://staging-haider-team.appz.cc/api/auth/callback/google`
- JIRA + GitHub + R2 vars — can copy from the Railway prod config to start

---

## 5. Self-hosted registry access (server side)

The staging image lives on the self-hosted registry at `registry.appz.cc`
(docker-compose stack in `/opt/registry/`, nginx site at
`/etc/nginx/sites-available/registry.appz.cc`, htpasswd auth).

The CI workflow logs the homelab into the registry on every deploy using
`vars.REGISTRY_USERNAME` + `secrets.REGISTRY_PASSWORD` from the `staging`
GitHub Environment, so no one-time local `docker login` is required for
the automated path.

For manual debugging (running `docker compose pull web` by hand), log in once:

```bash
docker login registry.appz.cc -u staging-push
# Paste the password you saved when provisioning the registry. The file
# /opt/registry/auth/htpasswd stores only bcrypt HASHES — the plaintext
# is not recoverable from there.
#
# If you've lost it, rotate: generate a new password and regenerate htpasswd
# (and update the REGISTRY_PASSWORD secret in the `staging` GitHub Environment
# so CI keeps working):
#
#   NEW_PW=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
#   docker run --rm httpd:2.4-alpine htpasswd -nbB staging-push "$NEW_PW" \
#     > /opt/registry/auth/htpasswd
#   echo "$NEW_PW" | gh secret set REGISTRY_PASSWORD \
#     --repo haideri-group/mountain-team --env staging
```

Docker caches the successful login in `~/.docker/config.json`; subsequent
`docker compose pull` calls work without re-auth.

---

## 6. First boot

All `docker compose` commands below use `-f docker-compose.staging.yml`
explicitly — same filename CI SCPs on every deploy, so manual ops and CI
operate on the single source of truth.

```bash
cd /home/haider/teamflow-staging

# Pull the latest stage image (CI will have pushed one after the first PR to stage)
docker compose -f docker-compose.staging.yml pull web

# ONE-TIME: if you seeded the staging DB from a prod dump, mark all existing
# migrations as already-applied. This prevents migrate-all from re-running
# historical migrations (which would at best be redundant, and at worst crash
# — migrate-ip-allowlist.ts pulls in code not present in the runtime image).
# Skip this on a truly empty DB; run `yarn db:migrate:apply` instead to create
# the schema from scratch.
docker compose -f docker-compose.staging.yml run --rm --no-deps web yarn db:migrate:baseline

# Apply any pending (new) migrations — no-op right after baseline
docker compose -f docker-compose.staging.yml run --rm --no-deps web yarn db:migrate:apply

# Start the web container
docker compose -f docker-compose.staging.yml up -d web

# Check logs
docker compose -f docker-compose.staging.yml logs -f web
```

If the app needs a prod-data snapshot to work against, restore one BEFORE
running `db:migrate:baseline`:

```bash
# Using scripts/dump-prod-to-sql.sh to take the dump (runs locally via Docker)
# then importing:
scripts/dump-prod-to-sql.sh teamflow-prod.sql
scp teamflow-prod.sql haider@<homelab>:/tmp/
ssh haider@<homelab> "docker exec -i mysql-server mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" teamflow < /tmp/teamflow-prod.sql"
```

Visit https://staging-haider-team.appz.cc — should be live.

---

## 7. GitHub Actions variables + secrets (for CI/CD)

Staging-specific values live in a **GitHub Environment** named `staging`, not at
the repository level. Two reasons:

1. The workflow jobs opt into `environment: staging`, which exposes the env's
   secrets/vars and **restricts deployments to the `stage` branch** at the
   platform level (set under *Deployment branches and tags* → Selected
   branches → `stage`) — a safety net beyond the `if: github.ref` guards in
   the YAML.
2. The environment name already scopes these values, so secret/variable names
   drop the `STAGING_` prefix (`STAGING_SSH_HOST` → `SSH_HOST`, etc.).

Create the environment at
`https://github.com/haideri-group/mountain-team/settings/environments`, then
add the items below under the `staging` environment's own Secrets/Variables
tabs. **Shared values** (`NEXT_PUBLIC_JIRA_BASE_URL`) stay at repo level under
`Settings → Secrets and variables → Actions` because they're identical across
environments.

**Variables — in `staging` environment** (plain, visible in the GitHub UI):

| Name | Value |
|---|---|
| `SSH_PORT` | `22` (or your custom SSH port) |
| `NEXT_PUBLIC_APP_URL` | `https://staging-haider-team.appz.cc` — staging app URL, baked at build time |
| `REGISTRY_HOST` | `registry.appz.cc` — self-hosted Docker registry (see `/opt/registry/` on the homelab) |
| `REGISTRY_USERNAME` | `staging-push` — htpasswd user on the registry, used for both push (CI) and pull (homelab) |

**Variables — at repo level** (shared across all environments):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_JIRA_BASE_URL` | `https://tilemountain.atlassian.net` — same JIRA site for every env, baked into the client bundle |

**Secrets — in `staging` environment** (encrypted, never shown in logs):

| Name | Value | Leak impact |
|---|---|---|
| `SSH_HOST` | your homelab IP | Known attack target for SSH bruteforce attempts |
| `SSH_USER` | `haider` | Username for SSH attempts |
| `SSH_KEY` | dedicated deploy SSH private key (see below) | Remote shell on your homelab |
| `REGISTRY_PASSWORD` | staging-push user's registry password (bcrypt-hashed in `/opt/registry/auth/htpasswd` on the homelab) | Someone can push/pull images against your registry |

**Create a dedicated deploy key on the server:**

```bash
# On the homelab, as haider:
ssh-keygen -t ed25519 -f ~/.ssh/teamflow-deploy -N "" -C "gha-deploy@teamflow"
cat ~/.ssh/teamflow-deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/teamflow-deploy   # ← paste this PRIVATE key into the SSH_KEY secret
```

**Optional — restrict the key to only run `docker compose` commands** by editing `~/.ssh/authorized_keys` and prepending `command="..."` to the key line. Skipped here for simplicity; add later if desired.

---

## 8. Testing the pipeline

```bash
# On your laptop
git checkout -b stage
git push -u origin stage
```

Watch the run at `https://github.com/haideri-group/mountain-team/actions`. First run takes ~6–8 minutes (cold Docker layer cache); subsequent runs ~2–3 minutes.

---

## Rollback procedure

If a deploy breaks staging:

```bash
ssh haider@<your-ip>
cd /home/haider/teamflow-staging

# List available images — the sha tags are your rollback targets
docker images registry.appz.cc/teamflow

# Point stage-latest at an older sha tag
docker tag registry.appz.cc/teamflow:stage-<older-sha> \
           registry.appz.cc/teamflow:stage-latest

docker compose -f docker-compose.staging.yml up -d web
```

If the migration broke things, the advisory lock + `_migrations` table make
re-running `yarn db:migrate:apply` safe — fix the migration script, commit,
push; CI redeploys automatically.

---

## Monitoring

- **Container logs:** `docker compose -f docker-compose.staging.yml logs -f web` (from `/home/haider/teamflow-staging/`).
- **Uptime Kuma:** add a monitor for `https://staging-haider-team.appz.cc/api/health` — alerts if staging goes down.
- **Deploy history:** GitHub Actions tab on the repo.
- **Migration history:** `SELECT * FROM _migrations ORDER BY appliedAt DESC;` in phpMyAdmin (staging DB).

---

## Tearing down

Full removal, in order:

```bash
cd /home/haider/teamflow-staging
docker compose -f docker-compose.staging.yml down
cd ..
rm -rf teamflow-staging

# phpMyAdmin (as root):
DROP DATABASE teamflow;
DROP USER 'teamflow_user'@'%';

# nginx
sudo rm /etc/nginx/sites-enabled/staging-haider-team.appz.cc
sudo rm /etc/nginx/sites-available/staging-haider-team.appz.cc
sudo certbot delete --cert-name staging-haider-team.appz.cc
sudo systemctl reload nginx

# Cloudflare: delete the A record for staging-haider-team
```
