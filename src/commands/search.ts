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

  // Get available releases to find expected score
  logger.info("Fetching available releases...");
  const releases = await radarr.getReleases(movieId);

  if (releases.length === 0) {
    logger.warn("No releases found for this movie");
    return null;
  }

  // Find the best release (highest custom format score)
  const sortedReleases = releases
    .filter((r) => r.rejections.length === 0)
    .sort((a, b) => b.customFormatScore - a.customFormatScore);

  if (sortedReleases.length === 0) {
    logger.warn("No acceptable releases found (all rejected)");
    return null;
  }

  const bestRelease = sortedReleases[0];
  if (!bestRelease) {
    logger.warn("No best release found");
    return null;
  }

  const expectedScore = bestRelease.customFormatScore;
  logger.info(`Best available release score: ${expectedScore}`);
  logger.debug(`Best release: ${bestRelease.title}`);

  // Trigger search
  logger.info("Triggering movie search...");
  const command = await radarr.searchMovie(movieId);
  logger.info(`Search command started (ID: ${command.id})`);

  // Wait for search to complete
  logger.info("Waiting for search to complete...");
  await radarr.waitForCommand(command.id);
  logger.info("Search completed");

  // Poll queue until download completes
  logger.info("Monitoring download queue...");
  const actualScore = await waitForDownloadAndGetScore(radarr, movieId);

  if (actualScore === null) {
    logger.warn("Download did not complete or was not found in queue");
    return null;
  }

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
      quality: bestRelease.quality.quality.name,
      indexer: bestRelease.indexer,
    });
  }

  return result;
}

async function waitForDownloadAndGetScore(
  radarr: RadarrService,
  movieId: number,
  timeoutMs = 3600000, // 1 hour
  pollIntervalMs = 10000 // 10 seconds
): Promise<number | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const queue = await radarr.getQueue();
    const item = queue.records.find((r) => r.movieId === movieId);

    if (item) {
      logger.debug(
        `Download progress: ${item.status} - ${Math.round(((item.size - item.sizeleft) / item.size) * 100)}%`
      );

      if (
        item.trackedDownloadState === "importPending" ||
        item.trackedDownloadState === "imported"
      ) {
        logger.info("Download completed, checking imported score...");
        return item.customFormatScore;
      }

      if (item.trackedDownloadStatus === "warning") {
        logger.warn(`Download warning: ${item.status}`);
      }
    } else {
      // Item not in queue, check history
      const history = await radarr.getHistory(movieId);
      const imported = history.find((h) => h.eventType === "downloadFolderImported");

      if (imported) {
        logger.info("Found imported file in history");
        return imported.customFormatScore;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return null;
}
