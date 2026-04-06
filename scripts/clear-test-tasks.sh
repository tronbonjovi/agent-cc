#!/bin/bash
# Removes the test project created by load-test-tasks.sh

set -euo pipefail

PROJECT_DIR="${HOME}/dev/test-projects/pipeline-test"
AGENT_CC_DATA="${AGENT_CC_DATA:-${HOME}/.agent-cc}"
DB_FILE="${AGENT_CC_DATA}/agent-cc.json"

if [ -d "${PROJECT_DIR}" ]; then
  rm -rf "${PROJECT_DIR}"
  echo "Removed test project at ${PROJECT_DIR}"
else
  echo "No test project found at ${PROJECT_DIR}"
fi

if [ -f "${DB_FILE}" ]; then
  node -e "
    const fs = require('fs');
    const db = JSON.parse(fs.readFileSync('${DB_FILE}', 'utf-8'));
    if (db.entities && db.entities['pipeline-test']) {
      delete db.entities['pipeline-test'];
      fs.writeFileSync('${DB_FILE}', JSON.stringify(db, null, 2));
      console.log('Removed project from Agent CC entity store');
    }
  "
fi

echo "Done!"
