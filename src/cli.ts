#!/usr/bin/env node

import { parseArgs } from "node:util";
import { loadConfig, logger, setLogLevel, parseArrEnv, isImportEvent } from "./utils/index.js";
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
  search <movie-id>    Search for a specific movie and monitor quality

Options:
  -c, --config <path>  Path to config file (default: ./config.yaml)
  -v, --verbose        Enable verbose logging
  -h, --help           Show this help message
      --version        Show version

Examples:
  # As Radarr/Sonarr Custom Script (auto-detect mode):
  qualitarr

  # Batch mode - process all unchecked movies:
  qualitarr batch

  # Manual search for a specific movie:
  qualitarr search 123

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

  const command = positionals[0];

  // Auto-detect mode: check for Radarr/Sonarr environment variables
  if (!command) {
    const envVars = parseArrEnv();

    if (envVars) {
      logger.info(`Detected ${envVars.type} event: ${envVars.eventType}`);

      if (!isImportEvent(envVars)) {
        logger.debug(`Event type ${envVars.eventType} is not an import event, skipping`);
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
        logger.error(
          "Error:",
          error instanceof Error ? error.message : String(error)
        );
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
        await batchCommand(config);
        break;
      }

      case "search": {
        const movieId = positionals[1];
        if (!movieId) {
          logger.error("Movie ID is required for search command");
          process.exit(1);
        }
        await searchCommand(config, parseInt(movieId, 10));
        break;
      }

      default:
        logger.error(`Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    logger.error(
      "Error:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

main();
