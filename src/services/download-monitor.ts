import type { BatchConfig } from "../types/index.js";
import type { QueueItem } from "./queue.js";
import type { ItemProcessor } from "./item-processor.js";
import { logger, sleep, formatError } from "../utils/index.js";

export interface DownloadMonitorCallbacks {
  onCompleted(item: QueueItem, mismatch: boolean): void;
  onFailed(item: QueueItem, error: string): void;
  isShuttingDown(): boolean;
}

export class DownloadMonitor {
  private downloadQueue: QueueItem[];
  private processor: ItemProcessor;
  private batchConfig: BatchConfig;
  private callbacks: DownloadMonitorCallbacks;
  private _running = false;
  private createLogContext: (item: QueueItem) => string;

  constructor(
    downloadQueue: QueueItem[],
    processor: ItemProcessor,
    batchConfig: BatchConfig,
    callbacks: DownloadMonitorCallbacks,
    createLogContext: (item: QueueItem) => string
  ) {
    this.downloadQueue = downloadQueue;
    this.processor = processor;
    this.batchConfig = batchConfig;
    this.callbacks = callbacks;
    this.createLogContext = createLogContext;
  }

  private get running(): boolean {
    return this._running;
  }

  async run(): Promise<void> {
    this._running = true;
    const timeoutMs = this.batchConfig.downloadTimeoutMinutes * 60 * 1000;

    while (
      (this.running || this.downloadQueue.length > 0) &&
      !this.callbacks.isShuttingDown()
    ) {
      for (const item of [...this.downloadQueue]) {
        if (item.status !== "downloading") continue;

        const logContext = this.createLogContext(item);

        try {
          const importDetected = await this.processor.checkForImport(item);

          if (importDetected) {
            const { mismatch } = await this.processor.processCompletedDownload(
              item,
              logContext
            );
            this.removeFromQueue(item);
            this.callbacks.onCompleted(item, mismatch);
          } else if (this.isTimedOut(item, timeoutMs)) {
            logger.warn(`${logContext} Download timed out`);
            this.removeFromQueue(item);
            this.callbacks.onFailed(item, "Download timed out");
          }
        } catch (error) {
          const errorMsg = formatError(error);
          logger.error(`${logContext} Error checking download: ${errorMsg}`);
          this.removeFromQueue(item);
          this.callbacks.onFailed(item, errorMsg);
        }
      }

      await sleep(this.batchConfig.downloadCheckIntervalSeconds * 1000);
    }
  }

  stop(): void {
    this._running = false;
  }

  private isTimedOut(item: QueueItem, timeoutMs: number): boolean {
    if (!item.startedAt) {
      logger.warn(
        `Item ${item.title} in download queue has no startedAt timestamp`
      );
      item.startedAt = new Date();
      return false;
    }
    return Date.now() - item.startedAt.getTime() > timeoutMs;
  }

  private removeFromQueue(item: QueueItem): void {
    const index = this.downloadQueue.indexOf(item);
    if (index > -1) {
      this.downloadQueue.splice(index, 1);
    }
  }
}
