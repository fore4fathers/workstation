#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
docker compose up -d
for i in $(seq 1 30); do
  docker compose exec -T db pg_isready -U aw -d ai_workstation && break
  sleep 1
done
node server/src/sql/seed.js
npm run build -w web
node server/src/index.js
