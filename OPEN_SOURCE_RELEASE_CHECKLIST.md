# Open Source Release Checklist

## License

**Choice: MIT**

Rationale: MIT is the standard license for developer tools and dashboards. It is simple, permissive, and widely understood. There are no patent concerns or copyleft requirements that would warrant Apache-2.0.

## Pre-Publication

- [x] Repository contains no secrets, tokens, or API keys (verified via REPO_RISK_AUDIT.md)
- [x] No personal information (names, IPs, phone numbers) hardcoded in source
- [x] `.gitignore` excludes `.env`, `dist/`, `data/`, `node_modules/`
- [x] LICENSE file present (MIT)
- [x] README.md with install, build, run instructions
- [x] SECURITY.md with vulnerability reporting process
- [x] CONTRIBUTING.md with development workflow
- [x] CODE_OF_CONDUCT.md (Contributor Covenant)
- [x] CHANGELOG.md with version history
- [x] CI workflow for type-checking and tests
- [x] CodeQL security scanning workflow
- [x] Dependency review workflow
- [x] Release workflow with checksums
- [x] All GitHub Actions pinned to commit SHAs (not mutable version tags)
- [x] Issue and PR templates
- [x] Threat model documented
- [ ] Verify git history has no committed secrets (see below)

## Third-Party Actions

The release workflow uses `softprops/action-gh-release` — a widely-used community action (10k+ stars) for creating GitHub releases. It requires `contents: write` permission. It is pinned to a specific commit SHA to mitigate tag-repointing attacks. If you prefer to avoid third-party actions entirely, replace it with the `gh release create` CLI command in the workflow.

## Git History Verification

Run this before publishing to verify no secrets were ever committed:

```bash
git log --all --diff-filter=A -- '*.env' '.env.*'
git log --all -p -- '*.json' | grep -i "api_key\|secret\|token\|password" | head -20
```

If secrets are found in history, use `git filter-repo` to remove them before making the repository public.

## Manual GitHub Settings (after pushing)

These cannot be set via code and must be configured in the GitHub repository settings:

### Settings > General
- [ ] Set repository description: "Local dashboard for visualizing and managing your Claude Code ecosystem"
- [ ] Set topics: `claude-code`, `mcp`, `dashboard`, `developer-tools`, `typescript`
- [ ] Enable "Discussions" tab if you want community Q&A

### Settings > Branches
- [ ] Add branch protection rule for `main`:
  - Require pull request before merging
  - Require status checks: `ci` (Node 20), `ci` (Node 22)
  - Do not allow force pushes
  - Do not allow deletions

### Settings > Code Security
- [ ] Enable Dependabot alerts
- [ ] Enable Dependabot security updates
- [ ] Enable Secret scanning
- [ ] Enable Push protection (prevents pushing secrets)
- [ ] Enable Code scanning (CodeQL will run from the workflow)

### Settings > Security > Advisories
- [ ] Verify "Private vulnerability reporting" is enabled (allows SECURITY.md workflow)

## Post-Publication

- [ ] Create initial GitHub release `v1.0.0` with:
  ```bash
  git tag v1.0.0
  git push origin v1.0.0
  ```
  The release workflow will build artifacts and attach checksums automatically.
- [ ] Verify CI passes on the public repository
- [ ] Verify CodeQL scan completes
- [ ] Verify Scorecard runs (may take a few days to show a score)
- [ ] Submit to relevant lists/directories if desired (awesome-claude, etc.)
