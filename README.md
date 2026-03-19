<p align="center">
  <h1 align="center">Qualitarr</h1>
</p>

<p align="center">
  Monitor and compare expected vs actual quality scores for Radarr/Sonarr downloads.<br/>
  Detects custom format score mismatches between grabbed and imported files.
</p>

<p align="center">
  <a href="https://github.com/Navino16/qualitarr/actions/workflows/release.yml"><img src="https://img.shields.io/github/actions/workflow/status/Navino16/qualitarr/release.yml?label=CI&style=flat-square" alt="CI"></a>
  <a href="https://github.com/Navino16/qualitarr/actions/workflows/develop.yml"><img src="https://img.shields.io/github/actions/workflow/status/Navino16/qualitarr/develop.yml?label=Build&style=flat-square&logo=docker" alt="Build"></a>
</p>

<p align="center">
  <a href="https://github.com/Navino16/qualitarr/pkgs/container/qualitarr"><img src="https://img.shields.io/badge/ghcr.io-qualitarr-blue?style=flat-square&logo=docker" alt="Docker"></a>
  <a href="https://discord.gg/XgCBF3sMSh"><img src="https://img.shields.io/discord/1483405134003175607?style=flat-square&logo=discord&label=Discord" alt="Discord"></a>
  <a href="https://github.com/Navino16/qualitarr"><img src="https://img.shields.io/github/stars/Navino16/qualitarr?style=flat-square" alt="Stars"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Navino16/qualitarr?style=flat-square" alt="License"></a>
</p>

<p align="center">
  <a href="#features">Features</a> &bull;
  <a href="#getting-started">Getting Started</a> &bull;
  <a href="#configuration">Configuration</a> &bull;
  <a href="#usage">Usage</a> &bull;
  <a href="#how-it-works">How It Works</a> &bull;
  <a href="#development">Development</a>
</p>

---

## Features

- **Auto-detect mode**: Run as a Radarr/Sonarr Custom Script triggered on import
- **Batch mode**: Process all unchecked movies with a dual-queue system
- **Score comparison**: Compare expected vs actual custom format scores
- **Tagging**: Automatically tag movies based on score match/mismatch
- **Discord notifications**: Get notified when score mismatches are detected
- **Configurable tolerance**: Score is acceptable if actual is between (expected - maxUnderScore) and (expected + maxOverScore)
- **Dry-run mode**: Test without making any changes

## Getting Started

### Docker

```bash
docker run --rm -v "/path/to/config:/app/config" ghcr.io/navino16/qualitarr:latest
```

Edit `./config/config.yaml`, then schedule periodic runs or use as a Radarr custom script.

### Linux / macOS

1. Download the [latest release](https://github.com/Navino16/qualitarr/releases/latest) for your platform
2. Make the binary executable and run it:
    ```bash
    chmod +x qualitarr-linux-amd64
    ./qualitarr-linux-amd64
    ```
3. Edit `./config.yaml` and run again

### Windows

1. Download the [latest release](https://github.com/Navino16/qualitarr/releases/latest) for Windows
2. Run the binary from the command line
3. Edit `./config.yaml` and run again

## Configuration

### Configuration File

Copy `config.example.yaml` to `config.yaml` and edit it:

```bash
cp config.example.yaml config.yaml
```

<details>
<summary><strong>Radarr</strong> — Radarr connection settings</summary>

| Name | Description | Mandatory | Default |
|------|-------------|-----------|---------|
| `radarr.url` | Radarr base URL | Yes | |
| `radarr.apiKey` | Radarr API key | Yes | |
| `radarr.api.timeoutMs` | Request timeout (ms) | No | 30000 |
| `radarr.api.retryAttempts` | Retry attempts on failure | No | 3 |
| `radarr.api.retryDelayMs` | Initial retry delay (ms) | No | 1000 |

</details>

<details>
<summary><strong>Discord</strong> — Webhook notifications</summary>

| Name | Description | Mandatory | Default |
|------|-------------|-----------|---------|
| `discord.enabled` | Enable Discord notifications | Yes | true |
| `discord.webhookUrl` | Discord webhook URL | Yes | |

</details>

<details>
<summary><strong>Tag</strong> — Tagging settings</summary>

| Name | Description | Mandatory | Default |
|------|-------------|-----------|---------|
| `tag.enabled` | Enable automatic tagging | Yes | true |
| `tag.successTag` | Tag applied when score matches | No | check_ok |
| `tag.mismatchTag` | Tag applied when score differs | No | quality-mismatch |

</details>

<details>
<summary><strong>Quality</strong> — Score tolerance</summary>

| Name | Description | Mandatory | Default |
|------|-------------|-----------|---------|
| `quality.maxOverScore` | Max allowed above expected | No | 100 |
| `quality.maxUnderScore` | Max allowed below expected (0 = must be >= expected) | No | 0 |

</details>

<details>
<summary><strong>Batch</strong> — Batch mode settings</summary>

| Name | Description | Mandatory | Default |
|------|-------------|-----------|---------|
| `batch.maxConcurrentDownloads` | Max concurrent downloads | No | 3 |
| `batch.searchIntervalSeconds` | Delay between searches (s) | No | 30 |
| `batch.downloadCheckIntervalSeconds` | Download progress check interval (s) | No | 10 |
| `batch.downloadTimeoutMinutes` | Download timeout (min) | No | 60 |
| `batch.commandTimeoutMs` | Search command timeout (ms) | No | 60000 |
| `batch.commandPollIntervalMs` | Command status polling (ms) | No | 2000 |
| `batch.grabWaitTimeoutMs` | Grab event timeout (ms) | No | 30000 |
| `batch.historyPollIntervalMs` | History polling interval (ms) | No | 3000 |

</details>

<details>
<summary><strong>Example configuration</strong></summary>

```yaml
radarr:
  url: "http://localhost:7878"
  apiKey: "your-radarr-api-key"
  api:
    timeoutMs: 30000
    retryAttempts: 3
    retryDelayMs: 1000

discord:
  enabled: true
  webhookUrl: "https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN"

tag:
  enabled: true
  successTag: "check_ok"
  mismatchTag: "quality-mismatch"

quality:
  maxOverScore: 100
  maxUnderScore: 0

batch:
  maxConcurrentDownloads: 3
  searchIntervalSeconds: 30
  downloadCheckIntervalSeconds: 10
  downloadTimeoutMinutes: 60
```

</details>

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

### CLI Options

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

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Request timeout" | Increase `radarr.api.timeoutMs` in configuration |
| "API key invalid" | Verify your Radarr API key in Settings > General |
| "No grab history found" | The movie may have been manually imported. Run a search to create grab history |
| "Score mismatch on all movies" | Review your `quality.maxOverScore` and `quality.maxUnderScore` settings |

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

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint

# Format
npm run format
```

## Requirements

- Node.js >= 20.0.0
- Radarr v3+ (Sonarr support coming soon)

## License

[MIT License](LICENSE)