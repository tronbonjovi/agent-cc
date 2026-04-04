# Contributing

Contributions are welcome. This guide covers the workflow and expectations.

## Getting started

1. Fork the repository and clone your fork.
2. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
   The dashboard runs at `http://localhost:5100`.

## Development commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server with hot reload |
| `npm run check` | TypeScript type checking (`tsc --noEmit`) |
| `npm test` | Run tests (`vitest run`) |
| `npm run build` | Production build |

## Pull request requirements

- `npm run check` passes with no errors.
- `npm test` passes.
- No unnecessary new dependencies. If you add one, justify it in the PR description.
- Keep PRs focused. One feature or fix per PR.
- Write a clear description of what changed and why.

## Code style

- TypeScript throughout. No `any` unless truly unavoidable.
- Follow existing patterns in the codebase.
- Use Zod for runtime validation of external input.
- Spawn shell commands with array-style arguments (never string interpolation).
- No emojis in code or commit messages.

## Commit messages

Use conventional prefixes:

```
feat: add session filtering by project
fix: handle missing .claude directory gracefully
chore: update dependencies
```

## Reporting bugs

Open a [GitHub issue](https://github.com/tronbonjovi/claude-command-center/issues) with:

- Steps to reproduce
- Expected vs. actual behavior
- Node.js version and OS

## Security issues

Do **not** report security vulnerabilities via public issues. See [SECURITY.md](SECURITY.md).
