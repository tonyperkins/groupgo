---
description: Release and deploy GroupGo to production
---

## Prerequisites
- SSH access to `portainer.homelab.lan` as `asperkins65`
- App is running at https://groupgo.org via Cloudflare Tunnel

## Steps

1. If you changed any files in `voter-spa/src/`, build the SPA first:
```powershell
cd voter-spa
npm run build
cd ..
```

2. Stage all changed files:
```powershell
git add -A
```

3. Commit with a descriptive message:
```powershell
git commit -m "feat: description of change"
```

4. Push to GitHub:
```powershell
git push origin master
```

5. Sync the production env file to the server (`.env.production` is gitignored — it must be copied manually on every deploy if it changed):
```powershell
scp .env.production asperkins65@portainer.homelab.lan:/opt/groupgo/.env
```

6. Deploy on the server (pull + rebuild Docker image):
```powershell
ssh asperkins65@portainer.homelab.lan "cd /opt/groupgo && git pull origin master && docker compose up -d --build"
```

7. Verify the app is running by checking https://groupgo.org/healthz — expect `{"status":"ok","db":"ok"}`.

## Notes
- The Docker build copies `app/`, `static/`, and `templates/` into the image. Python dependencies are cached unless `requirements.txt` changes.
- The SQLite database lives at `/opt/groupgo/data/groupgo.db` on the server and is volume-mounted — it persists across deploys.
- If you changed only templates or static files (not Python), the build is fast (~10s) because the pip layer is cached.
- `.env.production` is **not tracked by git** and lives only on your local machine and the server at `/opt/groupgo/.env`. Always run step 5 if env vars changed, or after any `git reset --hard` on the server.
