---
owner: platform
status: draft
updated_at: 2026-04-30
---

# VM Deployment (Docker + MongoDB)

## Architecture

- `nginx` exposes port `80`
- `frontend` serves Next.js app on internal port `4000`
- `backend` serves NestJS API on internal port `4001`
- `mongo` stores database in Docker volume `mongo_data`

Public traffic path:
- `/` -> frontend
- `/api/*` -> backend

## 1. VM Prerequisites

Install Docker and Docker Compose plugin.

For Ubuntu/Debian (example):

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

## 2. Pull Project and Prepare Env

```bash
git clone <your-repo-url>
cd mouse-lottery
cp .env.example .env
```

Edit `.env` and set secure values at least for:
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `SUPER_ADMIN_PASSWORD`
- `CORS_ALLOWED_ORIGINS` — set to your production domain, e.g. `https://mouse-lottery.weedza.co`
- `MERCHANT_KE7STG_CALLBACK_URL` — if staging merchant is active
- `MERCHANT_KE7PROD_CALLBACK_URL` — if production merchant is active

Notes:

- This root `.env` is consumed by backend runtime configuration in Docker.
- Local frontend development uses `frontend/.env.local`, not the root `.env`.
- Docker frontend build already injects an empty `NEXT_PUBLIC_API_BASE_URL`, so that value does not need to exist in the root `.env`.

## 3. Start Services

```bash
cd deploy
docker compose -f docker-compose.vm.yml up -d --build
```

## 4. Verify

```bash
docker compose -f docker-compose.vm.yml ps
curl http://127.0.0.1/api/health
```

Expected health response:

```json
{"ok":true,"service":"mouse-lottery-backend"}
```

## 5. Common Operations

Rebuild and restart after pulling latest code:

```bash
git pull
cd deploy
docker compose -f docker-compose.vm.yml up -d --build
```

View logs:

```bash
docker compose -f docker-compose.vm.yml logs -f nginx
docker compose -f docker-compose.vm.yml logs -f frontend
docker compose -f docker-compose.vm.yml logs -f backend
docker compose -f docker-compose.vm.yml logs -f mongo
```

Stop services:

```bash
docker compose -f docker-compose.vm.yml down
```

## 6. Production Hardening Checklist

- Put domain + TLS in front (recommend Caddy or Nginx with Let's Encrypt).
- Restrict VM firewall to ports `22`, `80`, `443` only.
- Do not expose MongoDB port publicly.
- Rotate JWT secrets and super admin credentials.
- Add scheduled backups for `mongo_data` volume.
