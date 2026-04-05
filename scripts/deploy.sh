#!/bin/bash
# Deploy Agent CC: build, kill old process, restart service
set -e

cd "$(dirname "$0")/.."

echo "Building..."
npm run build --silent

echo "Stopping old process..."
# Kill node process directly — avoids systemd SIGTERM timeout
PID=$(pgrep -f "node dist/index.cjs" 2>/dev/null || true)
if [ -n "$PID" ]; then
  sudo kill -9 $PID 2>/dev/null || true
  sleep 1
fi

# Reset failed state if needed
sudo systemctl reset-failed agent-cc 2>/dev/null || true

echo "Starting service..."
sudo systemctl start agent-cc

sleep 2

if systemctl is-active --quiet agent-cc; then
  echo "✓ Agent CC is running"
else
  echo "✗ Failed to start — check: journalctl -u agent-cc -n 20"
  exit 1
fi
