# Azure PostgreSQL Setup Guide

This guide covers deploying GroupGo to Azure with PostgreSQL instead of SQLite.

## Prerequisites

- Azure account with an active subscription
- Azure CLI installed locally (optional, for command-line deployment)
- PostgreSQL server provisioned in Azure

## 1. Create Azure Database for PostgreSQL

### Option A: Azure Portal
1. Navigate to **Azure Portal → Create a resource → Databases → Azure Database for PostgreSQL**
2. Choose **Flexible Server** (recommended for production)
3. Configure:
   - **Server name**: `groupgo-db` (or your choice)
   - **Region**: Same as your app service
   - **PostgreSQL version**: 15 or 16
   - **Compute + storage**: Start with **Burstable, B1ms** (1 vCore, 2 GiB RAM) for testing
   - **Authentication**: PostgreSQL authentication (username + password)
   - **Admin username**: `groupgo_admin` (or your choice)
   - **Password**: Generate a strong password and save it securely

### Option B: Azure CLI
```bash
az postgres flexible-server create \
  --resource-group <your-rg> \
  --name groupgo-db \
  --location eastus \
  --admin-user groupgo_admin \
  --admin-password <strong-password> \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --version 15 \
  --storage-size 32
```

## 2. Configure Firewall Rules

Allow your app service to connect:

1. In the PostgreSQL server settings, go to **Networking**
2. Add firewall rule:
   - **Rule name**: `AllowAzureServices`
   - Check **"Allow public access from any Azure service within Azure to this server"**
3. For local testing, add your IP:
   - **Rule name**: `DevMachine`
   - **Start IP / End IP**: Your public IP

## 3. Create the Database

Connect to the server and create the `groupgo` database:

```bash
# Using psql (install via: apt install postgresql-client or brew install postgresql)
psql "host=groupgo-db.postgres.database.azure.com port=5432 user=groupgo_admin dbname=postgres sslmode=require" -c "CREATE DATABASE groupgo;"
```

Or use Azure Cloud Shell / Azure Data Studio.

## 4. Build the Connection String

Format:
```
postgresql://groupgo_admin:<password>@groupgo-db.postgres.database.azure.com:5432/groupgo?sslmode=require
```

Replace:
- `<password>` with your admin password
- `groupgo-db` with your server name
- `groupgo_admin` with your admin username

**Important**: Azure Postgres requires `?sslmode=require` at the end.

## 5. Deploy to Azure App Service

### Environment Variables

Set `DATABASE_URL` in your App Service configuration:

**Azure Portal**:
1. Go to **App Service → Configuration → Application settings**
2. Add new setting:
   - **Name**: `DATABASE_URL`
   - **Value**: `postgresql://groupgo_admin:<password>@groupgo-db.postgres.database.azure.com:5432/groupgo?sslmode=require`
3. Click **Save** and restart the app

**Azure CLI**:
```bash
az webapp config appsettings set \
  --resource-group <your-rg> \
  --name <your-app-name> \
  --settings DATABASE_URL="postgresql://groupgo_admin:<password>@groupgo-db.postgres.database.azure.com:5432/groupgo?sslmode=require"
```

### Deploy the App

**Option A: Docker Hub**
1. Build and push the image:
   ```bash
   docker build -t <your-dockerhub-username>/groupgo:latest .
   docker push <your-dockerhub-username>/groupgo:latest
   ```
2. Configure App Service to pull from Docker Hub

**Option B: Azure Container Registry**
1. Create ACR and push image:
   ```bash
   az acr create --resource-group <your-rg> --name <your-acr-name> --sku Basic
   az acr build --registry <your-acr-name> --image groupgo:latest .
   ```
2. Configure App Service to pull from ACR

**Option C: GitHub Actions (Recommended)**
Automated CI/CD pipeline that builds and deploys on every push.

See **[GitHub Actions + ACR Setup Guide](github-acr-setup.md)** for complete instructions on:
- Creating Azure Container Registry
- Configuring GitHub secrets
- Setting up automated builds and deployments
- Deploying to separate test and production environments

## 6. Initialize the Database

On first boot, the app will automatically:
- Run `SQLModel.metadata.create_all(engine)` to create all tables
- Seed the default group, admin user, and theaters
- Create many-to-many join tables (`user_groups`, `poll_groups`)

Check the app logs to confirm successful initialization:
```bash
az webapp log tail --resource-group <your-rg> --name <your-app-name>
```

Look for:
```
FIRST BOOT — admin user seeded
Email : <your-admin-email>
Login : https://<your-app>.azurewebsites.net/admin/login
```

## 7. Verify the Deployment

1. Navigate to `https://<your-app>.azurewebsites.net/healthz` — should return `{"status":"ok"}`
2. Go to `/admin/login` and request a magic link
3. Check your email and log in
4. Create a test poll and verify everything works

## Troubleshooting

### Connection Refused
- Check firewall rules in PostgreSQL server settings
- Verify `sslmode=require` is in the connection string
- Ensure the app service's outbound IP is allowed

### Schema Errors
- The app auto-creates tables on boot — if you see "relation does not exist" errors, the init failed
- Check app logs for detailed error messages
- Verify the `DATABASE_URL` is correct and the database exists

### Performance Issues
- Burstable tier is for testing only — upgrade to **General Purpose** for production
- Enable **Connection Pooling** in the PostgreSQL server settings
- Consider adding a Redis cache for session storage

## Cost Optimization

**Development/Testing**:
- Burstable B1ms: ~$12/month
- Stop the server when not in use (can be automated)

**Production**:
- General Purpose D2s_v3: ~$140/month
- Enable auto-scaling based on load
- Use Azure Reserved Instances for 1-3 year commitments (up to 60% savings)

## Migration from SQLite

If you have existing SQLite data to migrate:

1. Export SQLite data to SQL dump:
   ```bash
   sqlite3 data/groupgo.db .dump > groupgo_dump.sql
   ```
2. Convert SQLite syntax to Postgres (replace `AUTOINCREMENT` with `SERIAL`, etc.)
3. Import to Postgres:
   ```bash
   psql "postgresql://..." < groupgo_dump.sql
   ```

Alternatively, use a migration tool like `pgloader`:
```bash
pgloader data/groupgo.db postgresql://groupgo_admin:<password>@groupgo-db.postgres.database.azure.com:5432/groupgo
```

## Next Steps

- Set up automated backups in Azure PostgreSQL settings
- Configure monitoring and alerts
- Enable Application Insights for app telemetry
- Set up a staging environment for testing before production deploys
