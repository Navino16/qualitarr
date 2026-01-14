import type { Config, BatchConfig } from "../types/index.js";
import type { RadarrMovie, RadarrHistory } from "../types/radarr.js";
import { RadarrService } from "./radarr.js";
import { DiscordService } from "./discord.js";
import {
  calculateScoreComparison,
  handleScoreResult,
  logDryRunResult,
} from "./score.js";
import { logger, findHistoryEvents } from "../utils/index.js";

export interface QueueManagerOptions {
  dryRun?: boolean;
}

export interface QueueItem {
  id: number;
  title: string;
  year: number;
  hasFile: boolean;
  status: "pending" | "searching" | "downloading" | "completed" | "failed";
  grabbedEvent?: RadarrHistory;
  initialHistoryIds: Set<number>;
  error?: string;
  startedAt?: Date;
}

export class QueueManager {
  private searchQueue: QueueItem[] = [];
  private downloadQueue: QueueItem[] = [];
  private completedItems: QueueItem[] = [];
  private config: Config;
  private batchConfig: BatchConfig;
  private radarr: RadarrService;
  private discord: DiscordService;
  private isRunning = false;
  private dryRun: boolean;

  constructor(config: Config, options: QueueManagerOptions = {}) {
    if (!config.radarr) {
      throw new Error("Radarr configuration is required");
    }

    this.config = config;
    this.batchConfig = config.batch;
    this.radarr = new RadarrService(config.radarr);
    this.discord = new DiscordService(config.discord);
    this.dryRun = options.dryRun ?? false;
  }

  async loadMoviesWithoutTag(limit?: number): Promise<number> {
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

    let eligibleMovies = movies.filter(
      (m) =>
        m.monitored && !m.tags.some((tagId) => excludeTagIds.includes(tagId))
    );

    if (limit && limit > 0) {
      logger.info(
        `Limiting to ${limit} movies (${eligibleMovies.length} eligible)`
      );
      eligibleMovies = eligibleMovies.slice(0, limit);
    }

    logger.info(`Processing ${eligibleMovies.length} movies`);

    for (const movie of eligibleMovies) {
      await this.addToSearchQueue(movie);
    }

    return eligibleMovies.length;
  }

  private async addToSearchQueue(movie: RadarrMovie): Promise<void> {
    // Get current history to track new events later
    const history = await this.radarr.getHistory(movie.id);
    const initialHistoryIds = new Set(history.map((h) => h.id));

    const item: QueueItem = {
      id: movie.id,
      title: movie.title,
      year: movie.year,
      hasFile: movie.hasFile,
      status: "pending",
      initialHistoryIds,
    };

    this.searchQueue.push(item);
    logger.debug(`Added ${movie.title} to search queue`);
  }

  async run(): Promise<void> {
    if (this.isRunning) {
      logger.warn("Queue manager is already running");
      return;
    }

    this.isRunning = true;
    logger.info("Starting queue manager...");

    if (this.dryRun) {
      await this.runDryMode();
    } else {
      // Start download monitor in background
      const downloadMonitorPromise = this.monitorDownloads();

      // Process search queue
      await this.processSearchQueue();

      // Wait for all downloads to complete
      await this.waitForDownloadsToComplete();

      // Stop monitoring
      this.isRunning = false;
      await downloadMonitorPromise;
    }

    logger.info("Queue manager finished");
    this.printSummary();
  }

