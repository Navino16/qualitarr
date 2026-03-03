import { randomUUID } from "node:crypto";
import type { Config, BatchConfig } from "../types/index.js";
import type { RadarrMovie } from "../types/radarr.js";
import { RadarrService } from "./radarr.js";
import { DiscordService } from "./discord.js";
import { ItemProcessor } from "./item-processor.js";
import { DownloadMonitor } from "./download-monitor.js";
import { compareScores, logDryRunResult } from "./score.js";
import {
  logger,
  createLogContext,
  findHistoryEvents,
  sleep,
  formatError,
} from "../utils/index.js";

export interface QueueManagerOptions {
  dryRun?: boolean;
}

export interface QueueItem {
  id: number;
  title: string;
  year: number;
  hasFile: boolean;
  status: "pending" | "searching" | "downloading" | "completed" | "failed";
  grabbedEvent?: import("../types/radarr.js").RadarrHistory;
  initialHistoryIds: Set<number>;
  error?: string;
  startedAt?: Date;
  correlationId: string;
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
  private abortController: AbortController | null = null;
  private batchStartTime = 0;
  private mismatchCount = 0;

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
    const history = await this.radarr.getHistory(movie.id);
    const initialHistoryIds = new Set(history.map((h) => h.id));

    const item: QueueItem = {
      id: movie.id,
      title: movie.title,
      year: movie.year,
      hasFile: movie.hasFile,
      status: "pending",
      initialHistoryIds,
      correlationId: randomUUID().slice(0, 8),
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
    this.abortController = new AbortController();
    this.batchStartTime = Date.now();
    this.mismatchCount = 0;
    logger.info("Starting queue manager...");

    try {
      if (this.dryRun) {
        await this.runDryMode();
      } else {
        const processor = new ItemProcessor({
          mediaService: this.radarr,
          notificationService: this.discord,
          config: this.config,
        });

        const monitor = new DownloadMonitor(
          this.downloadQueue,
          processor,
          this.batchConfig,
          {
            onCompleted: (item, mismatch) => {
              if (mismatch) this.mismatchCount++;
              this.completeItem(item);
            },
            onFailed: (item, error) => {
              this.failItem(item, error);
            },
            isShuttingDown: () => this.isShuttingDown(),
          },
          (item) => createLogContext(item.title, item.year, item.correlationId)
        );

        const monitorPromise = monitor.run();

        await this.processSearchQueue(processor);

        await this.waitForDownloadsToComplete();

        monitor.stop();
        await monitorPromise;
      }

      logger.info("Queue manager finished");
      this.printSummary();
      await this.sendBatchSummaryNotification();
    } finally {
      this.isRunning = false;
      this.abortController = null;
      this.completedItems = [];
    }
  }

  private async runDryMode(): Promise<void> {
    logger.info("[DRY-RUN] Analyzing movies from search queue...");

    for (const item of this.searchQueue) {
      logger.info(`[DRY-RUN] Processing: ${item.title} (${item.year})`);

      const history = await this.radarr.getHistory(item.id);
      const { grabbed } = findHistoryEvents(history);

      if (!grabbed) {
        logger.info(`[DRY-RUN]   No grabbed event found in history`);
        logger.info(`[DRY-RUN]   Would trigger search and wait for download`);
        this.completeItem(item);
        continue;
      }

      if (!item.hasFile) {
        logger.info(`[DRY-RUN]   Movie has no file yet`);
        logger.info(`[DRY-RUN]   Would trigger search and wait for download`);
        this.completeItem(item);
        continue;
      }

      const movieFile = await this.radarr.getMovieFile(item.id);

      if (!movieFile) {
        logger.info(`[DRY-RUN]   Could not get movie file info`);
        this.completeItem(item);
        continue;
      }

      const comparison = compareScores(
        grabbed.customFormatScore,
        movieFile.customFormatScore,
        this.config.quality
      );

      logger.info(`[DRY-RUN]   Grabbed score: ${comparison.expectedScore}`);
      logger.info(`[DRY-RUN]   Current file score: ${comparison.actualScore}`);
      logger.info(`[DRY-RUN]   Difference: ${comparison.difference}`);

      logDryRunResult(comparison, this.config.tag);

      this.completeItem(item);
    }

    this.searchQueue = [];
  }

