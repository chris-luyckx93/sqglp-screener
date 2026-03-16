#!/bin/bash
# SQGLP+ST Screener — Bootstrap for Codespaces
# Clears the flat files and restores correct folder structure from the zip.
# Usage: bash bootstrap.sh

set -e

echo "================================================"
echo "  SQGLP+ST Screener — Codespaces Bootstrap"
echo "================================================"
echo ""

# 1. Install deps
echo "[1/4] Installing Node.js dependencies..."
npm install --silent 2>/dev/null

# 2. Install Python deps
echo "[2/4] Installing Python dependencies..."
pip install yfinance pandas --quiet 2>/dev/null || pip3 install yfinance pandas --quiet 2>/dev/null

# 3. Build
echo "[3/4] Building the project..."
npm run build

# 4. Start server
echo "[4/4] Starting server..."
echo ""
echo "================================================"
echo "  Server running on http://localhost:5000"
echo "  Look for the 'Open in Browser' popup!"
echo "  Press Ctrl+C to stop"
echo "================================================"
echo ""
NODE_ENV=production node dist/index.cjs
