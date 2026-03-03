# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Dynamic version**: Version is now read from `package.json` instead of being hardcoded (`src/utils/version.ts`)
- **`qualitarr health` command**: Diagnostic command to check Radarr connectivity, display configuration summary, and optionally send a test Discord notification (`--notify`)
- **Enriched Discord notifications**: Mismatch embeds now include a clickable link to the movie in Radarr, indexer name, poster thumbnail, and dynamic version in footer
- **Batch summary notification**: Discord embed sent at the end of batch processing with stats (total processed, completed, failed, mismatches, duration, failed items list)
- `radarrSystemStatusSchema` for Radarr system status API validation
- `radarrImageSchema` and `images` field on movie schema for poster thumbnails
- `getSystemStatus()` method on `RadarrService`
- `sendBatchSummary()` method on `DiscordService`

### Changed
- `ScoreMismatchInfo` interface extended with optional `radarrUrl`, `movieId`, `posterUrl` fields
- `ScoreResultContext` extended with optional `indexer` field
- `ScoreResultServices` extended with optional `radarrUrl` field
- `MovieInfo` extended with optional `images` field
- Discord embed footer now shows `Qualitarr v{version}` instead of static `Qualitarr`
- Discord webhook logic extracted to shared `sendWebhook()` private method

## [0.1.0] - 2025-01-01

### Added
- Initial release
- Radarr quality score monitoring (import and batch modes)
- `qualitarr batch` command with dual queue system (search + download)
- `qualitarr search <tmdb-id>` command for manual movie checks
- Auto-detect mode for Radarr custom script integration
- Discord webhook notifications for score mismatches
- Tag management (success/mismatch tags on movies)
- Dry-run mode (`--dry-run`) for safe testing
- Configurable quality thresholds (`maxOverScore`, `maxUnderScore`)
- API client with retry logic, exponential backoff, and timeout
- Zod schema validation for all API responses
- Graceful shutdown for queue manager
- Configurable polling and timeout intervals
- Multi-platform binaries (Linux amd64/arm64, macOS x64, Windows x64)
- Docker support with Alpine-based image
