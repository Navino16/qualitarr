import type { DiscordConfig, INotificationService } from "../types/index.js";
import { logger, getVersion } from "../utils/index.js";

export interface ScoreMismatchInfo {
  title: string;
  year?: number | undefined;
  expectedScore: number;
  actualScore: number;
  difference: number;
  maxOverScore: number;
  quality: string;
  indexer?: string | undefined;
  radarrUrl?: string | undefined;
  movieId?: number | undefined;
  posterUrl?: string | undefined;
}

export interface BatchSummaryInfo {
  totalProcessed: number;
  completed: number;
  failed: number;
  mismatches: number;
  durationMs: number;
  failedItems: { title: string; error: string }[];
}

export class DiscordService implements INotificationService {
  private webhookUrl: string | undefined;
  private enabled: boolean;

  constructor(config: DiscordConfig) {
    this.webhookUrl = config.webhookUrl;
    this.enabled = config.enabled;
  }

  async sendScoreMismatch(info: ScoreMismatchInfo): Promise<void> {
    if (!this.enabled || !this.webhookUrl) {
      logger.debug(
        "Discord notifications disabled or not configured, skipping"
      );
      return;
    }

    const color = this.getColorForDifference(info.difference);
    const title = info.year ? `${info.title} (${info.year})` : info.title;

    const description =
      info.radarrUrl && info.movieId
        ? `**[${title}](${info.radarrUrl}/movie/${info.movieId})**`
        : `**${title}**`;

    const embed: Record<string, unknown> = {
      title: "Quality Score Mismatch",
      description,
      color,
      fields: [
        {
          name: "Expected Score",
          value: String(info.expectedScore),
          inline: true,
        },
        {
          name: "Actual Score",
          value: String(info.actualScore),
          inline: true,
        },
        {
          name: "Difference",
          value: `${info.difference > 0 ? "+" : ""}${info.difference}`,
          inline: true,
        },
        {
          name: "Quality",
          value: info.quality,
          inline: true,
        },
        ...(info.indexer
          ? [
              {
                name: "Indexer",
                value: info.indexer,
                inline: true,
              },
            ]
          : []),
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: `Qualitarr v${getVersion()}`,
      },
    };

    if (info.posterUrl) {
      embed["thumbnail"] = { url: info.posterUrl };
    }

    const payload = {
      embeds: [embed],
    };

    logger.debug("Sending Discord notification", payload);

    await this.sendWebhook(payload);

    logger.info(`Discord notification sent for ${title}`);
  }

  async sendBatchSummary(info: BatchSummaryInfo): Promise<void> {
    if (!this.enabled || !this.webhookUrl) {
      logger.debug(
        "Discord notifications disabled or not configured, skipping"
      );
      return;
    }

    const durationSeconds = Math.round(info.durationMs / 1000);
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;
    const durationStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    const color = info.failed > 0 ? 0xff8c00 : 0x00ff00;

    const fields = [
      {
        name: "Total Processed",
        value: String(info.totalProcessed),
        inline: true,
      },
      {
        name: "Completed",
        value: String(info.completed),
        inline: true,
      },
      {
        name: "Failed",
        value: String(info.failed),
        inline: true,
      },
      {
        name: "Mismatches",
        value: String(info.mismatches),
        inline: true,
      },
      {
        name: "Duration",
        value: durationStr,
        inline: true,
      },
    ];

    if (info.failedItems.length > 0) {
      const maxDisplay = 5;
      const failedList = info.failedItems
        .slice(0, maxDisplay)
        .map((item) => `- ${item.title}: ${item.error}`)
        .join("\n");
      const suffix =
        info.failedItems.length > maxDisplay
          ? `\n... and ${info.failedItems.length - maxDisplay} more`
          : "";

      fields.push({
        name: "Failed Items",
        value: failedList + suffix,
        inline: false,
      });
    }

    const embed = {
      title: "Batch Processing Summary",
      color,
      fields,
      timestamp: new Date().toISOString(),
      footer: {
        text: `Qualitarr v${getVersion()}`,
      },
    };

    const payload = {
      embeds: [embed],
    };

    logger.debug("Sending Discord batch summary", payload);

    await this.sendWebhook(payload);

    logger.info("Discord batch summary sent");
  }

  private async sendWebhook(payload: Record<string, unknown>): Promise<void> {
    if (!this.webhookUrl) {
      return;
    }

    const response = await fetch(this.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(
        `Discord webhook error: ${response.status} ${response.statusText}`
      );
    }
  }

  private getColorForDifference(difference: number): number {
    if (difference < -50) return 0xff0000; // Red - very bad
    if (difference < -20) return 0xff8c00; // Orange - bad
    if (difference < 0) return 0xffff00; // Yellow - slight mismatch
    return 0x00ff00; // Green - better than expected
  }
}