  private async processSearchQueue(processor: ItemProcessor): Promise<void> {
    while (
      this.searchQueue.length > 0 &&
      this.isRunning &&
      !this.isShuttingDown()
    ) {
      if (
        this.downloadQueue.length >= this.batchConfig.maxConcurrentDownloads
      ) {
        logger.debug(
          `Download queue full (${this.downloadQueue.length}/${this.batchConfig.maxConcurrentDownloads}), waiting...`
        );
        await sleep(this.batchConfig.searchIntervalSeconds * 1000);
        continue;
      }

      const item = this.searchQueue.shift();
      if (!item) continue;

      const logContext = createLogContext(
        item.title,
        item.year,
        item.correlationId
      );

      try {
        const { grabbed } = await processor.processSearch(item, logContext);

        if (!grabbed) {
          // No new grab - compare with existing history
          try {
            const { mismatch } = await processor.handleNoGrab(item, logContext);
            if (mismatch) this.mismatchCount++;
          } catch (error) {
            const errorMsg = formatError(error);
            logger.warn(`${logContext} ${errorMsg}`);
            this.failItem(item, errorMsg);
            continue;
          }
          this.completeItem(item);
        } else {
          // Move to download queue
          item.grabbedEvent = grabbed;
          item.status = "downloading";
          item.startedAt = new Date();
          this.downloadQueue.push(item);
          logger.info(
            `${logContext} Grabbed (score: ${grabbed.customFormatScore}), moved to download queue`
          );
        }
      } catch (error) {
        const errorMsg = formatError(error);
        logger.error(`${logContext} Failed to search: ${errorMsg}`);
        this.failItem(item, errorMsg);
      }

      if (this.searchQueue.length > 0) {
        logger.debug(
          `Waiting ${this.batchConfig.searchIntervalSeconds}s before next search...`
        );
        await sleep(this.batchConfig.searchIntervalSeconds * 1000);
      }
    }
  }

  private async waitForDownloadsToComplete(): Promise<void> {
    while (this.downloadQueue.length > 0 && !this.isShuttingDown()) {
      logger.debug(
        `Waiting for ${this.downloadQueue.length} downloads to complete...`
      );
      await sleep(this.batchConfig.downloadCheckIntervalSeconds * 1000);
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

  private async sendBatchSummaryNotification(): Promise<void> {
    if (this.dryRun) {
      return;
    }

    const completed = this.completedItems.filter(
      (i) => i.status === "completed"
    ).length;
    const failed = this.completedItems.filter(
      (i) => i.status === "failed"
    ).length;
    const failedItems = this.completedItems
      .filter((i) => i.status === "failed")
      .map((i) => ({ title: i.title, error: i.error ?? "Unknown error" }));

    try {
      await this.discord.sendBatchSummary({
        totalProcessed: this.completedItems.length,
        completed,
        failed,
        mismatches: this.mismatchCount,
        durationMs: Date.now() - this.batchStartTime,
        failedItems,
      });
    } catch (error) {
      logger.error(
        `Failed to send batch summary notification: ${formatError(error)}`
      );
    }
  }

  private completeItem(item: QueueItem): void {
    item.status = "completed";
    this.completedItems.push(item);
  }

  private failItem(item: QueueItem, error: string): void {
    item.status = "failed";
    item.error = error;
    this.completedItems.push(item);
  }

  private isShuttingDown(): boolean {
    return this.abortController?.signal.aborted ?? false;
  }

  shutdown(): void {
    if (!this.isRunning) {
      logger.debug("Queue manager is not running, nothing to shutdown");
      return;
    }

    logger.info("Shutdown requested, stopping queue manager gracefully...");
    this.abortController?.abort();
    this.isRunning = false;
  }
}
