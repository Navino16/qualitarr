# Qualitarr - Claude Instructions

## Project Description

Qualitarr is a CLI tool that monitors and compares expected vs actual quality scores (Custom Formats) for Radarr/Sonarr downloads. It detects discrepancies between the score announced by the indexer and the actual score after import.

## Project Structure

```
qualitarr/
├── src/
│   ├── cli.ts              # CLI entry point
│   ├── commands/           # Commands (batch, import, search)
│   ├── services/           # Services (radarr, discord, queue, score)
│   ├── types/              # TypeScript types (config, radarr, score)
│   └── utils/              # Utilities (logger, env, history)
├── tests/                  # Vitest tests
│   ├── services/
│   └── utils/
├── .github/workflows/      # CI/CD GitHub Actions
├── Dockerfile              # Multi-stage build Node 22 Alpine
├── vitest.config.ts        # Test configuration
└── config.example.yaml     # Configuration example
```

## Essential Commands

```bash
# Development
npm run build        # Compile TypeScript
npm run dev          # Build in watch mode
npm run lint         # Run ESLint
npm run format       # Format with Prettier

# Tests
npm test             # Run tests (vitest run)
npm run test:watch   # Tests in watch mode
npm run test:coverage # Tests with coverage

# Packaging
npm run package      # Create binaries with @yao-pkg/pkg
```

## Pre-commit Workflow

**For code files (`.ts`, `.js`, etc.):**
```bash
npm run lint && npm run format && npm run build
```

**For markdown files (`.md`) only:** No lint/format needed.

## Git Workflow

### Branches
- **develop**: main development branch
- **main**: stable branch (releases)
- For each feature/bug: create a new branch from `develop` (ensure it's up to date with GitHub)

### Commits
- **Concise** messages in **English**
- Commit signing: ask for confirmation if it fails

### Pull Requests
- Create via `gh pr create` only when user requests it
- Always follow the template in `.github/`
- PR to `develop` (except releases to `main`)

## ESLint Configuration

Project uses strict ESLint with TypeScript. Important rules:
- `@typescript-eslint/restrict-template-expressions` with `allowNumber: true`
- `@typescript-eslint/no-unused-vars` with `argsIgnorePattern: "^_"`

## CI/CD

### GitHub Actions Workflows

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `ci.yml` | PR to main | Lint, tests, build |
| `develop.yml` | Push to develop | Build Docker develop image |
| `release.yml` | Tag v*.*.* | Build binaries + Docker release image |

### Generated Binaries

Packaging creates binaries for:
- `qualitarr-linux-amd64` (renamed from linux-x64)
- `qualitarr-linux-arm64`
- `qualitarr-macos-x64`
- `qualitarr-win-x64.exe`

### Docker

Docker image uses full TypeScript build (not pkg binaries because Alpine uses musl, incompatible with glibc).

## Code Conventions

- Code and commits in **English**
- Communication in **French** (user preference)
- No emojis unless explicitly requested
- Strict types, no `any`

## Main Types

### ScoreComparison
```typescript
interface ScoreComparison {
  expectedScore: number;   // Score from grabbed event
  actualScore: number;     // Score from imported file
  difference: number;      // actual - expected
  isOverScore: boolean;    // Above limits
  isUnderScore: boolean;   // Below limits
  isWithinLimits: boolean; // Within acceptable limits
}
```

### Config
See `src/types/config.ts` - Zod schema with validation.

## Radarr API Used

- `GET /api/v3/movie` - List movies
- `GET /api/v3/history/movie?movieId=X` - Movie history
- `GET /api/v3/moviefile?movieId=X` - Movie file
- `POST /api/v3/command` - Trigger search
- `GET/POST /api/v3/tag` - Tag management

## Tests

Framework: **Vitest** with v8 coverage

Test files:
- `tests/services/score.test.ts` - Score calculation and handling
- `tests/utils/history.test.ts` - Radarr history parsing
- `tests/utils/env.test.ts` - Radarr/Sonarr environment variables
- `tests/utils/logger.test.ts` - Logger

Current coverage: **100%** on tested files.

## Releases

- Release tags: `vX.Y.Z` (e.g., v0.1.0)
- Created from `main` after merging `develop`
- Commit signing: if it fails, ask user for confirmation before retrying or aborting