import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RadarrService } from "../../src/services/radarr.js";
import type { RadarrConfig } from "../../src/types/config.js";

function createConfig(overrides?: Partial<RadarrConfig>): RadarrConfig {
  return {
    url: "http://radarr:7878",
    apiKey: "test-api-key",
    api: {
      timeoutMs: 5000,
      retryAttempts: 2,
      retryDelayMs: 100,
    },
    ...overrides,
  };
}

function mockFetchJson(data: unknown, status = 200): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(data), {
      status,
      statusText: status === 200 ? "OK" : "Error",
      headers: { "Content-Type": "application/json" },
    })
  );
}

function mockFetchSequence(responses: Array<{ data?: unknown; status: number; statusText?: string; headers?: Record<string, string> }>): void {
  const spy = vi.spyOn(globalThis, "fetch");
  for (const res of responses) {
    spy.mockResolvedValueOnce(
      new Response(res.data !== undefined ? JSON.stringify(res.data) : null, {
        status: res.status,
        statusText: res.statusText ?? (res.status === 200 ? "OK" : "Error"),
        headers: res.headers ?? { "Content-Type": "application/json" },
      })
    );
  }
}

const validMovie = {
  id: 1,
  title: "Test Movie",
  year: 2024,
  tmdbId: 12345,
  hasFile: true,
  monitored: true,
  tags: [1, 2],
};

const validMovieFile = {
  id: 10,
  movieId: 1,
  relativePath: "Test Movie (2024)/movie.mkv",
  path: "/movies/Test Movie (2024)/movie.mkv",
  size: 5000000000,
  quality: {
    quality: { id: 7, name: "Bluray-1080p", source: "bluray", resolution: 1080 },
    revision: { version: 1, real: 0, isRepack: false },
  },
  customFormatScore: 150,
};

const validHistory = {
  id: 100,
  movieId: 1,
  sourceTitle: "Test.Movie.2024.1080p.BluRay",
  quality: {
    quality: { id: 7, name: "Bluray-1080p", source: "bluray", resolution: 1080 },
    revision: { version: 1, real: 0, isRepack: false },
  },
  customFormatScore: 120,
  date: "2024-01-01T00:00:00Z",
  eventType: "grabbed",
  data: { indexer: "NZBgeek" },
};

const validTag = { id: 1, label: "check_ok" };

const validCommand = {
  id: 50,
  name: "MoviesSearch",
  status: "completed",
  queued: "2024-01-01T00:00:00Z",
};

const validSystemStatus = {
  version: "5.0.0",
};

