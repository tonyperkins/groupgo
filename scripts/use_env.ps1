# Usage: .\scripts\use_env.ps1 dev
#        .\scripts\use_env.ps1 prod
#
# Copies the appropriate env file to .env
# .env.production is NOT committed — keep it locally or on the server only.

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("dev","prod")]
    [string]$Target
)

$root = Split-Path -Parent $PSScriptRoot

if ($Target -eq "dev") {
    $src = Join-Path $root ".env.development"
    if (-not (Test-Path $src)) { Write-Error ".env.development not found"; exit 1 }
    Copy-Item $src (Join-Path $root ".env") -Force
    Write-Host "Switched to DEVELOPMENT (.env.development -> .env)" -ForegroundColor Cyan
} else {
    $src = Join-Path $root ".env.production"
    if (-not (Test-Path $src)) {
        Write-Warning ".env.production not found. Copy .env.production.example and fill in real values:"
        Write-Host "  cp .env.production.example .env.production" -ForegroundColor Yellow
        exit 1
    }
    Copy-Item $src (Join-Path $root ".env") -Force
    Write-Host "Switched to PRODUCTION (.env.production -> .env)" -ForegroundColor Green
}

Write-Host "Current APP_ENV: $((Get-Content (Join-Path $root '.env') | Select-String 'APP_ENV=').ToString().Split('=')[1])"
