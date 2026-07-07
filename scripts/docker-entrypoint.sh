#!/usr/bin/env sh
set -eu

mkdir -p /app/data /app/uploads

npm run db:init
npm start