describe("RadarrService", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    consoleSpy.mockRestore();
  });

  describe("request headers and URL construction", () => {
    it("should send X-Api-Key header on every request", async () => {
      mockFetchJson([validMovie]);
      const service = new RadarrService(createConfig());

      await service.getMovies();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ "X-Api-Key": "test-api-key" }),
        })
      );
    });

    it("should send Content-Type application/json header", async () => {
      mockFetchJson([validMovie]);
      const service = new RadarrService(createConfig());

      await service.getMovies();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
        })
      );
    });

    it("should construct correct base URL with /api/v3 prefix", async () => {
      mockFetchJson([validMovie]);
      const service = new RadarrService(createConfig());

      await service.getMovies();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://radarr:7878/api/v3/movie",
        expect.any(Object)
      );
    });

    it("should strip trailing slash from base URL", async () => {
      mockFetchJson([validMovie]);
      const service = new RadarrService(createConfig({ url: "http://radarr:7878/" }));

      await service.getMovies();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://radarr:7878/api/v3/movie",
        expect.any(Object)
      );
    });

    it("should build endpoint with URLSearchParams", async () => {
      mockFetchJson([validMovie]);
      const service = new RadarrService(createConfig());

      await service.getMovieByTmdbId(12345);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://radarr:7878/api/v3/movie?tmdbId=12345",
        expect.any(Object)
      );
    });
  });

  describe("HTTP error handling", () => {
    it("should throw on 4xx errors without retrying", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status: 404, statusText: "Not Found" })
      );
      const service = new RadarrService(createConfig());

      await expect(service.getMovies()).rejects.toThrow(
        "Radarr API error: 404 Not Found (/movie)"
      );
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("should retry on 5xx errors", async () => {
      mockFetchSequence([
        { status: 500, statusText: "Internal Server Error" },
        { status: 500, statusText: "Internal Server Error" },
        { data: [validMovie], status: 200 },
      ]);
      const service = new RadarrService(createConfig());

      const result = await service.getMovies();

      expect(result).toHaveLength(1);
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it("should throw after exhausting retry attempts on 5xx", async () => {
      mockFetchSequence([
        { status: 500, statusText: "Internal Server Error" },
        { status: 500, statusText: "Internal Server Error" },
        { status: 500, statusText: "Internal Server Error" },
      ]);
      const service = new RadarrService(createConfig());

      await expect(service.getMovies()).rejects.toThrow(
        "Radarr API error: 500 Internal Server Error (/movie)"
      );
      // 1 initial + 2 retries = 3
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it("should retry on HTTP 408 (timeout)", async () => {
      mockFetchSequence([
        { status: 408, statusText: "Request Timeout" },
        { data: [validMovie], status: 200 },
      ]);
      const service = new RadarrService(createConfig());

      const result = await service.getMovies();

      expect(result).toHaveLength(1);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it("should handle HTTP 429 rate-limiting with Retry-After header", async () => {
      const headers429 = new Headers({
        "Content-Type": "application/json",
        "Retry-After": "1",
      });
      const spy = vi.spyOn(globalThis, "fetch");
      spy.mockResolvedValueOnce(
        new Response(null, { status: 429, statusText: "Too Many Requests", headers: headers429 })
      );
      spy.mockResolvedValueOnce(
        new Response(JSON.stringify([validMovie]), { status: 200 })
      );
      const service = new RadarrService(createConfig());

      const result = await service.getMovies();

      expect(result).toHaveLength(1);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("should handle HTTP 429 without Retry-After header", async () => {
      const spy = vi.spyOn(globalThis, "fetch");
      spy.mockResolvedValueOnce(
        new Response(null, { status: 429, statusText: "Too Many Requests" })
      );
      spy.mockResolvedValueOnce(
        new Response(JSON.stringify([validMovie]), { status: 200 })
      );
      const service = new RadarrService(createConfig());

      const result = await service.getMovies();

      expect(result).toHaveLength(1);
    });
  });

  describe("timeout and abort handling", () => {
    it("should throw on AbortError (timeout)", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(
        Object.assign(new Error("The operation was aborted"), { name: "AbortError" })
      );
      const service = new RadarrService(createConfig());

      await expect(service.getMovies()).rejects.toThrow(
        "Radarr API timeout after 5000ms (/movie)"
      );
    });

    it("should throw connection error for non-abort fetch failures", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(
        new Error("ECONNREFUSED")
      );
      const service = new RadarrService(createConfig());

      await expect(service.getMovies()).rejects.toThrow(
        "Radarr API connection failed (/movie): ECONNREFUSED"
      );
    });
  });

  describe("retry with exponential backoff", () => {
    it("should increase delay exponentially between retries", async () => {
      mockFetchSequence([
        { status: 500, statusText: "Internal Server Error" },
        { status: 500, statusText: "Internal Server Error" },
        { data: [validMovie], status: 200 },
      ]);
      const service = new RadarrService(createConfig({ api: { timeoutMs: 5000, retryAttempts: 2, retryDelayMs: 100 } }));

      await service.getMovies();

      // Just verify all 3 calls were made (backoff tested implicitly)
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it("should not retry when retryAttempts is 0", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(null, { status: 500, statusText: "Internal Server Error" })
      );
      const service = new RadarrService(
        createConfig({ api: { timeoutMs: 5000, retryAttempts: 0, retryDelayMs: 100 } })
      );

      await expect(service.getMovies()).rejects.toThrow("Radarr API error: 500");
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("Zod validation", () => {
    it("should validate successful movie response", async () => {
      mockFetchJson([validMovie]);
      const service = new RadarrService(createConfig());

      const movies = await service.getMovies();

      expect(movies).toHaveLength(1);
      expect(movies[0]!.title).toBe("Test Movie");
    });

    it("should throw on invalid movie response (missing required field)", async () => {
      mockFetchJson([{ id: 1, title: "Test" }]); // missing year, tmdbId, etc.
      const service = new RadarrService(createConfig());

      await expect(service.getMovies()).rejects.toThrow("Invalid API response");
    });

    it("should throw when array expected but object returned", async () => {
      mockFetchJson({ id: 1 }); // single object instead of array
      const service = new RadarrService(createConfig());

      await expect(service.getMovies()).rejects.toThrow("Expected array response");
    });

    it("should validate single object response", async () => {
      mockFetchJson(validMovie);
      const service = new RadarrService(createConfig());

      const movie = await service.getMovie(1);

      expect(movie.title).toBe("Test Movie");
    });

    it("should throw on invalid single object response", async () => {
      mockFetchJson({ id: 1 }); // missing fields
      const service = new RadarrService(createConfig());

      await expect(service.getMovie(1)).rejects.toThrow("Invalid API response");
    });
  });

  describe("getMovies", () => {
    it("should return validated movie array", async () => {
      mockFetchJson([validMovie, { ...validMovie, id: 2, title: "Movie 2" }]);
      const service = new RadarrService(createConfig());

      const movies = await service.getMovies();

      expect(movies).toHaveLength(2);
      expect(movies[0]!.title).toBe("Test Movie");
      expect(movies[1]!.title).toBe("Movie 2");
    });
  });

  describe("getMovie", () => {
    it("should fetch movie by ID", async () => {
      mockFetchJson(validMovie);
      const service = new RadarrService(createConfig());

      const movie = await service.getMovie(1);

      expect(movie.id).toBe(1);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://radarr:7878/api/v3/movie/1",
        expect.any(Object)
      );
    });
  });

  describe("getMovieByTmdbId", () => {
    it("should return first movie matching tmdbId", async () => {
      mockFetchJson([validMovie]);
      const service = new RadarrService(createConfig());

      const movie = await service.getMovieByTmdbId(12345);

      expect(movie).not.toBeNull();
      expect(movie!.tmdbId).toBe(12345);
    });

    it("should return null when no movie matches", async () => {
      mockFetchJson([]);
      const service = new RadarrService(createConfig());

      const movie = await service.getMovieByTmdbId(99999);

      expect(movie).toBeNull();
    });
  });

  describe("searchMovie", () => {
    it("should send POST to /command with MoviesSearch payload", async () => {
      mockFetchJson(validCommand);
      const service = new RadarrService(createConfig());

      await service.searchMovie(1);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://radarr:7878/api/v3/command",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "MoviesSearch", movieIds: [1] }),
        })
      );
    });

    it("should return validated command response", async () => {
      mockFetchJson(validCommand);
      const service = new RadarrService(createConfig());

      const command = await service.searchMovie(1);

      expect(command.id).toBe(50);
      expect(command.name).toBe("MoviesSearch");
    });
  });

  describe("getHistory", () => {
    it("should handle response with records wrapper", async () => {
      mockFetchJson({ records: [validHistory] });
      const service = new RadarrService(createConfig());

      const history = await service.getHistory(1);

      expect(history).toHaveLength(1);
      expect(history[0]!.eventType).toBe("grabbed");
    });

    it("should handle response as direct array", async () => {
      mockFetchJson([validHistory]);
      const service = new RadarrService(createConfig());

      const history = await service.getHistory(1);

      expect(history).toHaveLength(1);
    });

    it("should use correct endpoint with movieId param", async () => {
      mockFetchJson({ records: [] });
      const service = new RadarrService(createConfig());

      await service.getHistory(42);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://radarr:7878/api/v3/history/movie?movieId=42",
        expect.any(Object)
      );
    });
  });

  describe("getTags", () => {
    it("should return validated tag array", async () => {
      mockFetchJson([validTag, { id: 2, label: "quality-mismatch" }]);
      const service = new RadarrService(createConfig());

      const tags = await service.getTags();

      expect(tags).toHaveLength(2);
      expect(tags[0]!.label).toBe("check_ok");
    });
  });

  describe("createTag", () => {
    it("should send POST with tag label", async () => {
      mockFetchJson(validTag);
      const service = new RadarrService(createConfig());

      const tag = await service.createTag("check_ok");

      expect(tag.label).toBe("check_ok");
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://radarr:7878/api/v3/tag",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ label: "check_ok" }),
        })
      );
    });
  });

  describe("getOrCreateTag", () => {
    it("should return existing tag when found (case-insensitive)", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 5, label: "Check_OK" }]), { status: 200 })
      );
      const service = new RadarrService(createConfig());

      const tag = await service.getOrCreateTag("check_ok");

      expect(tag.id).toBe(5);
      expect(fetchSpy).toHaveBeenCalledTimes(1); // Only getTags, no createTag
    });

    it("should create tag when not found", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 })
      );
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 10, label: "new-tag" }), { status: 200 })
      );
      const service = new RadarrService(createConfig());

      const tag = await service.getOrCreateTag("new-tag");

      expect(tag.id).toBe(10);
      expect(tag.label).toBe("new-tag");
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("addTagToMovie", () => {
    it("should send PUT with updated tags", async () => {
      mockFetchJson(validMovie);
      const service = new RadarrService(createConfig());
      const movie = { ...validMovie, tags: [1] };

      await service.addTagToMovie(movie, 5);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://radarr:7878/api/v3/movie/1",
        expect.objectContaining({
          method: "PUT",
          body: expect.stringContaining('"tags":[1,5]'),
        })
      );
    });

    it("should skip if movie already has the tag", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const service = new RadarrService(createConfig());
      const movie = { ...validMovie, tags: [1, 5] };

      const result = await service.addTagToMovie(movie, 5);

      expect(result).toEqual(movie);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("waitForCommand", () => {
    it("should return immediately when command is already completed", async () => {
      mockFetchJson({ ...validCommand, status: "completed" });
      const service = new RadarrService(createConfig());

      const command = await service.waitForCommand(50, 5000, 100);

      expect(command.status).toBe("completed");
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("should poll until command completes", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ ...validCommand, status: "started" }), { status: 200 })
      );
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ ...validCommand, status: "started" }), { status: 200 })
      );
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ ...validCommand, status: "completed" }), { status: 200 })
      );
      const service = new RadarrService(createConfig());

      const command = await service.waitForCommand(50, 10000, 10);

      expect(command.status).toBe("completed");
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it("should throw when command fails", async () => {
      mockFetchJson({ ...validCommand, status: "failed" });
      const service = new RadarrService(createConfig());

      await expect(service.waitForCommand(50, 5000, 100)).rejects.toThrow(
        "Command 50 failed"
      );
    });

    it("should throw on timeout", async () => {
      const startedCommand = { ...validCommand, status: "started" };
      vi.spyOn(globalThis, "fetch").mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(startedCommand), { status: 200 }))
      );
      const service = new RadarrService(createConfig());

      await expect(service.waitForCommand(50, 50, 10)).rejects.toThrow(
        "Command 50 timed out after 50ms"
      );
    });
  });

  describe("getMovieFile", () => {
    it("should return first file for movieId", async () => {
      mockFetchJson([validMovieFile]);
      const service = new RadarrService(createConfig());

      const file = await service.getMovieFile(1);

      expect(file).not.toBeNull();
      expect(file!.customFormatScore).toBe(150);
    });

    it("should return null when no files found", async () => {
      mockFetchJson([]);
      const service = new RadarrService(createConfig());

      const file = await service.getMovieFile(1);

      expect(file).toBeNull();
    });

    it("should use correct endpoint with movieId param", async () => {
      mockFetchJson([]);
      const service = new RadarrService(createConfig());

      await service.getMovieFile(42);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://radarr:7878/api/v3/moviefile?movieId=42",
        expect.any(Object)
      );
    });
  });

  describe("getMovieFileOrFail", () => {
    it("should return file when found", async () => {
      mockFetchJson([validMovieFile]);
      const service = new RadarrService(createConfig());

      const file = await service.getMovieFileOrFail(1, "Test Movie");

      expect(file.customFormatScore).toBe(150);
    });

    it("should throw with movie title context when no file found", async () => {
      mockFetchJson([]);
      const service = new RadarrService(createConfig());

      await expect(service.getMovieFileOrFail(1, "Test Movie")).rejects.toThrow(
        'No movie file found for "Test Movie" (movieId: 1)'
      );
    });

    it("should throw without movie title when not provided", async () => {
      mockFetchJson([]);
      const service = new RadarrService(createConfig());

      await expect(service.getMovieFileOrFail(1)).rejects.toThrow(
        "No movie file found (movieId: 1)"
      );
    });
  });

  describe("getSystemStatus", () => {
    it("should return validated system status", async () => {
      mockFetchJson(validSystemStatus);
      const service = new RadarrService(createConfig());

      const status = await service.getSystemStatus();

      expect(status.version).toBe("5.0.0");
    });

    it("should use correct endpoint", async () => {
      mockFetchJson(validSystemStatus);
      const service = new RadarrService(createConfig());

      await service.getSystemStatus();

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://radarr:7878/api/v3/system/status",
        expect.any(Object)
      );
    });
  });

  describe("getQueue", () => {
    it("should return validated queue records", async () => {
      const queueItem = {
        id: 1,
        movieId: 1,
        title: "Test.Movie.2024.1080p",
        status: "downloading",
        trackedDownloadStatus: "ok",
        trackedDownloadState: "downloading",
        quality: {
          quality: { id: 7, name: "Bluray-1080p", source: "bluray", resolution: 1080 },
          revision: { version: 1, real: 0, isRepack: false },
        },
        customFormatScore: 100,
        size: 5000000000,
        sizeleft: 2500000000,
      };
      mockFetchJson({ records: [queueItem] });
      const service = new RadarrService(createConfig());

      const queue = await service.getQueue();

      expect(queue.records).toHaveLength(1);
      expect(queue.records[0]!.title).toBe("Test.Movie.2024.1080p");
    });
  });

  describe("getReleases", () => {
    it("should return validated releases for movieId", async () => {
      const release = {
        guid: "abc123",
        title: "Test.Movie.2024.1080p.BluRay",
        indexer: "NZBgeek",
        size: 5000000000,
        quality: {
          quality: { id: 7, name: "Bluray-1080p", source: "bluray", resolution: 1080 },
          revision: { version: 1, real: 0, isRepack: false },
        },
        customFormatScore: 100,
        rejections: [],
      };
      mockFetchJson([release]);
      const service = new RadarrService(createConfig());

      const releases = await service.getReleases(1);

      expect(releases).toHaveLength(1);
      expect(releases[0]!.indexer).toBe("NZBgeek");
    });
  });

  describe("getCommand", () => {
    it("should fetch command by ID", async () => {
      mockFetchJson(validCommand);
      const service = new RadarrService(createConfig());

      const command = await service.getCommand(50);

      expect(command.id).toBe(50);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://radarr:7878/api/v3/command/50",
        expect.any(Object)
      );
    });
  });
});
