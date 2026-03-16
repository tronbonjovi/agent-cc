# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| < 1.0   | No        |

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Please report vulnerabilities through [GitHub Security Advisories](https://github.com/sorlen008/claude-command-center/security/advisories/new).

### What qualifies as a security issue

- Path traversal that escapes the home directory boundary
- Arbitrary command injection via user-controlled input
- Exposure of secrets, tokens, or credentials through the dashboard or API
- Cross-site scripting (XSS) that could execute in the local dashboard context
- Unauthorized file writes outside `~/.claude-command-center/`

### What does NOT qualify

- Issues that require local shell access (this is a localhost-only tool)
- Denial of service against the local server
- Feature requests or general bugs (use regular issues for these)

### Response expectations

- We will acknowledge your report within **7 days**.
- We will provide an initial assessment within **14 days**.
- Fix timelines depend on severity and complexity; we do not guarantee specific deadlines.
- We will credit reporters in the changelog unless they request otherwise.

### Disclosure

We ask that you give us reasonable time to address the issue before any public disclosure. We aim to resolve confirmed vulnerabilities promptly but cannot commit to fixed SLAs for an open-source project maintained in spare time.
