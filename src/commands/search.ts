import type { Config } from "../types/index.js";
import {
  RadarrService,
  DiscordService,
  calculateScoreComparison,
  handleScoreResult,
  logScoreComparison,
  logDryRunResult,
} from "../services/index.js";
import {
  logger,
  findHistoryEvents,
  waitForHistoryEvent,
  HISTORY_EVENT_TYPES,
} from "../utils/index.js";

export interface SearchOptions {
  dryRun?: boolean;
}

interface SearchResult {
  movie: {
    id: number;
    title: string;
    year: number;
  };
  expectedScore: number;
  actualScore: number;
  difference: number;
  isAcceptable: boolean;
  tagApplied: string | null;
}

export async function searchCommand(
  config: Config,
  tmdbId: number,
  options: SearchOptions = {}
): Promise<SearchResult | null> {
  const { dryRun = false } = options;

  if (!config.radarr) {
    throw new Error("Radarr is not configured");
  }

  const radarr = new RadarrService(config.radarr);
  const discord = new DiscordService(config.discord);

  // Get movie details by TMDB ID
  logger.info(`Fetching movie details for TMDB ID: ${tmdbId}`);
  const movie = await radarr.getMovieByTmdbId(tmdbId);

  if (!movie) {
    throw new Error(`Movie with TMDB ID ${tmdbId} not found in Radarr`);
  }

  logger.info(`Found movie: ${movie.title} (${movie.year})`);

  if (dryRun) {
    return handleDryRunMode(radarr, movie, config);
  }

  return handleRealMode(radarr, discord, movie, config);
}

async function handleDryRunMode(
  radarr: RadarrService,
  movie: { id: number; title: string; year: number; hasFile: boolean },
  config: Config
): Promise<SearchResult | null> {
  logger.info("[DRY-RUN] Would trigger search for this movie");

  // Get grabbed event from history (expected score)
  const history = await radarr.getHistory(movie.id);
  const { grabbed } = findHistoryEvents(history);

  if (!grabbed) {
    logger.info("[DRY-RUN] No grabbed event found in history");
    logger.info("[DRY-RUN] In real mode, would search and wait for download");
    return null;
  }

  // Get current file score (actual score)
  if (!movie.hasFile) {
    logger.info("[DRY-RUN] Movie has no file yet");
    logger.info("[DRY-RUN] In real mode, would search and wait for download");
    return null;
  }

  const movieFile = await radarr.getMovieFile(movie.id);

  if (!movieFile) {
    logger.info("[DRY-RUN] Could not get movie file info");
    return null;
  }

  const comparison = calculateScoreComparison({
    expectedScore: grabbed.customFormatScore,
    actualScore: movieFile.customFormatScore,
    maxOverScore: config.quality.maxOverScore,
    maxUnderScore: config.quality.maxUnderScore,
  });

  logger.info(`[DRY-RUN] Grabbed score: ${comparison.expectedScore}`);
  logger.info(`[DRY-RUN] Current file score: ${comparison.actualScore}`);
  logScoreComparison(comparison, "[DRY-RUN]");
  logDryRunResult(comparison, config.tag);

  return {
    movie: { id: movie.id, title: movie.title, year: movie.year },
    expectedScore: comparison.expectedScore,
    actualScore: comparison.actualScore,
    difference: comparison.difference,
    isAcceptable: comparison.isAcceptable,
    tagApplied: null,
  };
}

