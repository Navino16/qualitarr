# Qualitarr

Monitor and compare expected vs actual quality scores for Radarr/Sonarr downloads.

Qualitarr helps you ensure that the files grabbed by Radarr/Sonarr match the expected custom format scores. When a mismatch is detected, it applies a tag and sends a Discord notification.

## Features

- **Auto-detect mode**: Run as a Radarr/Sonarr Custom Script triggered on import
- **Batch mode**: Process all unchecked movies with a dual-queue system
- **Score comparison**: Compare expected vs actual custom format scores
- **Tagging**: Automatically tag movies based on score match/mismatch
- **Discord notifications**: Get notified when score mismatches are detected
- **Configurable tolerance**: Score is acceptable if actual is between (expected - maxUnderScore) and (expected + maxOverScore)

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/qualitarr.git
cd qualitarr

# Install dependencies
npm install

# Build
npm run build

# Copy and edit configuration
cp config.example.yaml config.yaml
```

## Configuration

```yaml
# Radarr configuration
radarr:
  url: "http://localhost:7878"
  apiKey: "your-radarr-api-key"
  api:  # Optional API settings
    timeoutMs: 30000      # Request timeout (default: 30000)
    retryAttempts: 3      # Retry on failure (default: 3)
    retryDelayMs: 1000    # Initial retry delay (default: 1000)

# Discord webhook notifications
discord:
  enabled: true
  webhookUrl: "https://discord.com/api/webhooks/..."

# Tag settings
tag:
  enabled: true
  successTag: "check_ok"           # Applied when score matches
  mismatchTag: "quality-mismatch"  # Applied when score differs

# Quality settings
quality:
  maxOverScore: 100   # Max allowed above expected
  maxUnderScore: 0    # Max allowed below expected (0 = must be >= expected)

# Batch mode settings
batch:
  maxConcurrentDownloads: 3
  searchIntervalSeconds: 30
  downloadCheckIntervalSeconds: 10
  downloadTimeoutMinutes: 60
  # Advanced polling/timeout settings (optional)
  commandTimeoutMs: 60000         # Search command timeout (ms)
  commandPollIntervalMs: 2000     # Command status polling (ms)
  grabWaitTimeoutMs: 30000        # Grab event timeout (ms)
  historyPollIntervalMs: 3000     # History polling interval (ms)
```

## Usage

### As Radarr/Sonarr Custom Script (Recommended)

1. In Radarr, go to **Settings > Connect > + > Custom Script**
2. Set the path to the `qualitarr` binary
3. Select **On Import** as the trigger
4. Save

When a file is imported, Qualitarr will automatically:
1. Compare the grabbed score with the imported score
2. Apply the appropriate tag (`check_ok` or `quality-mismatch`)
3. Send a Discord notification if there's a mismatch

### Batch Mode

Process all movies that haven't been checked yet:

```bash
qualitarr batch
```

This mode uses a dual-queue system:
- **Search Queue**: All movies without the success tag
- **Download Queue**: Limited concurrent downloads (configurable)

The batch process:
1. Fetches all movies without `check_ok` or `quality-mismatch` tags
2. Triggers searches with configurable delays between each
3. Monitors downloads in parallel (limited concurrency)
4. Checks scores and applies tags as downloads complete

### Manual Search

Search for a specific movie by TMDB ID (visible in the Radarr URL):

```bash
# TMDB ID is the number in the Radarr URL: /movie/550
qualitarr search 550
```

## CLI Options

```
Usage:
  qualitarr [command] [options]

Commands:
  (no command)         Auto-detect mode from Radarr/Sonarr environment variables
  batch                Process all movies without success tag
  search <tmdb-id>     Search for a specific movie by TMDB ID

Options:
  -c, --config <path>  Path to config file (default: ./config.yaml)
  -v, --verbose        Enable verbose logging
  -n, --dry-run        Dry run mode (no searches, no tags, only logs)
  -h, --help           Show this help message
      --version        Show version
```

## How It Works

Qualitarr compares the **grabbed** score (what Radarr expected when it grabbed the release) with the **current file** score. This detects cases where the imported file doesn't match the expected custom format score.

A score is considered **acceptable** if the actual score is between `expected - maxUnderScore` (default: 0) and `expected + maxOverScore` (default: 100). Scores outside this range are considered mismatches.

1. **Trigger search**: Tell Radarr to search for the movie
2. **Wait for grab**: Monitor for the grabbed event and record its custom format score
3. **Wait for import**: Monitor for the file to be imported
4. **Compare scores**: Compare grabbed score vs current file score
5. **Take action**: Apply tags and send Discord notifications based on the result

## Requirements

- Node.js >= 20.0.0
- Radarr v3+ (Sonarr support coming soon)

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Run tests
npm test

# Run tests once
npm run test:run

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint

# Format
npm run format
```

## License

MIT
