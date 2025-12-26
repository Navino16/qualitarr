# Qualitarr

Monitor and compare expected vs actual quality scores for Radarr/Sonarr downloads.

Qualitarr helps you ensure that the files grabbed by Radarr/Sonarr match the expected custom format scores. When a mismatch is detected, it applies a tag and sends a Discord notification.

## Features

- **Auto-detect mode**: Run as a Radarr/Sonarr Custom Script triggered on import
- **Batch mode**: Process all unchecked movies with a dual-queue system
- **Score comparison**: Compare expected vs actual custom format scores
- **Tagging**: Automatically tag movies based on score match/mismatch
- **Discord notifications**: Get notified when score mismatches are detected
- **Configurable tolerance**: Set a percentage threshold for acceptable score differences

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
  tolerancePercent: 0  # 0 = exact match required

# Batch mode settings
batch:
  maxConcurrentDownloads: 3
  searchIntervalSeconds: 30
  downloadCheckIntervalSeconds: 10
  downloadTimeoutMinutes: 60
```

## Usage

### As Radarr/Sonarr Custom Script (Recommended)

1. In Radarr, go to **Settings > Connect > + > Custom Script**
2. Set the path to the `qualitarr` binary
3. Select **On Import** as the trigger
4. Save

When a file is imported, Qualitarr will automatically:
1. Compare the imported file's score with the best available release
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

Search for a specific movie by ID:

```bash
qualitarr search <movie-id>
```

## CLI Options

```
Usage:
  qualitarr [command] [options]

Commands:
  (no command)         Auto-detect mode from Radarr/Sonarr environment variables
  batch                Process all movies without success tag
  search <movie-id>    Search for a specific movie and monitor quality

Options:
  -c, --config <path>  Path to config file (default: ./config.yaml)
  -v, --verbose        Enable verbose logging
  -h, --help           Show this help message
      --version        Show version
```

## How It Works

1. **Get expected score**: Query available releases and find the highest custom format score among non-rejected releases
2. **Trigger search**: Tell Radarr to search for the movie
3. **Monitor download**: Track the download progress in the queue
4. **Compare scores**: Once imported, compare the actual score with the expected score
5. **Take action**: Apply tags and send notifications based on the result

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

# Lint
npm run lint

# Format
npm run format
```

## License

MIT
