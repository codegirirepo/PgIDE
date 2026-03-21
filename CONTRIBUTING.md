# Contributing to PgIDE

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

1. Fork and clone the repo
2. Install dependencies: `npm run install:all`
3. Start dev servers: `npm run dev`
4. Frontend runs on `http://localhost:5173`, backend on `http://localhost:3001`

## Project Layout

- `backend/src/` — Express API server (TypeScript, compiled with tsx)
- `frontend/src/` — React SPA (TypeScript, built with Vite)
- `electron/` — Optional desktop wrapper

## Guidelines

- **TypeScript** — All code must be TypeScript. No `any` unless unavoidable.
- **No new dependencies** without discussion. The project intentionally keeps a small dependency footprint.
- **Component structure** — One component per folder under `frontend/src/components/`. Co-locate related files.
- **Backend services** — Business logic goes in `backend/src/services/`. Routes are thin wrappers.
- **SQL safety** — Always use parameterized queries (`$1`, `$2`) for user-provided values. Never interpolate user input into SQL.
- **Formatting** — 2-space indentation, single quotes, no semicolons in frontend (Vite default). Backend uses semicolons.

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with clear, focused commits
3. Ensure `npx tsc --noEmit` passes in both `backend/` and `frontend/`
4. Test your changes against a real PostgreSQL instance
5. Open a PR with a clear description of what changed and why

## Reporting Issues

- Use GitHub Issues
- Include: steps to reproduce, expected behavior, actual behavior, PostgreSQL version
- Screenshots are helpful for UI issues

## Feature Requests

Open an issue with the `enhancement` label. Describe the use case, not just the solution.