  private async runDryMode(): Promise<void> {
    logger.info("[DRY-RUN] Analyzing movies from search queue...");

    for (const item of this.searchQueue) {
      logger.info(`[DRY-RUN] Processing: ${item.title} (${item.year})`);

      // Get grabbed event from history
      const history = await this.radarr.getHistory(item.id);
      const { grabbed } = findHistoryEvents(history);

      if (!grabbed) {
        logger.info(`[DRY-RUN]   No grabbed event found in history`);
        logger.info(`[DRY-RUN]   Would trigger search and wait for download`);
        item.status = "completed";
        this.completedItems.push(item);
        continue;
      }

      // Get current file score
      if (!item.hasFile) {
        logger.info(`[DRY-RUN]   Movie has no file yet`);
        logger.info(`[DRY-RUN]   Would trigger search and wait for download`);
        item.status = "completed";
        this.completedItems.push(item);
        continue;
      }

      const movieFile = await this.radarr.getMovieFile(item.id);

      if (!movieFile) {
        logger.info(`[DRY-RUN]   Could not get movie file info`);
        item.status = "completed";
        this.completedItems.push(item);
        continue;
      }

      const comparison = calculateScoreComparison({
        expectedScore: grabbed.customFormatScore,
        actualScore: movieFile.customFormatScore,
        maxOverScore: this.config.quality.maxOverScore,
        maxUnderScore: this.config.quality.maxUnderScore,
      });

      logger.info(`[DRY-RUN]   Grabbed score: ${comparison.expectedScore}`);
      logger.info(`[DRY-RUN]   Current file score: ${comparison.actualScore}`);
      logger.info(`[DRY-RUN]   Difference: ${comparison.difference}`);

      logDryRunResult(comparison, this.config.tag);

      item.status = "completed";
      this.completedItems.push(item);
    }

    this.searchQueue = [];
    this.isRunning = false;
  }

  private async processSearchQueue(): Promise<void> {
    while (this.searchQueue.length > 0 && this.isRunning) {
      // Wait if download queue is full
      if (
        this.downloadQueue.length >= this.batchConfig.maxConcurrentDownloads
      ) {
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
        this.completedItems.push(item);
      }

      // Wait before next search
      if (this.searchQueue.length > 0) {
        logger.debug(
          `Waiting ${this.batchConfig.searchIntervalSeconds}s before next search...`
        );
        await this.sleep(this.batchConfig.searchIntervalSeconds * 1000);
      }
    }
  }

  private async searchItem(item: QueueItem): Promise<void> {
    logger.info(`Searching for: ${item.title} (${item.year})`);
    item.status = "searching";

    const command = await this.radarr.searchMovie(item.id);
    await this.radarr.waitForCommand(command.id, 60000); // 1 min timeout for search

    // Wait for grabbed event
    const grabbed = await this.waitForNewHistoryEvent(item, "grabbed", 30000);

    if (!grabbed) {
      // No new grab - compare current file with last grabbed event from history
      logger.info(
        `No new grab for ${item.title}, checking against previous grab...`
      );

      const history = await this.radarr.getHistory(item.id);
      const { grabbed: lastGrabbed } = findHistoryEvents(history);

      if (!lastGrabbed) {
        // No grabbed event at all - consider OK
        logger.info(`No grab history for ${item.title}, marking as OK`);
        item.status = "completed";

        if (this.config.tag.enabled) {
          const tag = await this.radarr.getOrCreateTag(
            this.config.tag.successTag
          );
          const movie = await this.radarr.getMovie(item.id);
          await this.radarr.addTagToMovie(movie, tag.id);
          logger.info(`Applied success tag: ${this.config.tag.successTag}`);
        }

        this.completedItems.push(item);
        return;
      }

      // Compare current file with last grabbed score
      const movieFile = await this.radarr.getMovieFile(item.id);

      if (!movieFile) {
        logger.warn(`No file found for ${item.title}`);
        item.status = "failed";
        item.error = "No movie file found";
        this.completedItems.push(item);
        return;
      }

      const comparison = calculateScoreComparison({
        expectedScore: lastGrabbed.customFormatScore,
        actualScore: movieFile.customFormatScore,
        maxOverScore: this.config.quality.maxOverScore,
        maxUnderScore: this.config.quality.maxUnderScore,
      });

      logger.info(
        `${item.title}: Grabbed=${comparison.expectedScore}, Current=${comparison.actualScore}, Diff=${comparison.difference}`
      );

      await handleScoreResult(
        {
          movie: { id: item.id, title: item.title, year: item.year },
          quality: movieFile.quality.quality.name,
          comparison,
        },
        { tagConfig: this.config.tag, qualityConfig: this.config.quality },
        { radarr: this.radarr, discord: this.discord }
      );

      item.status = "completed";
      this.completedItems.push(item);
      return;
    }

    item.grabbedEvent = grabbed;
    item.status = "downloading";
    item.startedAt = new Date();
    this.downloadQueue.push(item);

    logger.info(
      `Grabbed ${item.title} (score: ${grabbed.customFormatScore}), moved to download queue`
    );
  }

