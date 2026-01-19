#!/usr/bin/env node

import { parseArgs } from "node:util";
import {
  loadConfig,
  logger,
  setLogLevel,
  parseArrEnv,
  isImportEvent,
  formatError,
} from "./utils/index.js";
import { searchCommand } from "./commands/search.js";
import { batchCommand } from "./commands/batch.js";
import { importCommand } from "./commands/import.js";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    config: {
      type: "string",
      short: "c",
      description: "Path to config file",
    },
    verbose: {
      type: "boolean",
      short: "v",
      default: false,
      description: "Enable verbose logging",
    },
    "dry-run": {
      type: "boolean",
      short: "n",
      default: false,
      description: "Dry run mode (no searches, no tags)",
    },
    limit: {
      type: "string",
      short: "l",
      description: "Limit number of movies to process (batch mode)",
    },
    help: {
      type: "boolean",
      short: "h",
      default: false,
      description: "Show help",
    },
    version: {
      type: "boolean",
      default: false,
      description: "Show version",
    },
  },
  allowPositionals: true,
});

function showHelp(): void {
  console.log(`
Qualitarr - Monitor quality scores for Radarr/Sonarr downloads

Usage:
  qualitarr [command] [options]

Commands:
  (no command)         Auto-detect mode from Radarr/Sonarr environment variables
  batch                Process all movies without success tag (dual queue system)
  search <tmdb-id>     Search for a specific movie by TMDB ID and monitor quality

Options:
  -c, --config <path>  Path to config file (default: ./config.yaml)
  -v, --verbose        Enable verbose logging
  -n, --dry-run        Dry run mode (no searches, no tags, only logs)
  -l, --limit <n>      Limit number of movies to process (batch mode)
  -h, --help           Show this help message
      --version        Show version

Examples:
  # As Radarr/Sonarr Custom Script (auto-detect mode):
  qualitarr

  # Batch mode - process all unchecked movies:
  qualitarr batch

  # Dry run batch mode (see what would happen):
  qualitarr batch --dry-run

  # Manual search for a specific movie (use TMDB ID from Radarr URL):
  qualitarr search 550

Configuration:
  Copy config.example.yaml to config.yaml and edit with your settings.

Radarr/Sonarr Custom Script Setup:
  Settings -> Connect -> Custom Script
  Path: /path/to/qualitarr
  Trigger: On Import
`);
}

function showVersion(): void {
  console.log("qualitarr v0.1.0");
}

async function main(): Promise<void> {
  if (values.help) {
    showHelp();
    process.exit(0);
  }

  if (values.version) {
    showVersion();
    process.exit(0);
  }

  if (values.verbose) {
    setLogLevel("debug");
  }

  const dryRun = values["dry-run"];

  if (dryRun) {
    logger.info("=== DRY RUN MODE - No changes will be made ===");
  }

  const command = positionals[0];

  // Auto-detect mode: check for Radarr/Sonarr environment variables
  if (!command) {
    const envVars = parseArrEnv();

    if (envVars) {
      logger.info(`Detected ${envVars.type} event: ${envVars.eventType}`);

      if (!isImportEvent(envVars)) {
        logger.debug(
          `Event type ${envVars.eventType} is not an import event, skipping`
        );
        process.exit(0);
      }

      try {
        const config = await loadConfig(values.config);

        if (envVars.type === "radarr") {
          await importCommand(config, envVars);
        } else {
          logger.error("Sonarr support is not yet implemented");
          process.exit(1);
        }

        process.exit(0);
      } catch (error) {
        logger.error("Error:", formatError(error));
        process.exit(1);
      }
    }

    // No env vars and no command - show help
    showHelp();
    process.exit(1);
  }

  try {
    const config = await loadConfig(values.config);

    switch (command) {
      case "batch": {
        const limit = values.limit ? parseInt(values.limit, 10) : undefined;
        await batchCommand(config, {
          dryRun,
          ...(limit !== undefined && { limit }),
        });
        break;
      }

      case "search": {
        const tmdbId = positionals[1];
        if (!tmdbId) {
          logger.error("TMDB ID is required for search command");
          process.exit(1);
        }
        await searchCommand(config, parseInt(tmdbId, 10), { dryRun });
        break;
      }

      default:
        logger.error(`Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    logger.error("Error:", formatError(error));
    process.exit(1);
  }
}

void main();
