export interface RadarrMovie {
  id: number;
  title: string;
  year: number;
  tmdbId: number;
  imdbId?: string;
  hasFile: boolean;
  monitored: boolean;
  tags: number[];
}

export interface RadarrQueueItem {
  id: number;
  movieId: number;
  title: string;
  status: string;
  trackedDownloadStatus: string;
  trackedDownloadState: string;
  quality: RadarrQuality;
  customFormatScore: number;
  size: number;
  sizeleft: number;
}

export interface RadarrQuality {
  quality: {
    id: number;
    name: string;
    source: string;
    resolution: number;
  };
  revision: {
    version: number;
    real: number;
    isRepack: boolean;
  };
}

export interface RadarrRelease {
  guid: string;
  title: string;
  indexer: string;
  size: number;
  quality: RadarrQuality;
  customFormatScore: number;
  rejections: string[];
  seeders?: number;
  leechers?: number;
}

export interface RadarrHistory {
  id: number;
  movieId: number;
  sourceTitle: string;
  quality: RadarrQuality;
  customFormatScore: number;
  date: string;
  eventType: string;
  data: Record<string, unknown>;
}

export interface RadarrTag {
  id: number;
  label: string;
}

export interface RadarrCommand {
  id: number;
  name: string;
  status: string;
  queued: string;
  started?: string;
  ended?: string;
}

export interface RadarrMovieFile {
  id: number;
  movieId: number;
  relativePath: string;
  path: string;
  size: number;
  quality: RadarrQuality;
  customFormatScore: number;
}
