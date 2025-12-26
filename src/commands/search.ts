import type { Config } from "../types/index.js";
import { RadarrService, DiscordService } from "../services/index.js";
import { logger } from "../utils/index.js";

interface SearchResult {
  movie: {
    id: number;
    title: string;
    year: number;
  };
  expectedScore: number;
  actualScore: number;
  difference: number;
  withinTolerance: boolean;
  tagApplied: string | null;
}

export async function searchCommand(
  config: Config,
  movieId: number
): Promise<SearchResult | null> {
  if (!config.radarr) {
    throw new Error("Radarr is not configured");
  }

  const radarr = new RadarrService(config.radarr);
  const discord = new DiscordService(config.discord);

  // Get movie details
  logger.info(`Fetching movie details for ID: ${movieId}`);
  const movie = await radarr.getMovie(movieId);
  logger.info(`Found movie: ${movie.title} (${movie.year})`);

  // Trigger search
  logger.info("Triggering movie search...");
  const command = await radarr.searchMovie(movieId);
  logger.info(`Search command started (ID: ${command.id})`);

  // Wait for search to complete
  logger.info("Waiting for search to complete...");
  await radarr.waitForCommand(command.id);
  logger.info("Search completed");

  // Wait for grabbed event
  logger.info("Waiting for grab...");
  const grabbed = await waitForHistoryEvent(radarr, movieId, "grabbed");

  if (!grabbed) {
    logger.warn("No grab detected, movie may not have been found");
    return null;
  }

  const expectedScore = grabbed.customFormatScore;
  logger.info(`Grabbed: ${grabbed.sourceTitle} (score: ${expectedScore})`);

  // Wait for import
  logger.info("Waiting for download and import...");
  const imported = await waitForHistoryEvent(
    radarr,
    movieId,
    "downloadFolderImported",
    3600000 // 1 hour timeout for download
  );

  if (!imported) {
    logger.warn("Download did not complete or import failed");
    return null;
  }

  const actualScore = imported.customFormatScore;
  logger.info(`Imported: ${imported.sourceTitle} (score: ${actualScore})`);

  // Calculate difference
  const difference = actualScore - expectedScore;
  const tolerancePercent = config.quality.tolerancePercent;
  const toleranceValue =
    tolerancePercent > 0 ? (expectedScore * tolerancePercent) / 100 : 0;
  const withinTolerance = Math.abs(difference) <= toleranceValue;

  logger.info(`Expected score: ${expectedScore}`);
  logger.info(`Actual score: ${actualScore}`);
  logger.info(`Difference: ${difference}`);

  const result: SearchResult = {
    movie: {
      id: movie.id,
      title: movie.title,
      year: movie.year,
    },
    expectedScore,
    actualScore,
    difference,
    withinTolerance,
    tagApplied: null,
  };

  if (withinTolerance && difference === 0) {
    // Perfect match - apply success tag
    logger.info("Score matches expected value");
    if (config.tag.enabled) {
      const tag = await radarr.getOrCreateTag(config.tag.successTag);
      await radarr.addTagToMovie(movie, tag.id);
      result.tagApplied = config.tag.successTag;
      logger.info(`Applied success tag: ${config.tag.successTag}`);
    }
  } else {
    // Mismatch - apply mismatch tag and notify
    logger.warn("Score mismatch detected");
    if (config.tag.enabled) {
      const tag = await radarr.getOrCreateTag(config.tag.mismatchTag);
      await radarr.addTagToMovie(movie, tag.id);
      result.tagApplied = config.tag.mismatchTag;
      logger.info(`Applied mismatch tag: ${config.tag.mismatchTag}`);
    }

    await discord.sendScoreMismatch({
      title: movie.title,
      year: movie.year,
      expectedScore,
      actualScore,
      difference,
      tolerancePercent,
      quality: imported.quality.quality.name,
    });
  }

  return result;
}

async function waitForHistoryEvent(
  radarr: RadarrService,
  movieId: number,
  eventType: string,
  timeoutMs = 60000,
  pollIntervalMs = 5000
): Promise<{ sourceTitle: string; customFormatScore: number; quality: { quality: { name: string } } } | null> {
  const startTime = Date.now();
  const initialHistory = await radarr.getHistory(movieId);
  const initialEventIds = new Set(initialHistory.map((h) => h.id));

  while (Date.now() - startTime < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    const history = await radarr.getHistory(movieId);
    const newEvent = history.find(
      (h) => h.eventType === eventType && !initialEventIds.has(h.id)
    );

    if (newEvent) {
      return newEvent;
    }
  }

  return null;
}
