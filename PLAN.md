# Qualitarr - Roadmap

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

---

## Suggested Priorities

| Priority | Feature | Impact |
|----------|---------|--------|
| High | Sonarr support | Covers 50% of potential users |
| Medium | Indexer stats | Helps identify bad indexers |
| Medium | Telegram notifications | Highly requested |
| Low | Interactive mode | Nice-to-have |

---

## Technical Notes

### Sonarr vs Radarr API
- Similar endpoints but different structure
- Series → Episodes → EpisodeFiles (vs Movie → MovieFile)
- History per episode or per series
