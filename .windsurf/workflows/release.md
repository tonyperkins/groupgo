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

5. Deploy on the server (pull + rebuild Docker image):
```powershell
ssh asperkins65@portainer.homelab.lan "cd /opt/groupgo && git pull origin master && docker compose up -d --build"
```

6. Verify the app is running by checking https://groupgo.org/healthz — expect `{"status":"ok","db":"ok"}`.

## Notes
- The Docker build copies `app/`, `static/`, and `templates/` into the image. Python dependencies are cached unless `requirements.txt` changes.
- The SQLite database lives at `/opt/groupgo/data/groupgo.db` on the server and is volume-mounted — it persists across deploys.
- If you changed only templates or static files (not Python), the build is fast (~10s) because the pip layer is cached.
