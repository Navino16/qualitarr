import type { Config } from "../types/index.js";
import { RadarrService, DiscordService } from "../services/index.js";
import { logger, getVersion, formatError } from "../utils/index.js";

export interface HealthOptions {
  notify?: boolean;
}

export async function healthCommand(
  config: Config,
  options: HealthOptions = {}
): Promise<void> {
  const version = getVersion();
  logger.info(`Qualitarr v${version} - Health Check`);
  logger.info("---");

  // Radarr connectivity
  if (config.radarr) {
    logger.info("[Radarr] Testing connection...");
    try {
      const radarr = new RadarrService(config.radarr);
      const status = await radarr.getSystemStatus();
      logger.info(`[Radarr] Connected - Radarr v${status.version}`);

      const movies = await radarr.getMovies();
      logger.info(`[Radarr] Movie count: ${movies.length}`);
    } catch (error) {
      logger.error(`[Radarr] Connection failed: ${formatError(error)}`);
    }
  } else {
    logger.warn("[Radarr] Not configured");
  }

  // Discord webhook
  logger.info("---");
  if (config.discord.enabled && config.discord.webhookUrl) {
    const masked = maskWebhookUrl(config.discord.webhookUrl);
    logger.info(`[Discord] Enabled - Webhook: ${masked}`);

    if (options.notify) {
      logger.info("[Discord] Sending test notification...");
      try {
        const discord = new DiscordService(config.discord);
        await discord.sendScoreMismatch({
          title: "Health Check Test",
          expectedScore: 100,
          actualScore: 50,
          difference: -50,
          maxOverScore: 100,
          quality: "Bluray-1080p",
          indexer: "Test Indexer",
        });
        logger.info("[Discord] Test notification sent successfully");
      } catch (error) {
        logger.error(
          `[Discord] Failed to send test notification: ${formatError(error)}`
        );
      }
    }
  } else {
    logger.info("[Discord] Disabled");
  }

  // Configuration summary
  logger.info("---");
  logger.info("[Config] Quality thresholds:");
  logger.info(`  Max over score: ${config.quality.maxOverScore}`);
  logger.info(`  Max under score: ${config.quality.maxUnderScore}`);

  logger.info("[Config] Tags:");
  logger.info(`  Enabled: ${config.tag.enabled}`);
  if (config.tag.enabled) {
    logger.info(`  Success tag: ${config.tag.successTag}`);
    logger.info(`  Mismatch tag: ${config.tag.mismatchTag}`);
  }

  logger.info("[Config] Batch settings:");
  logger.info(
    `  Max concurrent downloads: ${config.batch.maxConcurrentDownloads}`
  );
  logger.info(`  Search interval: ${config.batch.searchIntervalSeconds}s`);
  logger.info(`  Download timeout: ${config.batch.downloadTimeoutMinutes}min`);
}

function maskWebhookUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/");
    // Discord webhook format: /api/webhooks/{id}/{token}
    const token = parts[parts.length - 1];
    if (token && token.length > 8) {
      const masked = token.slice(0, 4) + "..." + token.slice(-4);
      parts[parts.length - 1] = masked;
      parsed.pathname = parts.join("/");
      return parsed.toString();
    }
    return url;
  } catch {
    return "***";
  }
}
