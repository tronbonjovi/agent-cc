#!/bin/bash
# Deploy Agent CC: build, restart service, verify
set -e

cd "$(dirname "$0")/.."

echo "Building..."
npm run build --silent

echo "Restarting service..."
sudo systemctl restart agent-cc

# Poll health endpoint — server should respond within seconds now that scan is backgrounded
echo "Waiting for server..."
for i in $(seq 1 15); do
  if curl -sf http://127.0.0.1:5100/health > /dev/null 2>&1; then
    echo "✓ Agent CC is running"
    exit 0
  fi
  sleep 1
done

# Fallback: check systemd status
if systemctl is-active --quiet agent-cc; then
  echo "✓ Agent CC is running (service active, health endpoint not yet ready)"
else
  echo "✗ Failed to start — check: journalctl -u agent-cc -n 20"
  exit 1
fi
