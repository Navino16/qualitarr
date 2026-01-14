import { z } from "zod/v4";

// Zod schemas for API response validation
export const radarrQualitySchema = z.object({
  quality: z.object({
    id: z.number(),
    name: z.string(),
    source: z.string(),
    resolution: z.number(),
  }),
  revision: z.object({
    version: z.number(),
    real: z.number(),
    isRepack: z.boolean(),
  }),
});

export const radarrMovieSchema = z.object({
  id: z.number(),
  title: z.string(),
  year: z.number(),
  tmdbId: z.number(),
  imdbId: z.string().optional(),
  hasFile: z.boolean(),
  monitored: z.boolean(),
  tags: z.array(z.number()),
});

export const radarrQueueItemSchema = z.object({
  id: z.number(),
  movieId: z.number(),
  title: z.string(),
  status: z.string(),
  trackedDownloadStatus: z.string(),
  trackedDownloadState: z.string(),
  quality: radarrQualitySchema,
  customFormatScore: z.number(),
  size: z.number(),
  sizeleft: z.number(),
});

export const radarrReleaseSchema = z.object({
  guid: z.string(),
  title: z.string(),
  indexer: z.string(),
  size: z.number(),
  quality: radarrQualitySchema,
  customFormatScore: z.number(),
  rejections: z.array(z.string()),
  seeders: z.number().optional(),
  leechers: z.number().optional(),
});

export const radarrHistorySchema = z.object({
  id: z.number(),
  movieId: z.number(),
  sourceTitle: z.string(),
  quality: radarrQualitySchema,
  customFormatScore: z.number(),
  date: z.string(),
  eventType: z.string(),
  data: z.record(z.string(), z.unknown()),
});

export const radarrTagSchema = z.object({
  id: z.number(),
  label: z.string(),
});

export const radarrCommandSchema = z.object({
  id: z.number(),
  name: z.string(),
  status: z.string(),
  queued: z.string(),
  started: z.string().optional(),
  ended: z.string().optional(),
});

export const radarrMovieFileSchema = z.object({
  id: z.number(),
  movieId: z.number(),
  relativePath: z.string(),
  path: z.string(),
  size: z.number(),
  quality: radarrQualitySchema,
  customFormatScore: z.number(),
});

// Types inferred from schemas
export type RadarrQuality = z.infer<typeof radarrQualitySchema>;
export type RadarrMovie = z.infer<typeof radarrMovieSchema>;
export type RadarrQueueItem = z.infer<typeof radarrQueueItemSchema>;
export type RadarrRelease = z.infer<typeof radarrReleaseSchema>;
export type RadarrHistory = z.infer<typeof radarrHistorySchema>;
export type RadarrTag = z.infer<typeof radarrTagSchema>;
export type RadarrCommand = z.infer<typeof radarrCommandSchema>;
export type RadarrMovieFile = z.infer<typeof radarrMovieFileSchema>;
