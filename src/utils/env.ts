export interface RadarrEnvVars {
  type: "radarr";
  eventType: string;
  movieId: number;
  movieTitle: string;
  movieYear?: number | undefined;
  releaseQuality?: string | undefined;
  downloadId?: string | undefined;
}

export interface SonarrEnvVars {
  type: "sonarr";
  eventType: string;
  seriesId: number;
  seriesTitle: string;
  episodeId?: number | undefined;
  releaseQuality?: string | undefined;
  downloadId?: string | undefined;
}

export type ArrEnvVars = RadarrEnvVars | SonarrEnvVars;

export function parseRadarrEnv(): RadarrEnvVars | null {
  const eventType = process.env["radarr_eventtype"];
  const movieIdStr = process.env["radarr_movie_id"];

  if (!eventType || !movieIdStr) {
    return null;
  }

  const movieId = parseInt(movieIdStr, 10);
  if (isNaN(movieId)) {
    return null;
  }

  return {
    type: "radarr",
    eventType,
    movieId,
    movieTitle: process.env["radarr_movie_title"] ?? "Unknown",
    movieYear: process.env["radarr_movie_year"]
      ? parseInt(process.env["radarr_movie_year"], 10)
      : undefined,
    releaseQuality: process.env["radarr_release_quality"],
    downloadId: process.env["radarr_download_id"],
  };
}

export function parseSonarrEnv(): SonarrEnvVars | null {
  const eventType = process.env["sonarr_eventtype"];
  const seriesIdStr = process.env["sonarr_series_id"];

  if (!eventType || !seriesIdStr) {
    return null;
  }

  const seriesId = parseInt(seriesIdStr, 10);
  if (isNaN(seriesId)) {
    return null;
  }

  return {
    type: "sonarr",
    eventType,
    seriesId,
    seriesTitle: process.env["sonarr_series_title"] ?? "Unknown",
    episodeId: process.env["sonarr_episodefile_id"]
      ? parseInt(process.env["sonarr_episodefile_id"], 10)
      : undefined,
    releaseQuality: process.env["sonarr_release_quality"],
    downloadId: process.env["sonarr_download_id"],
  };
}

export function parseArrEnv(): ArrEnvVars | null {
  return parseRadarrEnv() ?? parseSonarrEnv();
}

export function isImportEvent(envVars: ArrEnvVars): boolean {
  return (
    envVars.eventType === "Download" ||
    envVars.eventType === "Import" ||
    envVars.eventType === "DownloadFolderImported"
  );
}
