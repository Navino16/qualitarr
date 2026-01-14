import type { Config } from "../types/index.js";
import type { RadarrEnvVars } from "../utils/env.js";
import {
  RadarrService,
  DiscordService,
  calculateScoreComparison,
  handleScoreResult,
} from "../services/index.js";
import { logger, findHistoryEvents } from "../utils/index.js";

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

  // Get grabbed event from history (expected score)
  const history = await radarr.getHistory(envVars.movieId);
  const { grabbed } = findHistoryEvents(history);

  if (!grabbed) {
    logger.warn("Could not find grabbed event in history, skipping");
    return;
  }

  // Get current file score (actual score)
  const movieFile = await radarr.getMovieFile(envVars.movieId);

  if (!movieFile) {
    logger.warn("Could not get movie file info, skipping");
    return;
  }

  // Calculate score comparison
  const comparison = calculateScoreComparison({
    expectedScore: grabbed.customFormatScore,
    actualScore: movieFile.customFormatScore,
    maxOverScore: config.quality.maxOverScore,
    maxUnderScore: config.quality.maxUnderScore,
  });

  logger.info(
    `Grabbed score: ${comparison.expectedScore} (${grabbed.sourceTitle})`
  );
  logger.info(`Current file score: ${comparison.actualScore}`);
  logger.info(`Difference: ${comparison.difference}`);

  // Handle result (apply tag, send notification)
  await handleScoreResult(
    {
      movie: { id: movie.id, title: movie.title, year: movie.year },
      quality: movieFile.quality.quality.name,
      comparison,
    },
    { tagConfig: config.tag, qualityConfig: config.quality },
    { radarr, discord }
  );
}
