#!/bin/bash
set -e

REPO_URL="https://github.com/tonyperkins/groupgo.git"
DEPLOY_DIR="/opt/groupgo"

if [ -d "$DEPLOY_DIR/.git" ]; then
  echo "==> Pulling latest from master..."
  cd "$DEPLOY_DIR"
  git fetch origin
  git checkout master
  git pull origin master
else
  echo "==> Cloning repo..."
  mkdir -p "$DEPLOY_DIR"
  git clone --branch master "$REPO_URL" "$DEPLOY_DIR"
  cd "$DEPLOY_DIR"
fi

echo "==> Building and restarting container..."
docker compose down
docker compose build --no-cache
docker compose up -d

echo "==> Done. Container status:"
docker compose ps
