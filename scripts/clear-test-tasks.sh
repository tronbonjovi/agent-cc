#!/bin/bash
# Removes the test project created by load-test-tasks.sh

set -euo pipefail

PROJECT_DIR="${HOME}/dev/pipeline-test"

if [ -d "${PROJECT_DIR}" ]; then
  rm -rf "${PROJECT_DIR}"
  echo "Removed test project at ${PROJECT_DIR}"
else
  echo "No test project found at ${PROJECT_DIR}"
fi

echo "Done! Trigger a rescan or restart Agent CC to remove it from the project list."
