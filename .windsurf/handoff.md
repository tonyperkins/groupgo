# GroupGo Development Handoff

## Current State

**Active Branch**: `master`  
**Production Deployment**: Portainer (http://portainer.homelab.lan/)  
**Azure Deployment**: Container Apps (postgres-migration branch)

---

## Recent Work: postgres-migration Branch

### Overview
The `postgres-migration` branch contains Azure deployment infrastructure and PostgreSQL support. This branch is **NOT merged to master** but is deployed to Azure.

### Key Changes in postgres-migration Branch

#### 1. PostgreSQL Database Support
- **File**: `app/db.py` - Major refactor to support both SQLite and PostgreSQL
  - Detects database type from `DATABASE_URL`
  - Uses appropriate syntax: `AUTOINCREMENT` vs `SERIAL`, `INSERT OR IGNORE` vs `ON CONFLICT DO NOTHING`
  - Skips SQLite-specific `PRAGMA` statements for PostgreSQL
  - Resets PostgreSQL sequences after seeding data
- **Dependency**: Added `psycopg2-binary` to `requirements.txt`
- **Config**: `docker-compose.yml` now uses `DATABASE_URL` env var

#### 2. Azure Container Registry (ACR) Setup
- **Registry**: `groupgoazacrprod.azurecr.io`
- **Image**: `groupgoazacrprod.azurecr.io/groupgo:latest`
- **Resource Group**: `groupgo-azure-rg`
- **Location**: East US 2

**Built and pushed image on 2026-03-17**:
```bash
az acr login --name groupgoazacrprod
docker build -t groupgoazacrprod.azurecr.io/groupgo:latest .
docker push groupgoazacrprod.azurecr.io/groupgo:latest
```

#### 3. Azure Container Apps Deployment
- **App Name**: `groupgo-app`
- **Environment**: `groupgo-env-prod`
- **URL**: https://groupgo-app.victoriousground-7bb187bc.eastus2.azurecontainerapps.io/
- **Ingress**: External, port 80
- **Resources**: 0.5 CPU, 1Gi memory

**Environment Variables (stored as secrets)**:
- `DATABASE_URL` - PostgreSQL connection string
- `SECRET_KEY` - App secret key
- `SERPAPI_KEY` - SerpAPI key

**Port Configuration Note**: The container runs on port 80 (not 8000 as in Dockerfile). Ingress was updated to target port 80.

#### 4. GitHub Actions Workflow (Future Reference Only)
- **File**: `.github/workflows/azure-acr-deploy.yml`
- Configured to build and push to ACR on push to `postgres-migration` or `master`
- Auto-deploys to test/production environments
- **Status**: Marked as future reference, not currently used for deployment

#### 5. Documentation Added
- **`docs/azure-postgres-setup.md`** (202 lines) - Complete Azure deployment guide
- **`docs/github-acr-setup.md`** (297 lines) - GitHub Actions + ACR setup guide

#### 6. Auth Service Improvements
- **File**: `app/services/auth_service.py`
- Logs magic links to console when SMTP is not configured (useful for development)

#### 7. Database Schema Fixes
- Fixed `added_at` column in `user_groups` and `poll_groups` many-to-many tables
- Proper sequence reset after seeding for PostgreSQL

### Commits in postgres-migration (not in master)
```
aff517e - fix: reset PostgreSQL sequences after seeding and log magic links when SMTP unconfigured
624501e - fix: add added_at to user_groups/poll_groups INSERT in _ensure_many_to_many_tables
5509311 - docs: mark GitHub Actions workflow as future reference only
859a4f8 - feat: add GitHub Actions workflow for ACR deployment
644088b - feat: add PostgreSQL support for Azure deployment
```

### Files Changed (789 additions, 174 deletions)
- `.env` (new, gitignored)
- `.env.example` (+3 lines)
- `.github/workflows/azure-acr-deploy.yml` (new, 53 lines)
- `.gitignore` (+10 lines)
- `app/db.py` (major refactor, 261 changes)
- `app/routers/api.py` (+10 lines)
- `app/services/auth_service.py` (+26 lines)
- `docker-compose.yml` (+2 lines)
- `docs/azure-postgres-setup.md` (new, 202 lines)
- `docs/github-acr-setup.md` (new, 297 lines)
- `requirements.txt` (+1 line: psycopg2-binary)
- `templates/admin/movies.html` (37 changes)
- `templates/components/admin_event_section.html` (25 changes)

---

## Azure Resources Summary

### Container Registry
```bash
# Login to ACR
az acr login --name groupgoazacrprod

# Build and push
docker build -t groupgoazacrprod.azurecr.io/groupgo:latest .
docker push groupgoazacrprod.azurecr.io/groupgo:latest
```

### Container App
```bash
# View logs
az containerapp logs show --name groupgo-app --resource-group groupgo-azure-rg --follow

# Update ingress
az containerapp ingress update --name groupgo-app --resource-group groupgo-azure-rg --target-port 80

# View revisions
az containerapp revision list --name groupgo-app --resource-group groupgo-azure-rg --output table
```

### Log Analytics
```bash
# Query container logs
az monitor log-analytics query \
  --workspace 1711a042-619b-4b76-a580-3e8fcd20f53c \
  --analytics-query "ContainerAppConsoleLogs_CL | where ContainerAppName_s == 'groupgo-app' | order by TimeGenerated desc | take 50" \
  --output table
```

---

## Development Workflows

Use the following workflows to get up to speed:

### `/groupgo-sync`
Pulls latest code and reads this handoff doc to catch up on context. Use this when starting work in WSL.

### `/groupgo-session`
Full implementation session: pulls latest, reads handoff, implements pending tasks, updates doc, and pushes.

### `/local-dev`
Run GroupGo locally for development.

### `/release`
Release and deploy GroupGo to production (Portainer).

---

## Database Schema Management

**Current Approach**: Ad hoc schema changes (no migration tool)
- Works for additive column changes only
- See workflow: `/add-db-column`
- **Future**: If non-additive changes needed (renames, drops, type changes), migrate to Alembic

---

## Deployment Targets

### 1. Portainer (Production - master branch)
- **URL**: http://portainer.homelab.lan/
- **Script**: `scripts/deploy_portainer.py`
- **Config**: Reads `.env` for `PORTAINER_URL` and `PORTAINER_ACCESS_TOKEN`
- **Database**: SQLite (`data/groupgo.db`)

### 2. Azure Container Apps (Test - postgres-migration branch)
- **URL**: https://groupgo-app.victoriousground-7bb187bc.eastus2.azurecontainerapps.io/
- **Database**: PostgreSQL (Azure Database for PostgreSQL)
- **Image**: ACR (`groupgoazacrprod.azurecr.io/groupgo:latest`)

---

## Environment Configuration

### Required Environment Variables
```bash
# Application
APP_ENV=production
SECRET_KEY=<secret>
APP_BASE_URL=http://localhost:8000

# Database
DATABASE_URL=sqlite:///./data/groupgo.db  # or PostgreSQL connection string

# Admin
ADMIN_EMAIL=<email>
ADMIN_NAME=<name>

# External APIs
TMDB_API_KEY=<key>
SERPAPI_KEY=<key>

# Email (Gmail SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<email>
SMTP_PASSWORD=<app-password>
SMTP_FROM=<email>

# Portainer (for deployment)
PORTAINER_ACCESS_TOKEN=<token>
PORTAINER_URL=http://portainer.homelab.lan/

# Google Knowledge Graph
GOOGLE_KG_API_KEY=<key>
```

---

## Next Steps / Pending Tasks

### postgres-migration Branch
- [ ] Decide whether to merge postgres-migration to master or keep separate
- [ ] Test Azure deployment thoroughly
- [ ] Set up GitHub Actions secrets if automated deployment is desired
- [ ] Consider setting up staging environment

### General
- [ ] Review and potentially merge other feature branches:
  - `feat-voter-flow-redesign` - Secure voter entry with UUID invite links and PINs
  - `ui-rework-gemini`
  - `ui-rework-gpt54-ht`
  - `v2-generic-events`

---

## Notes for WSL Transition

1. **Clone repo in WSL**: `git clone https://github.com/tonyperkins/groupgo.git`
2. **Run sync workflow**: `/groupgo-sync` to get up to speed
3. **Azure CLI**: Already logged in on Windows, will need to `az login` in WSL
4. **Docker**: Ensure Docker Desktop is configured for WSL2 backend
5. **Environment files**: `.env.development` is gitignored, use `.env.example` as template

---

## References

- **Azure Postgres Setup**: `docs/azure-postgres-setup.md`
- **GitHub ACR Setup**: `docs/github-acr-setup.md`
- **Workflows**: `.windsurf/workflows/`
