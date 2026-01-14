import type { Config } from "../types/index.js";
import { QueueManager } from "../services/queue.js";
import { logger } from "../utils/index.js";

export interface BatchOptions {
  dryRun?: boolean;
  limit?: number;
}

export async function batchCommand(
  config: Config,
  options: BatchOptions = {}
): Promise<void> {
  const { dryRun = false, limit } = options;

  logger.info("Starting batch mode...");

  const queueManager = new QueueManager(config, { dryRun });

  const count = await queueManager.loadMoviesWithoutTag(limit);

  if (count === 0) {
    logger.info("No movies to process");
    return;
  }

  await queueManager.run();

  logger.info("Batch mode completed");
}
