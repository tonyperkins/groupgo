# GitHub Actions + Azure Container Registry Setup

> **Note**: This guide is for future reference. The current Azure deployment is being done manually for demo purposes and will not use this automated workflow.

This guide covers setting up automated builds and deployments to Azure using GitHub Actions and Azure Container Registry (ACR).

## Prerequisites

- Azure subscription
- GitHub repository with admin access
- Azure CLI installed locally

## 1. Create Azure Container Registry

### Using Azure Portal

1. Navigate to **Azure Portal → Create a resource → Containers → Container Registry**
2. Configure:
   - **Registry name**: `groupgoacr` (must be globally unique, lowercase alphanumeric only)
   - **Resource group**: Use existing or create new
   - **Location**: Same as your app service
   - **SKU**: **Basic** for testing, **Standard** for production
3. Click **Review + create** → **Create**

### Using Azure CLI

```bash
az acr create \
  --resource-group <your-rg> \
  --name groupgoacr \
  --sku Basic \
  --location eastus
```

## 2. Enable Admin Access on ACR

GitHub Actions needs credentials to push images.

### Azure Portal

1. Go to **Container Registry → Settings → Access keys**
2. Enable **Admin user**
3. Copy the **Username** and **password** (you'll need these for GitHub secrets)

### Azure CLI

```bash
az acr update --name groupgoacr --admin-enabled true
az acr credential show --name groupgoacr
```

Save the output — you'll need `username` and one of the `passwords`.

## 3. Create Azure Service Principal for Deployments

GitHub Actions needs permission to deploy to Azure Web Apps.

```bash
az ad sp create-for-rbac \
  --name "groupgo-github-actions" \
  --role contributor \
  --scopes /subscriptions/<subscription-id>/resourceGroups/<your-rg> \
  --sdk-auth
```

**Important**: Copy the entire JSON output — you'll paste it into GitHub secrets as-is.

Example output:
```json
{
  "clientId": "...",
  "clientSecret": "...",
  "subscriptionId": "...",
  "tenantId": "...",
  "activeDirectoryEndpointUrl": "...",
  "resourceManagerEndpointUrl": "...",
  "activeDirectoryGraphResourceId": "...",
  "sqlManagementEndpointUrl": "...",
  "galleryEndpointUrl": "...",
  "managementEndpointUrl": "..."
}
```

## 4. Configure GitHub Secrets

Go to **GitHub → Your repo → Settings → Secrets and variables → Actions → New repository secret**

Add the following secrets:

| Secret Name | Value | Example |
|-------------|-------|---------|
| `ACR_NAME` | Your ACR registry name (without `.azurecr.io`) | `groupgoacr` |
| `ACR_USERNAME` | ACR admin username from step 2 | `groupgoacr` |
| `ACR_PASSWORD` | ACR admin password from step 2 | `abc123...` |
| `AZURE_CREDENTIALS` | Full JSON output from step 3 | `{"clientId":"...","clientSecret":"...",...}` |
| `AZURE_WEBAPP_NAME` | Production app service name | `groupgo-prod` |
| `AZURE_WEBAPP_NAME_TEST` | Test environment app service name | `groupgo-test` |

## 5. Create Azure Web Apps

You need two app services: one for production (`master` branch) and one for testing (`postgres-migration` branch).

### Production App Service

```bash
az webapp create \
  --resource-group <your-rg> \
  --plan <your-app-service-plan> \
  --name groupgo-prod \
  --deployment-container-image-name groupgoacr.azurecr.io/groupgo:latest
```

### Test App Service

```bash
az webapp create \
  --resource-group <your-rg> \
  --plan <your-app-service-plan> \
  --name groupgo-test \
  --deployment-container-image-name groupgoacr.azurecr.io/groupgo:latest
```

### Configure App Service to Pull from ACR

Enable managed identity and grant ACR pull access:

```bash
# Enable managed identity
az webapp identity assign --resource-group <your-rg> --name groupgo-prod
az webapp identity assign --resource-group <your-rg> --name groupgo-test

# Grant ACR pull permission
az role assignment create \
  --assignee <managed-identity-principal-id> \
  --scope /subscriptions/<subscription-id>/resourceGroups/<your-rg>/providers/Microsoft.ContainerRegistry/registries/groupgoacr \
  --role AcrPull
```

Or use ACR admin credentials:

```bash
az webapp config container set \
  --name groupgo-prod \
  --resource-group <your-rg> \
  --docker-custom-image-name groupgoacr.azurecr.io/groupgo:latest \
  --docker-registry-server-url https://groupgoacr.azurecr.io \
  --docker-registry-server-user <acr-username> \
  --docker-registry-server-password <acr-password>
```

## 6. Set Environment Variables in App Services

Both app services need the same environment variables as your local `.env.production`, but with different `DATABASE_URL` values.

### Production Environment

```bash
az webapp config appsettings set \
  --resource-group <your-rg> \
  --name groupgo-prod \
  --settings \
    APP_ENV=production \
    SECRET_KEY="<your-secret-key>" \
    APP_BASE_URL="https://groupgo-prod.azurewebsites.net" \
    DATABASE_URL="postgresql://groupgo_admin:<password>@groupgo-db.postgres.database.azure.com:5432/groupgo?sslmode=require" \
    ADMIN_EMAIL="<your-email>" \
    ADMIN_NAME="<your-name>" \
    TMDB_API_KEY="<your-key>" \
    SERPAPI_KEY="<your-key>" \
    GOOGLE_KG_API_KEY="<your-key>" \
    SMTP_HOST="smtp.gmail.com" \
    SMTP_PORT="587" \
    SMTP_USER="<your-gmail>" \
    SMTP_PASSWORD="<your-app-password>" \
    SMTP_FROM="<your-gmail>"
```

### Test Environment

Same as above, but with different `APP_BASE_URL` and potentially a separate test database:

```bash
az webapp config appsettings set \
  --resource-group <your-rg> \
  --name groupgo-test \
  --settings \
    APP_ENV=production \
    APP_BASE_URL="https://groupgo-test.azurewebsites.net" \
    DATABASE_URL="postgresql://groupgo_admin:<password>@groupgo-db-test.postgres.database.azure.com:5432/groupgo_test?sslmode=require" \
    ...
```

## 7. Test the Workflow

Push a commit to the `postgres-migration` branch:

```bash
git add .
git commit -m "test: trigger ACR build"
git push origin postgres-migration
```

Monitor the workflow:
1. Go to **GitHub → Actions**
2. Click on the running workflow
3. Watch the build and push steps

If successful, you should see:
- Docker image built and pushed to ACR with tags `:latest` and `:${{ github.sha }}`
- Test app service updated with the new image
- App restarted automatically

## 8. Verify Deployment

Check the test environment:

```bash
curl https://groupgo-test.azurewebsites.net/healthz
```

Should return:
```json
{"status":"ok"}
```

Check app logs:
```bash
az webapp log tail --resource-group <your-rg> --name groupgo-test
```

## 9. Promote to Production

Once testing is complete, merge `postgres-migration` to `master`:

```bash
git checkout master
git merge postgres-migration
git push origin master
```

The workflow will automatically:
- Build and push a new image to ACR
- Deploy to the production app service (`groupgo-prod`)

## Workflow Behavior

- **Push to `postgres-migration`**: Builds image, pushes to ACR, deploys to test environment
- **Push to `master`**: Builds image, pushes to ACR, deploys to production environment
- **Manual trigger**: Can be triggered from GitHub Actions UI for any branch

## Troubleshooting

### Build Fails: "unauthorized: authentication required"
- Verify `ACR_USERNAME` and `ACR_PASSWORD` secrets are correct
- Check that admin access is enabled on ACR

### Deploy Fails: "The subscription is not registered to use namespace 'Microsoft.Web'"
- Register the Web Apps provider:
  ```bash
  az provider register --namespace Microsoft.Web
  ```

### App Service Shows "Application Error"
- Check app logs: `az webapp log tail --name <app-name> --resource-group <rg>`
- Verify all environment variables are set correctly
- Ensure the container image was pulled successfully

### Image Not Updating
- App Service caches images — force a restart:
  ```bash
  az webapp restart --name <app-name> --resource-group <rg>
  ```
- Enable continuous deployment webhook in ACR settings

## Cost Optimization

**ACR Pricing**:
- Basic: $5/month (10 GB storage)
- Standard: $20/month (100 GB storage, webhooks)
- Premium: $500/month (500 GB storage, geo-replication)

**App Service Pricing**:
- Free/Shared: Not suitable for containers
- Basic B1: ~$13/month (1 core, 1.75 GB RAM)
- Standard S1: ~$70/month (1 core, 1.75 GB RAM, auto-scale, slots)

**Recommendations**:
- Use **Basic ACR** for testing, **Standard** for production
- Use **Basic B1** app service for test environment
- Use **Standard S1** or higher for production (enables deployment slots for zero-downtime deploys)

## Next Steps

- Set up deployment slots for blue-green deployments
- Configure Application Insights for monitoring
- Set up alerts for failed deployments
- Enable auto-scaling based on CPU/memory metrics
