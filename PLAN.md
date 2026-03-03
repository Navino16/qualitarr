# Qualitarr - Roadmap

## Phase 0: Code Quality & Stability

### 0.1 API Client Robustness (`src/services/radarr.ts`) ✅
- [x] Add retry logic with exponential backoff (3 attempts)
- [x] Add configurable timeout on fetch requests (default 30s)
- [x] Handle HTTP 429 (rate limiting) with automatic retry
- [x] Use `URLSearchParams` for query string encoding
- [x] Add Zod validation for API responses

### 0.2 Queue Manager Fixes (`src/services/queue.ts`) ✅
- [x] Fix race condition on `isRunning` flag
- [x] Clear `completedItems` after summary (memory leak fix)
- [x] Add error boundary around Discord notifications
- [x] Ensure `startedAt` is always set before download queue
- [x] Add graceful shutdown mechanism

### 0.3 Code Deduplication ✅
- [x] Extract `sleep()` to shared utility (duplicated in queue.ts and history.ts)
- [x] Create `getMovieFileOrFail()` helper in RadarrService
- [x] Extract common score comparison pattern to helper function
- [x] Create `completeItem()` helper in QueueManager

### 0.4 Error Handling Standardization ✅
- [x] Create `formatError(error: unknown)` utility function
- [x] Add context to all error messages (movie title, endpoint, etc.)
- [x] Standardize logging patterns across services

### 0.5 Configuration Cleanup ✅
- [x] Move magic numbers to config:
  - `commandTimeoutMs` for search command timeout
  - `commandPollIntervalMs` for command polling interval
  - `grabWaitTimeoutMs` for grab event timeout
  - `historyPollIntervalMs` for history polling interval
- [x] Add config validation for timeout values (via Zod schema with min/max)

### 0.6 Test Coverage ✅
- [x] Create `tests/services/radarr.test.ts` (50 tests, 97% coverage)
- [x] Create `tests/services/queue.test.ts` (20 tests, 94% coverage)
- [x] Create `tests/services/discord.test.ts` (30 tests, 97% coverage)
- [x] Create `tests/utils/config.test.ts` (21 tests, 100% coverage)
- [x] Add coverage threshold check in CI (global: 70% lines/functions/statements, 65% branches)

### 0.7 Architecture Refactoring ✅
- [x] Split QueueManager into:
  - `QueueManager` - orchestrator only
  - `ItemProcessor` (`src/services/item-processor.ts`) - single item handling
  - `DownloadMonitor` (`src/services/download-monitor.ts`) - background download tracking
- [x] Create `IMediaService` interface (`src/types/services.ts`)
- [x] Create `INotificationService` interface (`src/types/services.ts`)
- [x] `RadarrService implements IMediaService`, `DiscordService implements INotificationService`

### 0.8 Observability ✅
- [x] Add correlation IDs (`correlationId` on `QueueItem`, generated via `randomUUID`)
- [x] Add `createLogContext(title, year?, correlationId?)` in `src/utils/logger.ts`
- [x] Use structured log context in `QueueManager`, `ItemProcessor`, `DownloadMonitor`

---

### 0.9 Quality of Life ✅
- [x] Dynamic version read from `package.json` (replaces hardcoded version)
- [x] `qualitarr health` command (connectivity check, config summary, `--notify` option)
- [x] CHANGELOG.md (Keep a Changelog format)

---

## Phase 1: Sonarr Support

### 1.1 Sonarr Service
- [ ] Create `src/services/sonarr.ts` based on `radarr.ts`
- [ ] Adapt Sonarr API endpoints (series, episodes, history)
- [ ] Sonarr types in `src/types/sonarr.ts`

### 1.2 Sonarr Commands
- [ ] Adapt `import.ts` to support SonarrEnvVars
- [ ] Create search command for Sonarr (by TVDB ID or series ID)
- [ ] Adapt `batch.ts` to process series/episodes

### 1.3 Configuration
- [ ] Document Sonarr config in `config.example.yaml`
- [ ] Add example in README

---

## Phase 2: Advanced Notifications

### 2.1 Additional Channels
- [ ] Telegram support
- [ ] Slack support
- [ ] Gotify/ntfy support
- [ ] Apprise support (multi-channel)

### 2.2 Enriched Notifications ✅
- [x] Include indexer info in notification
- [x] Direct link to media in Radarr/Sonarr
- [x] Poster thumbnail in Discord embed
- [x] Dynamic version in embed footer
- [x] Grouped notification (batch summary)

---

## Phase 3: Reporting and Statistics

### 3.1 Local Database
- [ ] SQLite to store verification history
- [ ] Track: indexer, score difference, date, action taken

### 3.2 Indexer Statistics
- [ ] `qualitarr stats` command to view stats
- [ ] Lie rate per indexer
- [ ] Average score difference per indexer
- [ ] Top reliable / unreliable indexers

### 3.3 Export
- [ ] CSV export of verifications
- [ ] JSON export for external integration

---

## Phase 4: Interactive Mode

- [ ] `qualitarr review` command to review mismatches
- [ ] Available actions:
  - **skip**: leave error tag in place
  - **mark-ok**: switch to check_ok (remove error tag, add success tag)
  - **re-search**: trigger a new search for this media

---

## Phase 5: Miscellaneous Improvements

### 5.1 Batch Performance
- [ ] Parallel verifications (configurable)

### 5.2 Advanced Filters
- [ ] Filter by quality profile
- [ ] Filter by existing tag
- [ ] Filter by added date
- [ ] Filter by minimum score

### 5.3 Tests
- [ ] Integration tests with mock API
- [ ] E2E tests with Radarr/Sonarr test containers

### 5.4 Documentation
- [ ] JSDoc comments on public service methods
- [ ] Architecture diagram (mermaid in README)

---

## Suggested Priorities

| Priority | Feature                   | Impact                         |
|----------|---------------------------|--------------------------------|
| Critical | Phase 0 - Stability fixes | Prevents crashes and data loss |
| High     | Sonarr support            | Covers 50% of potential users  |
| Medium   | Indexer stats             | Helps identify bad indexers    |
| Medium   | Telegram notifications    | Highly requested               |
| Low      | Interactive mode          | Nice-to-have                   |

---

## Technical Notes

### Sonarr vs Radarr API
- Similar endpoints but different structure
- Series → Episodes → EpisodeFiles (vs Movie → MovieFile)
- History per episode or per series