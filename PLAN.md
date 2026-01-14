# Qualitarr - Roadmap

## Phase 0: Code Quality & Stability

### 0.1 API Client Robustness (`src/services/radarr.ts`)
- [ ] Add retry logic with exponential backoff (3 attempts)
- [ ] Add configurable timeout on fetch requests (default 30s)
- [ ] Handle HTTP 429 (rate limiting) with automatic retry
- [ ] Use `URLSearchParams` for query string encoding
- [ ] Add Zod validation for API responses

### 0.2 Queue Manager Fixes (`src/services/queue.ts`)
- [ ] Fix race condition on `isRunning` flag
- [ ] Clear `completedItems` after summary (memory leak fix)
- [ ] Add error boundary around Discord notifications
- [ ] Ensure `startedAt` is always set before download queue
- [ ] Add graceful shutdown mechanism

### 0.3 Code Deduplication
- [ ] Extract `sleep()` to shared utility (duplicated in queue.ts and history.ts)
- [ ] Create `getMovieFileOrFail()` helper in RadarrService
- [ ] Extract common score comparison pattern to helper function
- [ ] Create `completeItem()` helper in QueueManager

### 0.4 Error Handling Standardization
- [ ] Create `formatError(error: unknown)` utility function
- [ ] Add context to all error messages (movie title, endpoint, etc.)
- [ ] Standardize logging patterns across services

### 0.5 Configuration Cleanup
- [ ] Move magic numbers to config:
  - `apiTimeoutMs` (currently hardcoded 30000, 60000, etc.)
  - `commandPollIntervalMs` (currently hardcoded 2000, 3000)
- [ ] Add config validation for timeout values

### 0.6 Test Coverage
- [ ] Create `tests/services/radarr.test.ts` (target: 80%)
- [ ] Create `tests/services/queue.test.ts` (target: 70%)
- [ ] Create `tests/services/discord.test.ts` (target: 80%)
- [ ] Create `tests/utils/config.test.ts` (target: 90%)
- [ ] Add coverage threshold check in CI (fail if < 70%)

### 0.7 Architecture Refactoring
- [ ] Split QueueManager (479 lines) into:
  - `QueueManager` - orchestrator only (~150 lines)
  - `ItemProcessor` - single item handling
  - `DownloadMonitor` - background download tracking
- [ ] Create `IMediaService` interface (shared Radarr/Sonarr contract)
- [ ] Create `INotificationService` interface

### 0.8 Observability
- [ ] Add correlation IDs for async operation tracing
- [ ] Add structured logging with context (movie title, indexer, etc.)

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

### 2.2 Enriched Notifications
- [ ] Include indexer info in notification
- [ ] Direct link to media in Radarr/Sonarr
- [ ] Grouped notification (batch summary)

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
