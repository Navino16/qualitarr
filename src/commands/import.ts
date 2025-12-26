import type { Config } from "../types/index.js";
import type { RadarrEnvVars } from "../utils/env.js";
import { RadarrService, DiscordService } from "../services/index.js";
import { logger } from "../utils/index.js";

export async function importCommand(
  config: Config,
  envVars: RadarrEnvVars
): Promise<void> {
  if (!config.radarr) {
    throw new Error("Radarr is not configured");
  }

  logger.info(`Processing import for: ${envVars.movieTitle}`);

  const radarr = new RadarrService(config.radarr);
  const discord = new DiscordService(config.discord);

  // Get movie details
  const movie = await radarr.getMovie(envVars.movieId);

  // Get history to find grabbed and imported events
  const history = await radarr.getHistory(envVars.movieId);

  // Find the most recent grabbed event (expected score)
  const grabbed = history.find((h) => h.eventType === "grabbed");

  // Find the most recent imported event (actual score)
  const imported = history.find((h) => h.eventType === "downloadFolderImported");

  if (!grabbed) {
    logger.warn("Could not find grabbed event in history, skipping");
    return;
  }

  if (!imported) {
    logger.warn("Could not find imported event in history, skipping");
    return;
  }

  const expectedScore = grabbed.customFormatScore;
  const actualScore = imported.customFormatScore;
  const difference = actualScore - expectedScore;

  const toleranceValue =
    config.quality.tolerancePercent > 0
      ? (expectedScore * config.quality.tolerancePercent) / 100
      : 0;
  const withinTolerance = Math.abs(difference) <= toleranceValue;

  logger.info(`Grabbed score: ${expectedScore} (${grabbed.sourceTitle})`);
  logger.info(`Imported score: ${actualScore} (${imported.sourceTitle})`);
  logger.info(`Difference: ${difference}`);

  if (withinTolerance && difference === 0) {
    // Perfect match
    logger.info("Score matches expected value");
    if (config.tag.enabled) {
      const tag = await radarr.getOrCreateTag(config.tag.successTag);
      await radarr.addTagToMovie(movie, tag.id);
      logger.info(`Applied success tag: ${config.tag.successTag}`);
    }
  } else {
    // Mismatch
    logger.warn("Score mismatch detected");
    if (config.tag.enabled) {
      const tag = await radarr.getOrCreateTag(config.tag.mismatchTag);
      await radarr.addTagToMovie(movie, tag.id);
      logger.info(`Applied mismatch tag: ${config.tag.mismatchTag}`);
    }

    await discord.sendScoreMismatch({
      title: movie.title,
      year: movie.year,
      expectedScore,
      actualScore,
      difference,
      tolerancePercent: config.quality.tolerancePercent,
      quality: imported.quality.quality.name,
    });
  }
}
