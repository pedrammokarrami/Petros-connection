#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo "  AIGAMERIA Zero-Cost Personal Server Launcher"
echo "=================================================="

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp .env.example .env
  echo "[info] Created .env from .env.example (edit optional keys anytime)."
fi

if [ ! -d "node_modules" ]; then
  echo "[info] Installing dependencies..."
  npm install --no-audit --no-fund
fi

echo "[info] Building production PWA frontend..."
npm run build

echo "[info] Starting AIGAMERIA Personal Node on http://0.0.0.0:${PORT:-3000}"
NODE_ENV=production npx tsx server.ts
