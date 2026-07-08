#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Setting up Roster Calculator..."

if command -v apt-get >/dev/null 2>&1; then
  echo "Installing Raspberry Pi/Linux system packages..."
  sudo apt-get update
  sudo apt-get install -y sqlite3 build-essential python3 make g++
else
  echo "apt-get not found. Skipping system package install."
  echo "Make sure sqlite3, Python 3, make, and a C++ compiler are installed."
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed."
  echo "Install Node.js 20 LTS or newer, then run this script again."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not installed."
  echo "Install npm, then run this script again."
  exit 1
fi

mkdir -p data uploads

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

echo "Installing Node dependencies..."
npm install

echo "Initializing SQLite database..."
npm run db:init

echo ""
echo "Setup complete."
echo "Start the app with:"
echo "  npm run dev"
echo ""
echo "Then open:"
echo "  http://localhost:8082"
