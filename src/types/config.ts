import { z } from "zod/v4";

export const radarrConfigSchema = z.object({
  url: z.url("Invalid Radarr URL"),
  apiKey: z.string().min(1, "Radarr API key is required"),
});

export const sonarrConfigSchema = z.object({
  url: z.url("Invalid Sonarr URL"),
  apiKey: z.string().min(1, "Sonarr API key is required"),
});

export const discordConfigSchema = z.object({
  enabled: z.boolean().default(false),
  webhookUrl: z.string().optional(),
}).refine(
  (data) => !data.enabled || (data.enabled && data.webhookUrl),
  {
    message: "Discord webhook URL is required when Discord is enabled",
    path: ["webhookUrl"],
  }
);

export const tagConfigSchema = z.object({
  enabled: z.boolean().default(true),
  successTag: z.string().default("check_ok"),
  mismatchTag: z.string().default("quality-mismatch"),
});

export const qualityConfigSchema = z.object({
  maxOverScore: z.number().min(0).default(100),
  maxUnderScore: z.number().min(0).default(0),
});

export const batchConfigSchema = z.object({
  maxConcurrentDownloads: z.number().min(1).max(20).default(3),
  searchIntervalSeconds: z.number().min(5).max(300).default(30),
  downloadCheckIntervalSeconds: z.number().min(5).max(60).default(10),
  downloadTimeoutMinutes: z.number().min(5).max(1440).default(60),
});

export const configSchema = z.object({
  radarr: radarrConfigSchema.optional(),
  sonarr: sonarrConfigSchema.optional(),
  discord: discordConfigSchema.default({ enabled: false }),
  tag: tagConfigSchema.default({
    enabled: true,
    successTag: "check_ok",
    mismatchTag: "quality-mismatch",
  }),
  quality: qualityConfigSchema.default({ maxOverScore: 100, maxUnderScore: 0 }),
  batch: batchConfigSchema.default({
    maxConcurrentDownloads: 3,
    searchIntervalSeconds: 30,
    downloadCheckIntervalSeconds: 10,
    downloadTimeoutMinutes: 60,
  }),
}).refine(
  (data) => data.radarr ?? data.sonarr,
  {
    message: "At least one of radarr or sonarr must be configured",
  }
);

export type RadarrConfig = z.infer<typeof radarrConfigSchema>;
export type SonarrConfig = z.infer<typeof sonarrConfigSchema>;
export type DiscordConfig = z.infer<typeof discordConfigSchema>;
export type TagConfig = z.infer<typeof tagConfigSchema>;
export type QualityConfig = z.infer<typeof qualityConfigSchema>;
export type BatchConfig = z.infer<typeof batchConfigSchema>;
export type Config = z.infer<typeof configSchema>;
