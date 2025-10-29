#!/bin/sh
set -eu

echo "[entrypoint] Running database migrations..."
npm run migrate:deploy

echo "[entrypoint] Starting application..."
npm run start
