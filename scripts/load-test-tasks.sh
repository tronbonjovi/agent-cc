#!/bin/bash
# Creates a dummy project with a milestone and tasks for testing the pipeline board.
# Idempotent — safe to run multiple times.

set -euo pipefail

PROJECT_DIR="${HOME}/dev/test-projects/pipeline-test"
TASKS_DIR="${PROJECT_DIR}/.claude/tasks"
AGENT_CC_DATA="${AGENT_CC_DATA:-${HOME}/.agent-cc}"
DB_FILE="${AGENT_CC_DATA}/agent-cc.json"

echo "Setting up test project at ${PROJECT_DIR}..."

# Create project dir + git repo
mkdir -p "${PROJECT_DIR}"
cd "${PROJECT_DIR}"
if [ ! -d .git ]; then
  git init
  git commit --allow-empty -m "init"
fi

# Create tasks directory
mkdir -p "${TASKS_DIR}"

# Write config
cat > "${TASKS_DIR}/_config.md" << 'CONFIGEOF'
---
type: task-config
statuses:
  - backlog
  - queued
  - build
  - ai-review
  - human-review
  - done
types:
  - roadmap
  - milestone
  - task
default_type: task
default_priority: medium
column_order: {}
---
CONFIGEOF

# Milestone
cat > "${TASKS_DIR}/milestone-auth-system-aa01.md" << 'EOF'
---
id: itm-aa010001
title: "Auth System"
type: milestone
status: backlog
priority: high
created: "2026-04-06"
updated: "2026-04-06"
---

Implement user authentication including login, registration, JWT tokens, and session management.
EOF

# Task 1: User model
cat > "${TASKS_DIR}/task-user-model-bb01.md" << 'EOF'
---
id: itm-bb010001
title: "User model and DB schema"
type: task
status: backlog
priority: high
parent: itm-aa010001
created: "2026-04-06"
updated: "2026-04-06"
---

Create the User model with fields: id, email, passwordHash, createdAt, updatedAt.
Add the database migration.
EOF

# Task 2: Password hashing
cat > "${TASKS_DIR}/task-password-hashing-bb02.md" << 'EOF'
---
id: itm-bb020001
title: "Password hashing service"
type: task
status: backlog
priority: high
parent: itm-aa010001
dependsOn:
  - itm-bb010001
created: "2026-04-06"
updated: "2026-04-06"
---

Implement bcrypt password hashing and verification. Wrap in a service with hash() and verify() methods.
EOF

# Task 3: JWT service
cat > "${TASKS_DIR}/task-jwt-service-bb03.md" << 'EOF'
---
id: itm-bb030001
title: "JWT token service"
type: task
status: backlog
priority: medium
parent: itm-aa010001
dependsOn:
  - itm-bb010001
created: "2026-04-06"
updated: "2026-04-06"
---

Create JWT sign and verify functions. Support access tokens (15min) and refresh tokens (7d).
EOF

# Task 4: Login endpoint
cat > "${TASKS_DIR}/task-login-endpoint-bb04.md" << 'EOF'
---
id: itm-bb040001
title: "Login endpoint"
type: task
status: backlog
priority: high
parent: itm-aa010001
dependsOn:
  - itm-bb020001
  - itm-bb030001
created: "2026-04-06"
updated: "2026-04-06"
---

POST /api/auth/login — validate credentials, return JWT access + refresh tokens.
EOF

# Task 5: Rate limiter
cat > "${TASKS_DIR}/task-rate-limiter-bb05.md" << 'EOF'
---
id: itm-bb050001
title: "Rate limiter middleware"
type: task
status: backlog
priority: medium
parent: itm-aa010001
dependsOn:
  - itm-bb040001
created: "2026-04-06"
updated: "2026-04-06"
---

Add rate limiting to auth endpoints. 5 attempts per minute per IP. Return 429 on exceed.
EOF

# Task 6: Session cleanup
cat > "${TASKS_DIR}/task-session-cleanup-bb06.md" << 'EOF'
---
id: itm-bb060001
title: "Session cleanup job"
type: task
status: backlog
priority: low
parent: itm-aa010001
created: "2026-04-06"
updated: "2026-04-06"
---

Cron job that deletes expired refresh tokens from the database. Runs every hour.
EOF

# Register project in Agent CC entity store
if [ -f "${DB_FILE}" ]; then
  # Use node to safely update JSON
  node -e "
    const fs = require('fs');
    const db = JSON.parse(fs.readFileSync('${DB_FILE}', 'utf-8'));
    if (!db.entities) db.entities = {};
    db.entities['pipeline-test'] = {
      id: 'pipeline-test',
      type: 'project',
      name: 'Pipeline Test',
      path: '${PROJECT_DIR}',
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    };
    fs.writeFileSync('${DB_FILE}', JSON.stringify(db, null, 2));
    console.log('Registered project in Agent CC entity store');
  "
else
  echo "Warning: Agent CC database not found at ${DB_FILE} — project won't appear in picker"
fi

echo "Done! Test project created with 1 milestone and 6 tasks."
echo "Refresh Agent CC to see it in the project picker."
