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

  // Get history to find the imported file score
  const history = await radarr.getHistory(envVars.movieId);
  const imported = history.find((h) => h.eventType === "downloadFolderImported");

  if (!imported) {
    logger.warn("Could not find imported file in history, skipping");
    return;
  }

  const actualScore = imported.customFormatScore;

  // Get releases to find expected score
  const releases = await radarr.getReleases(envVars.movieId);
  const acceptableReleases = releases.filter((r) => r.rejections.length === 0);

  if (acceptableReleases.length === 0) {
    logger.warn("No acceptable releases found, cannot determine expected score");
    // Apply success tag since we can't compare
    if (config.tag.enabled) {
      const tag = await radarr.getOrCreateTag(config.tag.successTag);
      await radarr.addTagToMovie(movie, tag.id);
    }
    return;
  }

  const bestRelease = acceptableReleases.sort(
    (a, b) => b.customFormatScore - a.customFormatScore
  )[0];

  if (!bestRelease) {
    return;
  }

  const expectedScore = bestRelease.customFormatScore;
  const difference = actualScore - expectedScore;
  const toleranceValue =
    config.quality.tolerancePercent > 0
      ? (expectedScore * config.quality.tolerancePercent) / 100
      : 0;
  const withinTolerance = Math.abs(difference) <= toleranceValue;

  logger.info(`Expected: ${expectedScore}, Actual: ${actualScore}, Diff: ${difference}`);

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
      quality: bestRelease.quality.quality.name,
      indexer: bestRelease.indexer,
    });
  }
}
