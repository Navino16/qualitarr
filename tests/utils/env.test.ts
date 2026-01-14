import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseRadarrEnv,
  parseSonarrEnv,
  parseArrEnv,
  isImportEvent,
} from '../../src/utils/env.js';
import type { ArrEnvVars } from '../../src/utils/env.js';

describe('parseRadarrEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should parse valid Radarr environment variables', () => {
    process.env['radarr_eventtype'] = 'Download';
    process.env['radarr_movie_id'] = '123';
    process.env['radarr_movie_title'] = 'Test Movie';
    process.env['radarr_movie_year'] = '2024';
    process.env['radarr_release_quality'] = 'Bluray-1080p';
    process.env['radarr_download_id'] = 'abc123';

    const result = parseRadarrEnv();

    expect(result).not.toBeNull();
    expect(result?.type).toBe('radarr');
    expect(result?.eventType).toBe('Download');
    expect(result?.movieId).toBe(123);
    expect(result?.movieTitle).toBe('Test Movie');
    expect(result?.movieYear).toBe(2024);
    expect(result?.releaseQuality).toBe('Bluray-1080p');
    expect(result?.downloadId).toBe('abc123');
  });

  it('should return null when eventtype is missing', () => {
    process.env['radarr_movie_id'] = '123';

    const result = parseRadarrEnv();

    expect(result).toBeNull();
  });

  it('should return null when movie_id is missing', () => {
    process.env['radarr_eventtype'] = 'Download';

    const result = parseRadarrEnv();

    expect(result).toBeNull();
  });

  it('should return null when movie_id is not a number', () => {
    process.env['radarr_eventtype'] = 'Download';
    process.env['radarr_movie_id'] = 'not-a-number';

    const result = parseRadarrEnv();

    expect(result).toBeNull();
  });

  it('should use default title when movie_title is missing', () => {
    process.env['radarr_eventtype'] = 'Download';
    process.env['radarr_movie_id'] = '123';

    const result = parseRadarrEnv();

    expect(result).not.toBeNull();
    expect(result?.movieTitle).toBe('Unknown');
  });

  it('should handle missing optional fields', () => {
    process.env['radarr_eventtype'] = 'Download';
    process.env['radarr_movie_id'] = '123';

    const result = parseRadarrEnv();

    expect(result).not.toBeNull();
    expect(result?.movieYear).toBeUndefined();
    expect(result?.releaseQuality).toBeUndefined();
    expect(result?.downloadId).toBeUndefined();
  });

  it('should handle invalid movie_year gracefully', () => {
    process.env['radarr_eventtype'] = 'Download';
    process.env['radarr_movie_id'] = '123';
    process.env['radarr_movie_year'] = 'invalid';

    const result = parseRadarrEnv();

    expect(result).not.toBeNull();
    expect(result?.movieYear).toBe(NaN);
  });
});

describe('parseSonarrEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should parse valid Sonarr environment variables', () => {
    process.env['sonarr_eventtype'] = 'Download';
    process.env['sonarr_series_id'] = '456';
    process.env['sonarr_series_title'] = 'Test Series';
    process.env['sonarr_episodefile_id'] = '789';
    process.env['sonarr_release_quality'] = 'HDTV-1080p';
    process.env['sonarr_download_id'] = 'def456';

    const result = parseSonarrEnv();

    expect(result).not.toBeNull();
    expect(result?.type).toBe('sonarr');
    expect(result?.eventType).toBe('Download');
    expect(result?.seriesId).toBe(456);
    expect(result?.seriesTitle).toBe('Test Series');
    expect(result?.episodeId).toBe(789);
    expect(result?.releaseQuality).toBe('HDTV-1080p');
    expect(result?.downloadId).toBe('def456');
  });

  it('should return null when eventtype is missing', () => {
    process.env['sonarr_series_id'] = '456';

    const result = parseSonarrEnv();

    expect(result).toBeNull();
  });

  it('should return null when series_id is missing', () => {
    process.env['sonarr_eventtype'] = 'Download';

    const result = parseSonarrEnv();

    expect(result).toBeNull();
  });

  it('should return null when series_id is not a number', () => {
    process.env['sonarr_eventtype'] = 'Download';
    process.env['sonarr_series_id'] = 'not-a-number';

    const result = parseSonarrEnv();

    expect(result).toBeNull();
  });

  it('should use default title when series_title is missing', () => {
    process.env['sonarr_eventtype'] = 'Download';
    process.env['sonarr_series_id'] = '456';

    const result = parseSonarrEnv();

    expect(result).not.toBeNull();
    expect(result?.seriesTitle).toBe('Unknown');
  });
});

describe('parseArrEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return Radarr env when available', () => {
    process.env['radarr_eventtype'] = 'Download';
    process.env['radarr_movie_id'] = '123';

    const result = parseArrEnv();

    expect(result).not.toBeNull();
    expect(result?.type).toBe('radarr');
  });

  it('should return Sonarr env when Radarr not available', () => {
    process.env['sonarr_eventtype'] = 'Download';
    process.env['sonarr_series_id'] = '456';

    const result = parseArrEnv();

    expect(result).not.toBeNull();
    expect(result?.type).toBe('sonarr');
  });

  it('should prefer Radarr when both are available', () => {
    process.env['radarr_eventtype'] = 'Download';
    process.env['radarr_movie_id'] = '123';
    process.env['sonarr_eventtype'] = 'Download';
    process.env['sonarr_series_id'] = '456';

    const result = parseArrEnv();

    expect(result?.type).toBe('radarr');
  });

  it('should return null when neither is available', () => {
    const result = parseArrEnv();

    expect(result).toBeNull();
  });
});

describe('isImportEvent', () => {
  it('should return true for Download event', () => {
    const envVars: ArrEnvVars = {
      type: 'radarr',
      eventType: 'Download',
      movieId: 123,
      movieTitle: 'Test',
    };

    expect(isImportEvent(envVars)).toBe(true);
  });

  it('should return true for Import event', () => {
    const envVars: ArrEnvVars = {
      type: 'radarr',
      eventType: 'Import',
      movieId: 123,
      movieTitle: 'Test',
    };

    expect(isImportEvent(envVars)).toBe(true);
  });

  it('should return true for DownloadFolderImported event', () => {
    const envVars: ArrEnvVars = {
      type: 'radarr',
      eventType: 'DownloadFolderImported',
      movieId: 123,
      movieTitle: 'Test',
    };

    expect(isImportEvent(envVars)).toBe(true);
  });

  it('should return false for Grab event', () => {
    const envVars: ArrEnvVars = {
      type: 'radarr',
      eventType: 'Grab',
      movieId: 123,
      movieTitle: 'Test',
    };

    expect(isImportEvent(envVars)).toBe(false);
  });

  it('should return false for Test event', () => {
    const envVars: ArrEnvVars = {
      type: 'radarr',
      eventType: 'Test',
      movieId: 123,
      movieTitle: 'Test',
    };

    expect(isImportEvent(envVars)).toBe(false);
  });

  it('should work with Sonarr env vars', () => {
    const envVars: ArrEnvVars = {
      type: 'sonarr',
      eventType: 'Download',
      seriesId: 456,
      seriesTitle: 'Test Series',
    };

    expect(isImportEvent(envVars)).toBe(true);
  });
});
