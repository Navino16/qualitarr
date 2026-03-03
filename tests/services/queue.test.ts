import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Config } from "../../src/types/config.js";

const { mockRadarr, mockDiscord } = vi.hoisted(() => {
  const mockRadarr = {
    getMovies: vi.fn(),
    getMovie: vi.fn(),
    getMovieByTmdbId: vi.fn(),
    getMovieFile: vi.fn(),
    getMovieFileOrFail: vi.fn(),
    getHistory: vi.fn(),
    searchMovie: vi.fn(),
    waitForCommand: vi.fn(),
    getTags: vi.fn(),
    createTag: vi.fn(),
    getOrCreateTag: vi.fn(),
    addTagToMovie: vi.fn(),
    getSystemStatus: vi.fn(),
  };

  const mockDiscord = {
    sendScoreMismatch: vi.fn().mockResolvedValue(undefined),
    sendBatchSummary: vi.fn().mockResolvedValue(undefined),
  };

  return { mockRadarr, mockDiscord };
});

vi.mock("../../src/services/radarr.js", () => ({
  RadarrService: vi.fn().mockImplementation(function () { return mockRadarr; }),
}));

vi.mock("../../src/services/discord.js", () => ({
  DiscordService: vi.fn().mockImplementation(function () { return mockDiscord; }),
}));

