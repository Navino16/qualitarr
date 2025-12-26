import type { Config, BatchConfig } from "../types/index.js";
import type { RadarrMovie, RadarrRelease } from "../types/radarr.js";
import { RadarrService } from "./radarr.js";
import { DiscordService } from "./discord.js";
import { logger } from "../utils/index.js";

export interface QueueItem {
  id: number;
  title: string;
  year: number;
  expectedScore: number;
  bestRelease: RadarrRelease;
  status: "pending" | "searching" | "downloading" | "completed" | "failed";
  error?: string;
  startedAt?: Date;
}

export class QueueManager {
  private searchQueue: QueueItem[] = [];
  private downloadQueue: QueueItem[] = [];
  private config: Config;
  private batchConfig: BatchConfig;
  private radarr: RadarrService;
  private discord: DiscordService;
  private isRunning = false;

  constructor(config: Config) {
    if (!config.radarr) {
      throw new Error("Radarr configuration is required");
    }

    this.config = config;
    this.batchConfig = config.batch;
    this.radarr = new RadarrService(config.radarr);
    this.discord = new DiscordService(config.discord);
  }

  async loadMoviesWithoutTag(): Promise<number> {
    logger.info("Loading movies without success tag...");

    const [movies, tags] = await Promise.all([
      this.radarr.getMovies(),
      this.radarr.getTags(),
    ]);

    const successTag = tags.find(
      (t) => t.label.toLowerCase() === this.config.tag.successTag.toLowerCase()
    );
    const mismatchTag = tags.find(
      (t) => t.label.toLowerCase() === this.config.tag.mismatchTag.toLowerCase()
    );

    const excludeTagIds = [successTag?.id, mismatchTag?.id].filter(
      (id): id is number => id !== undefined
    );

    const eligibleMovies = movies.filter(
      (m) =>
        m.monitored &&
        !m.tags.some((tagId) => excludeTagIds.includes(tagId))
    );

    logger.info(`Found ${eligibleMovies.length} movies to process`);

    for (const movie of eligibleMovies) {
      await this.addToSearchQueue(movie);
    }

    return eligibleMovies.length;
  }

  private async addToSearchQueue(movie: RadarrMovie): Promise<void> {
    // Get releases to find expected score
    const releases = await this.radarr.getReleases(movie.id);
    const acceptableReleases = releases.filter((r) => r.rejections.length === 0);

    if (acceptableReleases.length === 0) {
      logger.debug(`No acceptable releases for ${movie.title}, skipping`);
      return;
    }

    const bestRelease = acceptableReleases.sort(
      (a, b) => b.customFormatScore - a.customFormatScore
    )[0];

    if (!bestRelease) {
      return;
    }

    const item: QueueItem = {
      id: movie.id,
      title: movie.title,
      year: movie.year,
      expectedScore: bestRelease.customFormatScore,
      bestRelease,
      status: "pending",
    };

    this.searchQueue.push(item);
    logger.debug(`Added ${movie.title} to search queue (expected score: ${bestRelease.customFormatScore})`);
  }

  async run(): Promise<void> {
    if (this.isRunning) {
      logger.warn("Queue manager is already running");
      return;
    }

    this.isRunning = true;
    logger.info("Starting queue manager...");

    // Start download monitor in background
    const downloadMonitorPromise = this.monitorDownloads();

    // Process search queue
    await this.processSearchQueue();

    // Wait for all downloads to complete
    await this.waitForDownloadsToComplete();

    // Stop monitoring
    this.isRunning = false;
    await downloadMonitorPromise;

    logger.info("Queue manager finished");
    this.printSummary();
  }

