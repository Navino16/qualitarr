import type { Config } from "../types/index.js";
import type { IMediaService, INotificationService } from "../types/services.js";
import type { RadarrHistory } from "../types/radarr.js";
import type { QueueItem } from "./queue.js";
import { compareScores, logScoreSummary, handleScoreResult } from "./score.js";
import { logger, findHistoryEvents } from "../utils/index.js";

export interface ItemProcessorDeps {
  mediaService: IMediaService;
  notificationService: INotificationService;
  config: Config;
}

export class ItemProcessor {
  private mediaService: IMediaService;
  private notificationService: INotificationService;
  private config: Config;

  constructor(deps: ItemProcessorDeps) {
    this.mediaService = deps.mediaService;
    this.notificationService = deps.notificationService;
    this.config = deps.config;
  }

  async processSearch(
    item: QueueItem,
    logContext: string
  ): Promise<{ grabbed: RadarrHistory | null }> {
    logger.info(`${logContext} Searching...`);
    item.status = "searching";

    const command = await this.mediaService.searchMovie(item.id);
    await this.mediaService.waitForCommand(
      command.id,
      this.config.batch.commandTimeoutMs,
      this.config.batch.commandPollIntervalMs
    );

    // Wait for grabbed event
    const grabbed = await this.waitForNewHistoryEvent(
      item,
      "grabbed",
      this.config.batch.grabWaitTimeoutMs
    );

    if (!grabbed) {
      return { grabbed: null };
    }

    return { grabbed };
  }

  async handleNoGrab(
    item: QueueItem,
    logContext: string
  ): Promise<{ mismatch: boolean }> {
    logger.info(`${logContext} No new grab, checking against previous grab...`);

    const history = await this.mediaService.getHistory(item.id);
    const { grabbed: lastGrabbed } = findHistoryEvents(history);

    if (!lastGrabbed) {
      logger.info(`${logContext} No grab history, marking as OK`);

      if (this.config.tag.enabled) {
        const tag = await this.mediaService.getOrCreateTag(
          this.config.tag.successTag
        );
        const movie = await this.mediaService.getMovie(item.id);
        await this.mediaService.addTagToMovie(movie, tag.id);
        logger.info(
          `${logContext} Applied success tag: ${this.config.tag.successTag}`
        );
      }

      return { mismatch: false };
    }

    const movieFile = await this.mediaService.getMovieFile(item.id);

    if (!movieFile) {
      throw new Error("No movie file found");
    }

    return this.applyScoreResult(
      item,
      lastGrabbed,
      movieFile.customFormatScore,
      movieFile.quality.quality.name,
      logContext
    );
  }

  async processCompletedDownload(
    item: QueueItem,
    logContext: string
  ): Promise<{ mismatch: boolean }> {
    logger.info(`${logContext} Download completed, checking score...`);

    if (!item.grabbedEvent) {
      throw new Error("Missing grabbed event");
    }

    const movieFile = await this.mediaService.getMovieFile(item.id);

    if (!movieFile) {
      throw new Error("Could not get movie file info after import");
    }

    return this.applyScoreResult(
      item,
      item.grabbedEvent,
      movieFile.customFormatScore,
      movieFile.quality.quality.name,
      logContext
    );
  }

  async checkForImport(item: QueueItem): Promise<boolean> {
    const history = await this.mediaService.getHistory(item.id);
    const importEvent = history.find(
      (h) =>
        h.eventType === "downloadFolderImported" &&
        !item.initialHistoryIds.has(h.id)
    );
    return importEvent !== undefined;
  }

  private async applyScoreResult(
    item: QueueItem,
    grabbedEvent: RadarrHistory,
    actualScore: number,
    qualityName: string,
    logContext: string
  ): Promise<{ mismatch: boolean }> {
    const comparison = compareScores(
      grabbedEvent.customFormatScore,
      actualScore,
      this.config.quality
    );

    logScoreSummary(item.title, comparison);

    const indexer =
      typeof grabbedEvent.data["indexer"] === "string"
        ? grabbedEvent.data["indexer"]
        : undefined;

    await handleScoreResult(
      {
        movie: { id: item.id, title: item.title, year: item.year },
        quality: qualityName,
        comparison,
        indexer,
      },
      { tagConfig: this.config.tag, qualityConfig: this.config.quality },
      {
        radarr: this.mediaService,
        discord: this.notificationService,
        radarrUrl: this.config.radarr?.url,
      }
    );

    if (!comparison.isAcceptable) {
      logger.info(`${logContext} Score mismatch detected`);
      return { mismatch: true };
    }

    return { mismatch: false };
  }

  private async waitForNewHistoryEvent(
    item: QueueItem,
    eventType: string,
    timeoutMs: number
  ): Promise<RadarrHistory | null> {
    const { sleep } = await import("../utils/async.js");
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const history = await this.mediaService.getHistory(item.id);
      const newEvent = history.find(
        (h) => h.eventType === eventType && !item.initialHistoryIds.has(h.id)
      );

      if (newEvent) {
        item.initialHistoryIds.add(newEvent.id);
        return newEvent;
      }

      await sleep(this.config.batch.historyPollIntervalMs);
    }

    return null;
  }
}