vi.mock("../../src/utils/async.js", () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

import { QueueManager } from "../../src/services/queue.js";

function createConfig(overrides?: Partial<Config>): Config {
  return {
    radarr: {
      url: "http://radarr:7878",
      apiKey: "test-key",
      api: { timeoutMs: 5000, retryAttempts: 2, retryDelayMs: 100 },
    },
    discord: { enabled: false },
    tag: { enabled: true, successTag: "check_ok", mismatchTag: "quality-mismatch" },
    quality: { maxOverScore: 100, maxUnderScore: 0 },
    batch: {
      maxConcurrentDownloads: 3,
      searchIntervalSeconds: 1,
      downloadCheckIntervalSeconds: 1,
      downloadTimeoutMinutes: 1,
      commandTimeoutMs: 5000,
      commandPollIntervalMs: 100,
      grabWaitTimeoutMs: 500,
      historyPollIntervalMs: 100,
    },
    ...overrides,
  } as Config;
}

const validMovie = {
  id: 1,
  title: "Test Movie",
  year: 2024,
  tmdbId: 12345,
  hasFile: true,
  monitored: true,
  tags: [],
};

const validHistory = {
  id: 100,
  movieId: 1,
  sourceTitle: "Test.Movie.2024.1080p",
  quality: {
    quality: { id: 7, name: "Bluray-1080p", source: "bluray", resolution: 1080 },
    revision: { version: 1, real: 0, isRepack: false },
  },
  customFormatScore: 100,
  date: "2024-01-01T00:00:00Z",
  eventType: "grabbed",
  data: { indexer: "NZBgeek" },
};

const validMovieFile = {
  id: 10,
  movieId: 1,
  relativePath: "movie.mkv",
  path: "/movies/movie.mkv",
  size: 5000000000,
  quality: {
    quality: { id: 7, name: "Bluray-1080p", source: "bluray", resolution: 1080 },
    revision: { version: 1, real: 0, isRepack: false },
  },
  customFormatScore: 100,
};

describe("QueueManager", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe("constructor", () => {
    it("should throw if radarr config is missing", () => {
      const config = createConfig();
      delete (config as Record<string, unknown>).radarr;

      expect(() => new QueueManager(config)).toThrow(
        "Radarr configuration is required"
      );
    });

    it("should create instance with valid config", () => {
      const manager = new QueueManager(createConfig());

      expect(manager).toBeInstanceOf(QueueManager);
    });

    it("should accept dryRun option", () => {
      const manager = new QueueManager(createConfig(), { dryRun: true });

      expect(manager).toBeInstanceOf(QueueManager);
    });
  });

  describe("loadMoviesWithoutTag", () => {
    it("should load monitored movies without success/mismatch tags", async () => {
      mockRadarr.getMovies.mockResolvedValue([
        { ...validMovie, id: 1, tags: [] },
        { ...validMovie, id: 2, tags: [10] }, // has success tag
        { ...validMovie, id: 3, tags: [] },
        { ...validMovie, id: 4, monitored: false, tags: [] }, // not monitored
      ]);
      mockRadarr.getTags.mockResolvedValue([
        { id: 10, label: "check_ok" },
        { id: 20, label: "quality-mismatch" },
      ]);
      mockRadarr.getHistory.mockResolvedValue([]);

      const manager = new QueueManager(createConfig());
      const count = await manager.loadMoviesWithoutTag();

      expect(count).toBe(2);
    });

    it("should exclude movies with mismatch tag", async () => {
      mockRadarr.getMovies.mockResolvedValue([
        { ...validMovie, id: 1, tags: [20] },
        { ...validMovie, id: 2, tags: [] },
      ]);
      mockRadarr.getTags.mockResolvedValue([
        { id: 10, label: "check_ok" },
        { id: 20, label: "quality-mismatch" },
      ]);
      mockRadarr.getHistory.mockResolvedValue([]);

      const manager = new QueueManager(createConfig());
      const count = await manager.loadMoviesWithoutTag();

      expect(count).toBe(1);
    });

    it("should respect limit parameter", async () => {
      mockRadarr.getMovies.mockResolvedValue([
        { ...validMovie, id: 1 },
        { ...validMovie, id: 2 },
        { ...validMovie, id: 3 },
      ]);
      mockRadarr.getTags.mockResolvedValue([]);
      mockRadarr.getHistory.mockResolvedValue([]);

      const manager = new QueueManager(createConfig());
      const count = await manager.loadMoviesWithoutTag(2);

      expect(count).toBe(2);
    });

    it("should handle case when tags do not exist yet", async () => {
      mockRadarr.getMovies.mockResolvedValue([{ ...validMovie, id: 1 }]);
      mockRadarr.getTags.mockResolvedValue([]);
      mockRadarr.getHistory.mockResolvedValue([]);

      const manager = new QueueManager(createConfig());
      const count = await manager.loadMoviesWithoutTag();

      expect(count).toBe(1);
    });
  });

  describe("run() dry-run mode", () => {
    it("should log without taking real actions", async () => {
      mockRadarr.getMovies.mockResolvedValue([
        { ...validMovie, id: 1, hasFile: true },
      ]);
      mockRadarr.getTags.mockResolvedValue([]);
      mockRadarr.getHistory.mockResolvedValue([validHistory]);
      mockRadarr.getMovieFile.mockResolvedValue(validMovieFile);

      const manager = new QueueManager(createConfig(), { dryRun: true });
      await manager.loadMoviesWithoutTag();
      await manager.run();

      expect(mockRadarr.searchMovie).not.toHaveBeenCalled();
      expect(mockDiscord.sendScoreMismatch).not.toHaveBeenCalled();
      expect(mockDiscord.sendBatchSummary).not.toHaveBeenCalled();
    });

    it("should handle movie without grabbed event in dry-run", async () => {
      mockRadarr.getMovies.mockResolvedValue([{ ...validMovie, id: 1 }]);
      mockRadarr.getTags.mockResolvedValue([]);
      mockRadarr.getHistory.mockResolvedValue([]);

      const manager = new QueueManager(createConfig(), { dryRun: true });
      await manager.loadMoviesWithoutTag();
      await manager.run();

      expect(mockRadarr.searchMovie).not.toHaveBeenCalled();
    });

    it("should handle movie without file in dry-run", async () => {
      mockRadarr.getMovies.mockResolvedValue([
        { ...validMovie, id: 1, hasFile: false },
      ]);
      mockRadarr.getTags.mockResolvedValue([]);
      mockRadarr.getHistory.mockResolvedValue([validHistory]);

      const manager = new QueueManager(createConfig(), { dryRun: true });
      await manager.loadMoviesWithoutTag();
      await manager.run();

      expect(mockRadarr.getMovieFile).not.toHaveBeenCalled();
    });

    it("should handle null movieFile in dry-run", async () => {
      mockRadarr.getMovies.mockResolvedValue([
        { ...validMovie, id: 1, hasFile: true },
      ]);
      mockRadarr.getTags.mockResolvedValue([]);
      mockRadarr.getHistory.mockResolvedValue([validHistory]);
      mockRadarr.getMovieFile.mockResolvedValue(null);

      const manager = new QueueManager(createConfig(), { dryRun: true });
      await manager.loadMoviesWithoutTag();
      await manager.run();

      expect(mockRadarr.searchMovie).not.toHaveBeenCalled();
    });
  });

  describe("run() normal mode - no-grab scenario", () => {
    it("should compare with last grabbed event when no new grab occurs", async () => {
      mockRadarr.getMovies.mockResolvedValue([{ ...validMovie, id: 1 }]);
      mockRadarr.getTags.mockResolvedValue([]);
      mockRadarr.getHistory.mockResolvedValue([validHistory]);
      mockRadarr.searchMovie.mockResolvedValue({ id: 50, name: "MoviesSearch", status: "queued", queued: "2024-01-01T00:00:00Z" });
      mockRadarr.waitForCommand.mockResolvedValue({ id: 50, name: "MoviesSearch", status: "completed", queued: "2024-01-01T00:00:00Z" });
      mockRadarr.getMovieFile.mockResolvedValue(validMovieFile);
      mockRadarr.getMovie.mockResolvedValue(validMovie);
      mockRadarr.getOrCreateTag.mockResolvedValue({ id: 10, label: "check_ok" });
      mockRadarr.addTagToMovie.mockResolvedValue(validMovie);

      const manager = new QueueManager(createConfig());
      await manager.loadMoviesWithoutTag();
      await manager.run();

      expect(mockRadarr.searchMovie).toHaveBeenCalledWith(1);
      expect(mockRadarr.getOrCreateTag).toHaveBeenCalled();
    });

    it("should apply success tag when no grab history exists at all", async () => {
      mockRadarr.getMovies.mockResolvedValue([{ ...validMovie, id: 1 }]);
      mockRadarr.getTags.mockResolvedValue([]);
      mockRadarr.getHistory.mockResolvedValue([]);
      mockRadarr.searchMovie.mockResolvedValue({ id: 50, name: "MoviesSearch", status: "queued", queued: "2024-01-01T00:00:00Z" });
      mockRadarr.waitForCommand.mockResolvedValue({ id: 50, name: "MoviesSearch", status: "completed", queued: "2024-01-01T00:00:00Z" });
      mockRadarr.getMovie.mockResolvedValue(validMovie);
      mockRadarr.getOrCreateTag.mockResolvedValue({ id: 10, label: "check_ok" });
      mockRadarr.addTagToMovie.mockResolvedValue(validMovie);

      const manager = new QueueManager(createConfig());
      await manager.loadMoviesWithoutTag();
      await manager.run();

      expect(mockRadarr.getOrCreateTag).toHaveBeenCalledWith("check_ok");
    });

    it("should fail item when no movie file found in no-grab scenario", async () => {
      mockRadarr.getMovies.mockResolvedValue([{ ...validMovie, id: 1 }]);
      mockRadarr.getTags.mockResolvedValue([]);
      mockRadarr.getHistory.mockResolvedValue([validHistory]);
      mockRadarr.searchMovie.mockResolvedValue({ id: 50, name: "MoviesSearch", status: "queued", queued: "2024-01-01T00:00:00Z" });
      mockRadarr.waitForCommand.mockResolvedValue({ id: 50, name: "MoviesSearch", status: "completed", queued: "2024-01-01T00:00:00Z" });
      mockRadarr.getMovieFile.mockResolvedValue(null);

      const manager = new QueueManager(createConfig());
      await manager.loadMoviesWithoutTag();
      await manager.run();

      expect(mockDiscord.sendBatchSummary).toHaveBeenCalled();
    });
  });

  describe("run() normal mode - grab + download + import flow", () => {
    it("should process full flow: search -> grab -> download -> import -> score", async () => {
      const grabbedHistory = { ...validHistory, id: 200, eventType: "grabbed" };
      const importedHistory = { ...validHistory, id: 201, eventType: "downloadFolderImported" };

      mockRadarr.getMovies.mockResolvedValue([{ ...validMovie, id: 1 }]);
      mockRadarr.getTags.mockResolvedValue([]);
      mockRadarr.searchMovie.mockResolvedValue({ id: 50, name: "MoviesSearch", status: "queued", queued: "2024-01-01T00:00:00Z" });
      mockRadarr.waitForCommand.mockResolvedValue({ id: 50, name: "MoviesSearch", status: "completed", queued: "2024-01-01T00:00:00Z" });
      mockRadarr.getMovieFile.mockResolvedValue(validMovieFile);
      mockRadarr.getMovie.mockResolvedValue(validMovie);
      mockRadarr.getOrCreateTag.mockResolvedValue({ id: 10, label: "check_ok" });
      mockRadarr.addTagToMovie.mockResolvedValue(validMovie);

      let historyCallCount = 0;
      mockRadarr.getHistory.mockImplementation(() => {
        historyCallCount++;
        if (historyCallCount === 1) {
          return Promise.resolve([]);
        }
        if (historyCallCount <= 3) {
          return Promise.resolve([grabbedHistory]);
        }
        return Promise.resolve([grabbedHistory, importedHistory]);
      });

      const manager = new QueueManager(createConfig());
      await manager.loadMoviesWithoutTag();
      await manager.run();

      expect(mockRadarr.searchMovie).toHaveBeenCalledWith(1);
      expect(mockDiscord.sendBatchSummary).toHaveBeenCalled();
    });
  });

  describe("run() error handling", () => {
    it("should handle search errors gracefully", async () => {
      mockRadarr.getMovies.mockResolvedValue([{ ...validMovie, id: 1 }]);
      mockRadarr.getTags.mockResolvedValue([]);
      mockRadarr.getHistory.mockResolvedValue([]);
      mockRadarr.searchMovie.mockRejectedValue(new Error("API down"));

      const manager = new QueueManager(createConfig());
      await manager.loadMoviesWithoutTag();
      await manager.run();

      expect(mockDiscord.sendBatchSummary).toHaveBeenCalledWith(
        expect.objectContaining({ failed: 1 })
      );
    });

    it("should not run when already running", async () => {
      mockRadarr.getMovies.mockResolvedValue([]);
      mockRadarr.getTags.mockResolvedValue([]);

      const manager = new QueueManager(createConfig());

      const firstRun = manager.run();
      const secondRun = manager.run();

      await firstRun;
      await secondRun;

      expect(mockDiscord.sendBatchSummary).toHaveBeenCalledTimes(1);
    });

    it("should handle Discord batch summary error gracefully", async () => {
      mockRadarr.getMovies.mockResolvedValue([]);
      mockRadarr.getTags.mockResolvedValue([]);
      mockDiscord.sendBatchSummary.mockRejectedValue(new Error("Discord down"));

      const manager = new QueueManager(createConfig());
      await expect(manager.run()).resolves.not.toThrow();
    });
  });

  describe("shutdown", () => {
    it("should not error when not running", () => {
      const manager = new QueueManager(createConfig());

      expect(() => manager.shutdown()).not.toThrow();
    });
  });

  describe("sendBatchSummaryNotification", () => {
    it("should send summary with correct stats after run", async () => {
      mockRadarr.getMovies.mockResolvedValue([
        { ...validMovie, id: 1 },
        { ...validMovie, id: 2 },
      ]);
      mockRadarr.getTags.mockResolvedValue([]);
      mockRadarr.getHistory.mockResolvedValue([validHistory]);
      mockRadarr.searchMovie.mockResolvedValue({ id: 50, name: "MoviesSearch", status: "queued", queued: "2024-01-01T00:00:00Z" });
      mockRadarr.waitForCommand.mockResolvedValue({ id: 50, name: "MoviesSearch", status: "completed", queued: "2024-01-01T00:00:00Z" });
      mockRadarr.getMovieFile.mockResolvedValue(validMovieFile);
      mockRadarr.getMovie.mockResolvedValue(validMovie);
      mockRadarr.getOrCreateTag.mockResolvedValue({ id: 10, label: "check_ok" });
      mockRadarr.addTagToMovie.mockResolvedValue(validMovie);

      const config = createConfig({ discord: { enabled: true, webhookUrl: "https://discord.com/api/webhooks/123/abc" } });
      const manager = new QueueManager(config);
      await manager.loadMoviesWithoutTag();
      await manager.run();

      expect(mockDiscord.sendBatchSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          totalProcessed: 2,
          completed: 2,
        })
      );
    });
  });
});