  private async processSearchQueue(): Promise<void> {
    while (this.searchQueue.length > 0 && this.isRunning) {
      // Wait if download queue is full
      if (this.downloadQueue.length >= this.batchConfig.maxConcurrentDownloads) {
        logger.debug(
          `Download queue full (${this.downloadQueue.length}/${this.batchConfig.maxConcurrentDownloads}), waiting...`
        );
        await this.sleep(this.batchConfig.searchIntervalSeconds * 1000);
        continue;
      }

      const item = this.searchQueue.shift();
      if (!item) continue;

      try {
        await this.searchItem(item);
      } catch (error) {
        item.status = "failed";
        item.error = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to search ${item.title}: ${item.error}`);
      }

      // Wait before next search
      if (this.searchQueue.length > 0) {
        logger.debug(`Waiting ${this.batchConfig.searchIntervalSeconds}s before next search...`);
        await this.sleep(this.batchConfig.searchIntervalSeconds * 1000);
      }
    }
  }

  private async searchItem(item: QueueItem): Promise<void> {
    logger.info(`Searching for: ${item.title} (${item.year})`);
    item.status = "searching";

    const command = await this.radarr.searchMovie(item.id);
    await this.radarr.waitForCommand(command.id, 60000); // 1 min timeout for search

    item.status = "downloading";
    item.startedAt = new Date();
    this.downloadQueue.push(item);

    logger.info(`Search completed for ${item.title}, moved to download queue`);
  }

  private async monitorDownloads(): Promise<void> {
    const timeoutMs = this.batchConfig.downloadTimeoutMinutes * 60 * 1000;

    while (this.isRunning || this.downloadQueue.length > 0) {
      for (const item of [...this.downloadQueue]) {
        if (item.status !== "downloading") continue;

        try {
          const completed = await this.checkDownloadComplete(item);
          if (completed) {
            await this.processCompletedDownload(item);
          } else if (this.isTimedOut(item, timeoutMs)) {
            item.status = "failed";
            item.error = "Download timed out";
            logger.warn(`Download timed out for ${item.title}`);
            this.removeFromDownloadQueue(item);
          }
        } catch (error) {
          item.status = "failed";
          item.error = error instanceof Error ? error.message : String(error);
          logger.error(`Error checking download for ${item.title}: ${item.error}`);
          this.removeFromDownloadQueue(item);
        }
      }

      await this.sleep(this.batchConfig.downloadCheckIntervalSeconds * 1000);
    }
  }

  private async checkDownloadComplete(item: QueueItem): Promise<boolean> {
    const queue = await this.radarr.getQueue();
    const queueItem = queue.records.find((r) => r.movieId === item.id);

    if (queueItem) {
      const progress = ((queueItem.size - queueItem.sizeleft) / queueItem.size) * 100;
      logger.debug(`${item.title}: ${progress.toFixed(1)}% downloaded`);

      return (
        queueItem.trackedDownloadState === "importPending" ||
        queueItem.trackedDownloadState === "imported"
      );
    }

    // Not in queue, check history
    const history = await this.radarr.getHistory(item.id);
    return history.some((h) => h.eventType === "downloadFolderImported");
  }

  private async processCompletedDownload(item: QueueItem): Promise<void> {
    logger.info(`Download completed for ${item.title}, checking score...`);

    const history = await this.radarr.getHistory(item.id);
    const imported = history.find((h) => h.eventType === "downloadFolderImported");

    if (!imported) {
      item.status = "failed";
      item.error = "Could not find imported file in history";
      this.removeFromDownloadQueue(item);
      return;
    }

    const actualScore = imported.customFormatScore;
    const difference = actualScore - item.expectedScore;
    const toleranceValue =
      this.config.quality.tolerancePercent > 0
        ? (item.expectedScore * this.config.quality.tolerancePercent) / 100
        : 0;
    const withinTolerance = Math.abs(difference) <= toleranceValue;

    logger.info(`${item.title}: Expected=${item.expectedScore}, Actual=${actualScore}, Diff=${difference}`);

    const movie = await this.radarr.getMovie(item.id);

    if (withinTolerance && difference === 0) {
      // Perfect match - apply success tag
      if (this.config.tag.enabled) {
        const tag = await this.radarr.getOrCreateTag(this.config.tag.successTag);
        await this.radarr.addTagToMovie(movie, tag.id);
        logger.info(`Applied success tag to ${item.title}`);
      }
    } else {
      // Mismatch - apply mismatch tag and notify
      if (this.config.tag.enabled) {
        const tag = await this.radarr.getOrCreateTag(this.config.tag.mismatchTag);
        await this.radarr.addTagToMovie(movie, tag.id);
        logger.info(`Applied mismatch tag to ${item.title}`);
      }

      await this.discord.sendScoreMismatch({
        title: item.title,
        year: item.year,
        expectedScore: item.expectedScore,
        actualScore,
        difference,
        tolerancePercent: this.config.quality.tolerancePercent,
        quality: item.bestRelease.quality.quality.name,
        indexer: item.bestRelease.indexer,
      });
    }

    item.status = "completed";
    this.removeFromDownloadQueue(item);
  }

  private isTimedOut(item: QueueItem, timeoutMs: number): boolean {
    if (!item.startedAt) return false;
    return Date.now() - item.startedAt.getTime() > timeoutMs;
  }

  private removeFromDownloadQueue(item: QueueItem): void {
    const index = this.downloadQueue.indexOf(item);
    if (index > -1) {
      this.downloadQueue.splice(index, 1);
    }
  }

  private async waitForDownloadsToComplete(): Promise<void> {
    while (this.downloadQueue.length > 0) {
      logger.debug(`Waiting for ${this.downloadQueue.length} downloads to complete...`);
      await this.sleep(5000);
    }
  }

  private printSummary(): void {
    const allItems = [...this.searchQueue, ...this.downloadQueue];
    const completed = allItems.filter((i) => i.status === "completed").length;
    const failed = allItems.filter((i) => i.status === "failed").length;

    logger.info("=== Summary ===");
    logger.info(`Completed: ${completed}`);
    logger.info(`Failed: ${failed}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
