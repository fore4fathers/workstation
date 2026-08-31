#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
docker compose up -d
node server/src/sql/seed.js
node server/src/index.js