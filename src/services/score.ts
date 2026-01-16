import type { TagConfig, QualityConfig } from "../types/config.js";
import type {
  ScoreComparisonInput,
  ScoreComparisonResult,
  ScoreResultContext,
  ScoreResultServices,
} from "../types/score.js";
import { logger } from "../utils/logger.js";

/**
 * Calculate score comparison between expected (grabbed) and actual (current file) scores
 *
 * Logic:
 * - Acceptable if the actual score is between (expectedScore - maxUnderScore) and (expectedScore + maxOverScore)
 * - Mismatch if the actual score is below minAllowedScore OR above maxAllowedScore
 */
export function calculateScoreComparison(
  input: ScoreComparisonInput
): ScoreComparisonResult {
  const { expectedScore, actualScore, maxOverScore, maxUnderScore } = input;

  const difference = actualScore - expectedScore;
  const minAllowedScore = expectedScore - maxUnderScore;
  const maxAllowedScore = expectedScore + maxOverScore;
  const isAcceptable =
    actualScore >= minAllowedScore && actualScore <= maxAllowedScore;

  return {
    expectedScore,
    actualScore,
    difference,
    minAllowedScore,
    maxAllowedScore,
    isAcceptable,
  };
}

/**
 * Configuration for handling score results
 */
export interface HandleScoreResultConfig {
  tagConfig: TagConfig;
  qualityConfig: QualityConfig;
}

/**
 * Result of handling a score comparison
 */
export interface HandleScoreResultOutput {
  tagApplied: string | null;
  notificationSent: boolean;
}

/**
 * Handle the result of a score comparison:
 * - Apply appropriate tag (success or mismatch)
 * - Send Discord notification for mismatches
 */
export async function handleScoreResult(
  context: ScoreResultContext,
  config: HandleScoreResultConfig,
  services: ScoreResultServices
): Promise<HandleScoreResultOutput> {
  const { movie, quality, comparison } = context;
  const { tagConfig, qualityConfig } = config;
  const { radarr, discord } = services;

  const output: HandleScoreResultOutput = {
    tagApplied: null,
    notificationSent: false,
  };

  // Fetch full movie object for tagging
  const fullMovie = await radarr.getMovie(movie.id);

  if (comparison.isAcceptable) {
    // Score is acceptable - apply success tag
    logger.info("Score is acceptable");
    if (tagConfig.enabled) {
      const tag = await radarr.getOrCreateTag(tagConfig.successTag);
      await radarr.addTagToMovie(fullMovie, tag.id);
      output.tagApplied = tagConfig.successTag;
      logger.info(`Applied success tag: ${tagConfig.successTag}`);
    }
  } else {
    // Mismatch - apply mismatch tag and notify
    logger.warn("Score mismatch detected");
    if (tagConfig.enabled) {
      const tag = await radarr.getOrCreateTag(tagConfig.mismatchTag);
      await radarr.addTagToMovie(fullMovie, tag.id);
      output.tagApplied = tagConfig.mismatchTag;
      logger.info(`Applied mismatch tag: ${tagConfig.mismatchTag}`);
    }

    try {
      await discord.sendScoreMismatch({
        title: movie.title,
        year: movie.year,
        expectedScore: comparison.expectedScore,
        actualScore: comparison.actualScore,
        difference: comparison.difference,
        maxOverScore: qualityConfig.maxOverScore,
        quality,
      });
      output.notificationSent = true;
    } catch (error) {
      // Discord notification failure should not fail the entire operation
      logger.error(
        `Failed to send Discord notification for ${movie.title}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  return output;
}

/**
 * Compare scores using quality config thresholds.
 * Convenience wrapper around calculateScoreComparison that extracts thresholds from config.
 */
export function compareScores(
  expectedScore: number,
  actualScore: number,
  qualityConfig: QualityConfig
): ScoreComparisonResult {
  return calculateScoreComparison({
    expectedScore,
    actualScore,
    maxOverScore: qualityConfig.maxOverScore,
    maxUnderScore: qualityConfig.maxUnderScore,
  });
}

/**
 * Log a one-line score comparison summary
 */
export function logScoreSummary(
  title: string,
  comparison: ScoreComparisonResult
): void {
  logger.info(
    `${title}: Grabbed=${comparison.expectedScore}, Current=${comparison.actualScore}, Diff=${comparison.difference}`
  );
}

/**
 * Log score comparison results (for both dry-run and real modes)
 */
export function logScoreComparison(
  comparison: ScoreComparisonResult,
  prefix = ""
): void {
  const p = prefix ? `${prefix} ` : "";
  logger.info(`${p}Expected score: ${comparison.expectedScore}`);
  logger.info(`${p}Actual score: ${comparison.actualScore}`);
  logger.info(`${p}Difference: ${comparison.difference}`);
  logger.info(
    `${p}Allowed range: [${comparison.minAllowedScore}, ${comparison.maxAllowedScore}]`
  );
}

/**
 * Log what would happen in dry-run mode
 */
export function logDryRunResult(
  comparison: ScoreComparisonResult,
  tagConfig: TagConfig
): void {
  if (comparison.isAcceptable) {
    logger.info(`[DRY-RUN] Would apply success tag: ${tagConfig.successTag}`);
  } else {
    logger.info(`[DRY-RUN] Would apply mismatch tag: ${tagConfig.mismatchTag}`);
    logger.info("[DRY-RUN] Would send Discord notification");
  }
}
