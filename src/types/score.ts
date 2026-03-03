import type { RadarrHistory, RadarrImage } from "./radarr.js";

/**
 * Input for score comparison calculation
 */
export interface ScoreComparisonInput {
  expectedScore: number;
  actualScore: number;
  maxOverScore: number;
  maxUnderScore: number;
}

/**
 * Result of score comparison calculation
 */
export interface ScoreComparisonResult {
  expectedScore: number;
  actualScore: number;
  difference: number;
  minAllowedScore: number;
  maxAllowedScore: number;
  isAcceptable: boolean;
}

/**
 * Movie info needed for score result handling
 */
export interface MovieInfo {
  id: number;
  title: string;
  year: number;
  images?: RadarrImage[] | undefined;
}

/**
 * Context needed to apply tags and send notifications
 */
export interface ScoreResultContext {
  movie: MovieInfo;
  quality: string;
  comparison: ScoreComparisonResult;
  indexer?: string | undefined;
}

/**
 * Services dependency interface for score result handler
 */
export interface ScoreResultServices {
  radarr: {
    getMovie(
      id: number
    ): Promise<{ id: number; title: string; year: number; tags: number[] }>;
    getOrCreateTag(label: string): Promise<{ id: number; label: string }>;
    addTagToMovie(
      movie: { id: number; tags: number[] },
      tagId: number
    ): Promise<unknown>;
  };
  discord: {
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
  };
  radarrUrl?: string | undefined;
}

/**
 * History events pair (grabbed and imported)
 */
export interface HistoryEventPair {
  grabbed: RadarrHistory | null;
  imported: RadarrHistory | null;
}
