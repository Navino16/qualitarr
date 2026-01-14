import type { DiscordConfig } from "../types/index.js";
import { logger } from "../utils/index.js";

export interface ScoreMismatchInfo {
  title: string;
  year?: number;
  expectedScore: number;
  actualScore: number;
  difference: number;
  maxOverScore: number;
  quality: string;
  indexer?: string;
}

export class DiscordService {
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

    const embed = {
      title: "Quality Score Mismatch",
      description: `**${title}**`,
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
        text: "Qualitarr",
      },
    };

    const payload = {
      embeds: [embed],
    };

    logger.debug("Sending Discord notification", payload);

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

    logger.info(`Discord notification sent for ${title}`);
  }

  private getColorForDifference(difference: number): number {
    if (difference < -50) return 0xff0000; // Red - very bad
    if (difference < -20) return 0xff8c00; // Orange - bad
    if (difference < 0) return 0xffff00; // Yellow - slight mismatch
    return 0x00ff00; // Green - better than expected
  }
}
