import type {
  RadarrMovie,
  RadarrMovieFile,
  RadarrHistory,
  RadarrTag,
  RadarrCommand,
  RadarrSystemStatus,
} from "./radarr.js";

/**
 * Media service interface shared by Radarr/Sonarr
 */
export interface IMediaService {
  getMovies(): Promise<RadarrMovie[]>;
  getMovie(id: number): Promise<RadarrMovie>;
  getMovieFile(movieId: number): Promise<RadarrMovieFile | null>;
  getHistory(movieId: number): Promise<RadarrHistory[]>;
  searchMovie(movieId: number): Promise<RadarrCommand>;
  waitForCommand(
    commandId: number,
    timeoutMs?: number,
    pollIntervalMs?: number
  ): Promise<RadarrCommand>;
  getTags(): Promise<RadarrTag[]>;
  getOrCreateTag(label: string): Promise<RadarrTag>;
  addTagToMovie(movie: RadarrMovie, tagId: number): Promise<RadarrMovie>;
  getSystemStatus(): Promise<RadarrSystemStatus>;
}

/**
 * Notification service interface
 */
export interface INotificationService {
  sendScoreMismatch(info: {
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
  }): Promise<void>;

  sendBatchSummary(info: {
    totalProcessed: number;
    completed: number;
    failed: number;
    mismatches: number;
    durationMs: number;
    failedItems: { title: string; error: string }[];
  }): Promise<void>;
}
