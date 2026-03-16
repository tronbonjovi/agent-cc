# Maintainer Notes

Settings that must be configured manually in the GitHub repository web interface after the repository is made public.

## Branch Protection (Settings > Branches)

Add a ruleset for `main`:

| Setting | Value |
|---------|-------|
| Require pull request | Yes |
| Required approvals | 1 (or 0 if solo maintainer) |
| Require status checks | `ci` (Node.js 20), `ci` (Node.js 22) |
| Require CodeQL | Optional but recommended |
| Allow force push | No |
| Allow deletion | No |

## Dependabot (Settings > Code Security)

| Setting | Enable |
|---------|--------|
| Dependabot alerts | Yes |
| Dependabot security updates | Yes |
| Dependabot version updates | Optional (can be noisy) |

## Secret Scanning (Settings > Code Security)

| Setting | Enable |
|---------|--------|
| Secret scanning | Yes |
| Push protection | Yes |

This prevents accidental commits of API keys or tokens.

## Code Scanning (Settings > Code Security)

CodeQL is configured via `.github/workflows/codeql.yml` and runs automatically. Verify it appears under "Code scanning alerts" after the first push to `main`.

## Vulnerability Reporting (Settings > Security)

Enable "Private vulnerability reporting" so users can follow the process described in SECURITY.md.

## Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Commit: `chore: release vX.Y.Z`
4. Tag: `git tag vX.Y.Z`
5. Push: `git push origin main --tags`
6. The release workflow builds artifacts, generates SHA-256 checksums, and creates a GitHub release automatically.

## Required Status Checks

After the first CI run, go to Settings > Branches > Edit rule for `main` and add these required status checks:

- `ci` (from `.github/workflows/ci.yml`)

## OpenSSF Scorecard

The Scorecard workflow runs weekly and on push to main. Results appear in the Security tab under "Code scanning alerts". The score improves as you enable more security features (branch protection, signed commits, etc.).