  private async waitForNewHistoryEvent(
    item: QueueItem,
    eventType: string,
    timeoutMs: number
  ): Promise<RadarrHistory | null> {
    const startTime = Date.now();
    const pollInterval = 3000;

    while (Date.now() - startTime < timeoutMs) {
      const history = await this.radarr.getHistory(item.id);
      const newEvent = history.find(
        (h) => h.eventType === eventType && !item.initialHistoryIds.has(h.id)
      );

      if (newEvent) {
        item.initialHistoryIds.add(newEvent.id);
        return newEvent;
      }

      await this.sleep(pollInterval);
    }

    return null;
  }

  private async monitorDownloads(): Promise<void> {
    const timeoutMs = this.batchConfig.downloadTimeoutMinutes * 60 * 1000;

    while (this.isRunning || this.downloadQueue.length > 0) {
      for (const item of [...this.downloadQueue]) {
        if (item.status !== "downloading") continue;

        try {
          const importDetected = await this.checkForImport(item);

          if (importDetected) {
            await this.processCompletedDownload(item);
          } else if (this.isTimedOut(item, timeoutMs)) {
            item.status = "failed";
            item.error = "Download timed out";
            logger.warn(`Download timed out for ${item.title}`);
            this.removeFromDownloadQueue(item);
            this.completedItems.push(item);
          }
        } catch (error) {
          item.status = "failed";
          item.error = error instanceof Error ? error.message : String(error);
          logger.error(
            `Error checking download for ${item.title}: ${item.error}`
          );
          this.removeFromDownloadQueue(item);
          this.completedItems.push(item);
        }
      }

      await this.sleep(this.batchConfig.downloadCheckIntervalSeconds * 1000);
    }
  }

  private async checkForImport(item: QueueItem): Promise<boolean> {
    const history = await this.radarr.getHistory(item.id);
    const importEvent = history.find(
      (h) =>
        h.eventType === "downloadFolderImported" &&
        !item.initialHistoryIds.has(h.id)
    );
    return importEvent !== undefined;
  }

  private async processCompletedDownload(item: QueueItem): Promise<void> {
    logger.info(`Download completed for ${item.title}, checking score...`);

    if (!item.grabbedEvent) {
      item.status = "failed";
      item.error = "Missing grabbed event";
      this.removeFromDownloadQueue(item);
      this.completedItems.push(item);
      return;
    }

    // Get current file score (actual score after import)
    const movieFile = await this.radarr.getMovieFile(item.id);

    if (!movieFile) {
      item.status = "failed";
      item.error = "Could not get movie file info after import";
      this.removeFromDownloadQueue(item);
      this.completedItems.push(item);
      return;
    }

    const comparison = calculateScoreComparison({
      expectedScore: item.grabbedEvent.customFormatScore,
      actualScore: movieFile.customFormatScore,
      maxOverScore: this.config.quality.maxOverScore,
      maxUnderScore: this.config.quality.maxUnderScore,
    });

    logger.info(
      `${item.title}: Grabbed=${comparison.expectedScore}, Current=${comparison.actualScore}, Diff=${comparison.difference}`
    );

    await handleScoreResult(
      {
        movie: { id: item.id, title: item.title, year: item.year },
        quality: movieFile.quality.quality.name,
        comparison,
      },
      { tagConfig: this.config.tag, qualityConfig: this.config.quality },
      { radarr: this.radarr, discord: this.discord }
    );

    item.status = "completed";
    this.removeFromDownloadQueue(item);
    this.completedItems.push(item);
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
      logger.debug(
        `Waiting for ${this.downloadQueue.length} downloads to complete...`
      );
      await this.sleep(5000);
    }
  }

  private printSummary(): void {
    const completed = this.completedItems.filter(
      (i) => i.status === "completed"
    ).length;
    const failed = this.completedItems.filter(
      (i) => i.status === "failed"
    ).length;

    logger.info("=== Summary ===");
    logger.info(`Completed: ${completed}`);
    logger.info(`Failed: ${failed}`);

    if (failed > 0) {
      logger.info("Failed items:");
      for (const item of this.completedItems.filter(
        (i) => i.status === "failed"
      )) {
        logger.info(`  - ${item.title}: ${item.error ?? "Unknown error"}`);
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