async function handleRealMode(
  radarr: RadarrService,
  discord: DiscordService,
  movie: { id: number; title: string; year: number; tags: number[] },
  config: Config
): Promise<SearchResult | null> {
  // Trigger search
  logger.info("Triggering movie search...");
  const command = await radarr.searchMovie(movie.id);
  logger.info(`Search command started (ID: ${command.id})`);

  // Wait for search to complete
  logger.info("Waiting for search to complete...");
  await radarr.waitForCommand(command.id);
  logger.info("Search completed");

  // Wait for grabbed event
  logger.info("Waiting for grab...");
  const grabbed = await waitForHistoryEvent(
    () => radarr.getHistory(movie.id),
    HISTORY_EVENT_TYPES.GRABBED,
    { timeoutMs: 60000, pollIntervalMs: 5000 }
  );

  if (!grabbed) {
    // No new grab - compare current file with last grabbed event from history
    logger.info("No new grab detected, checking against previous grab...");

    const history = await radarr.getHistory(movie.id);
    const { grabbed: lastGrabbed } = findHistoryEvents(history);

    if (!lastGrabbed) {
      // No grabbed event at all - consider OK
      logger.info("No grab history found, marking as OK");

      if (config.tag.enabled) {
        const tag = await radarr.getOrCreateTag(config.tag.successTag);
        const fullMovie = await radarr.getMovie(movie.id);
        await radarr.addTagToMovie(fullMovie, tag.id);
        logger.info(`Applied success tag: ${config.tag.successTag}`);
      }

      return {
        movie: { id: movie.id, title: movie.title, year: movie.year },
        expectedScore: 0,
        actualScore: 0,
        difference: 0,
        isAcceptable: true,
        tagApplied: config.tag.enabled ? config.tag.successTag : null,
      };
    }

    // Compare current file with last grabbed score
    const movieFile = await radarr.getMovieFile(movie.id);

    if (!movieFile) {
      logger.warn("No movie file found");
      return null;
    }

    const comparison = calculateScoreComparison({
      expectedScore: lastGrabbed.customFormatScore,
      actualScore: movieFile.customFormatScore,
      maxOverScore: config.quality.maxOverScore,
      maxUnderScore: config.quality.maxUnderScore,
    });

    logScoreComparison(comparison);

    const resultOutput = await handleScoreResult(
      {
        movie: { id: movie.id, title: movie.title, year: movie.year },
        quality: movieFile.quality.quality.name,
        comparison,
      },
      { tagConfig: config.tag, qualityConfig: config.quality },
      { radarr, discord }
    );

    return {
      movie: { id: movie.id, title: movie.title, year: movie.year },
      expectedScore: comparison.expectedScore,
      actualScore: comparison.actualScore,
      difference: comparison.difference,
      isAcceptable: comparison.isAcceptable,
      tagApplied: resultOutput.tagApplied,
    };
  }

  logger.info(`Grabbed: ${grabbed.sourceTitle} (score: ${grabbed.customFormatScore})`);

  // Wait for import
  logger.info("Waiting for download and import...");
  await waitForHistoryEvent(
    () => radarr.getHistory(movie.id),
    HISTORY_EVENT_TYPES.IMPORTED,
    { timeoutMs: 3600000, pollIntervalMs: 5000 } // 1 hour timeout
  );

  // Get current file score (actual score after import and potential renames)
  const movieFile = await radarr.getMovieFile(movie.id);

  if (!movieFile) {
    logger.warn("Could not get movie file info after import");
    return null;
  }

  logger.info(`Current file score: ${movieFile.customFormatScore}`);

  // Calculate comparison using grabbed score vs current file score
  const comparison = calculateScoreComparison({
    expectedScore: grabbed.customFormatScore,
    actualScore: movieFile.customFormatScore,
    maxOverScore: config.quality.maxOverScore,
    maxUnderScore: config.quality.maxUnderScore,
  });

  logScoreComparison(comparison);

  // Handle result
  const resultOutput = await handleScoreResult(
    {
      movie: { id: movie.id, title: movie.title, year: movie.year },
      quality: movieFile.quality.quality.name,
      comparison,
    },
    { tagConfig: config.tag, qualityConfig: config.quality },
    { radarr, discord }
  );

  return {
    movie: { id: movie.id, title: movie.title, year: movie.year },
    expectedScore: comparison.expectedScore,
    actualScore: comparison.actualScore,
    difference: comparison.difference,
    isAcceptable: comparison.isAcceptable,
    tagApplied: resultOutput.tagApplied,
  };
}