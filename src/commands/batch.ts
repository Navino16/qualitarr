import type { Config } from "../types/index.js";
import { QueueManager } from "../services/queue.js";
import { logger } from "../utils/index.js";

export async function batchCommand(config: Config): Promise<void> {
  logger.info("Starting batch mode...");

  const queueManager = new QueueManager(config);

  const count = await queueManager.loadMoviesWithoutTag();

  if (count === 0) {
    logger.info("No movies to process");
    return;
  }

  await queueManager.run();

  logger.info("Batch mode completed");
}
