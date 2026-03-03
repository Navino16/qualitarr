import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../../src/utils/config.js";

// Mock node:fs/promises and node:fs
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("yaml", () => ({
  parse: vi.fn(),
}));

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parse } from "yaml";

const mockedReadFile = vi.mocked(readFile);
const mockedExistsSync = vi.mocked(existsSync);
const mockedParse = vi.mocked(parse);

function validRawConfig(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    radarr: {
      url: "http://radarr:7878",
      apiKey: "test-api-key",
    },
    ...overrides,
  };
}

describe("loadConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("file loading", () => {
    it("should load config from explicit path", async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFile.mockResolvedValue("yaml content");
      mockedParse.mockReturnValue(validRawConfig());

      const config = await loadConfig("/custom/config.yaml");

      expect(mockedExistsSync).toHaveBeenCalledWith("/custom/config.yaml");
      expect(mockedReadFile).toHaveBeenCalledWith("/custom/config.yaml", "utf-8");
    });

    it("should try default paths when no explicit path given", async () => {
      mockedExistsSync.mockReturnValueOnce(false); // ./config.yaml
      mockedExistsSync.mockReturnValueOnce(false); // ./config.yml
      mockedExistsSync.mockReturnValueOnce(true);  // /etc/qualitarr/config.yaml
      mockedReadFile.mockResolvedValue("yaml content");
      mockedParse.mockReturnValue(validRawConfig());

      await loadConfig();

      expect(mockedExistsSync).toHaveBeenCalledTimes(3);
      expect(mockedReadFile).toHaveBeenCalledWith(
        "/etc/qualitarr/config.yaml",
        "utf-8"
      );
    });

    it("should throw when config file not found", async () => {
      mockedExistsSync.mockReturnValue(false);

      await expect(loadConfig()).rejects.toThrow("Config file not found");
    });

    it("should throw when explicit path not found", async () => {
      mockedExistsSync.mockReturnValue(false);

      await expect(loadConfig("/missing.yaml")).rejects.toThrow(
        "Config file not found. Tried: /missing.yaml"
      );
    });
  });

  describe("Zod validation - valid configs", () => {
    it("should accept minimal valid config with radarr only", async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFile.mockResolvedValue("");
      mockedParse.mockReturnValue(validRawConfig());

      const config = await loadConfig("/config.yaml");

      expect(config.radarr).toBeDefined();
      expect(config.radarr!.url).toBe("http://radarr:7878");
      expect(config.radarr!.apiKey).toBe("test-api-key");
    });

    it("should accept config with sonarr only", async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFile.mockResolvedValue("");
      mockedParse.mockReturnValue({
        sonarr: {
          url: "http://sonarr:8989",
          apiKey: "sonarr-key",
        },
      });

      const config = await loadConfig("/config.yaml");

      expect(config.sonarr).toBeDefined();
      expect(config.sonarr!.url).toBe("http://sonarr:8989");
    });

    it("should apply default values for optional sections", async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFile.mockResolvedValue("");
      mockedParse.mockReturnValue(validRawConfig());

      const config = await loadConfig("/config.yaml");

      // Discord defaults
      expect(config.discord.enabled).toBe(false);
      // Tag defaults
      expect(config.tag.enabled).toBe(true);
      expect(config.tag.successTag).toBe("check_ok");
      expect(config.tag.mismatchTag).toBe("quality-mismatch");
      // Quality defaults
      expect(config.quality.maxOverScore).toBe(100);
      expect(config.quality.maxUnderScore).toBe(0);
      // Batch defaults
      expect(config.batch.maxConcurrentDownloads).toBe(3);
      expect(config.batch.searchIntervalSeconds).toBe(30);
      expect(config.batch.downloadCheckIntervalSeconds).toBe(10);
      expect(config.batch.downloadTimeoutMinutes).toBe(60);
      // API defaults
      expect(config.radarr!.api.timeoutMs).toBe(30000);
      expect(config.radarr!.api.retryAttempts).toBe(3);
      expect(config.radarr!.api.retryDelayMs).toBe(1000);
    });

    it("should apply batch timing defaults", async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFile.mockResolvedValue("");
      mockedParse.mockReturnValue(validRawConfig());

      const config = await loadConfig("/config.yaml");

      expect(config.batch.commandTimeoutMs).toBe(60000);
      expect(config.batch.commandPollIntervalMs).toBe(2000);
      expect(config.batch.grabWaitTimeoutMs).toBe(30000);
      expect(config.batch.historyPollIntervalMs).toBe(3000);
    });
  });

  describe("Zod validation - invalid configs", () => {
    it("should throw when neither radarr nor sonarr is configured", async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFile.mockResolvedValue("");
      mockedParse.mockReturnValue({});

      await expect(loadConfig("/config.yaml")).rejects.toThrow(
        "Config validation failed"
      );
    });

    it("should throw on invalid Radarr URL", async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFile.mockResolvedValue("");
      mockedParse.mockReturnValue({
        radarr: { url: "not-a-url", apiKey: "key" },
      });

      await expect(loadConfig("/config.yaml")).rejects.toThrow(
        "Config validation failed"
      );
    });

    it("should throw on empty apiKey", async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFile.mockResolvedValue("");
      mockedParse.mockReturnValue({
        radarr: { url: "http://radarr:7878", apiKey: "" },
      });

      await expect(loadConfig("/config.yaml")).rejects.toThrow(
        "Config validation failed"
      );
    });

    it("should throw when discord enabled without webhookUrl", async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFile.mockResolvedValue("");
      mockedParse.mockReturnValue({
        ...validRawConfig(),
        discord: { enabled: true },
      });

      await expect(loadConfig("/config.yaml")).rejects.toThrow(
        "Config validation failed"
      );
    });

    it("should throw on out-of-range api timeoutMs", async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFile.mockResolvedValue("");
      mockedParse.mockReturnValue({
        radarr: {
          url: "http://radarr:7878",
          apiKey: "key",
          api: { timeoutMs: 500 }, // min is 1000
        },
      });

      await expect(loadConfig("/config.yaml")).rejects.toThrow(
        "Config validation failed"
      );
    });

    it("should throw on out-of-range retryAttempts", async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFile.mockResolvedValue("");
      mockedParse.mockReturnValue({
        radarr: {
          url: "http://radarr:7878",
          apiKey: "key",
          api: { retryAttempts: 15 }, // max is 10
        },
      });

      await expect(loadConfig("/config.yaml")).rejects.toThrow(
        "Config validation failed"
      );
    });

    it("should throw on out-of-range batch maxConcurrentDownloads", async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFile.mockResolvedValue("");
      mockedParse.mockReturnValue({
        ...validRawConfig(),
        batch: { maxConcurrentDownloads: 0 }, // min is 1
      });

      await expect(loadConfig("/config.yaml")).rejects.toThrow(
        "Config validation failed"
      );
    });

    it("should throw on negative quality maxUnderScore", async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFile.mockResolvedValue("");
      mockedParse.mockReturnValue({
        ...validRawConfig(),
        quality: { maxUnderScore: -1 }, // min is 0
      });

      await expect(loadConfig("/config.yaml")).rejects.toThrow(
        "Config validation failed"
      );
    });
  });

  describe("Zod validation - error formatting", () => {
    it("should include field path in error message", async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFile.mockResolvedValue("");
      mockedParse.mockReturnValue({
        radarr: { url: "not-a-url", apiKey: "key" },
      });

      try {
        await loadConfig("/config.yaml");
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as Error).message).toContain("radarr");
      }
    });
  });

  describe("valid config with overrides", () => {
    it("should accept discord enabled with webhookUrl", async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFile.mockResolvedValue("");
      mockedParse.mockReturnValue({
        ...validRawConfig(),
        discord: {
          enabled: true,
          webhookUrl: "https://discord.com/api/webhooks/123/abc",
        },
      });

      const config = await loadConfig("/config.yaml");

      expect(config.discord.enabled).toBe(true);
      expect(config.discord.webhookUrl).toBe(
        "https://discord.com/api/webhooks/123/abc"
      );
    });

    it("should accept custom quality thresholds", async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFile.mockResolvedValue("");
      mockedParse.mockReturnValue({
        ...validRawConfig(),
        quality: { maxOverScore: 50, maxUnderScore: 25 },
      });

      const config = await loadConfig("/config.yaml");

      expect(config.quality.maxOverScore).toBe(50);
      expect(config.quality.maxUnderScore).toBe(25);
    });

    it("should accept custom batch settings", async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFile.mockResolvedValue("");
      mockedParse.mockReturnValue({
        ...validRawConfig(),
        batch: {
          maxConcurrentDownloads: 5,
          searchIntervalSeconds: 60,
          downloadTimeoutMinutes: 120,
        },
      });

      const config = await loadConfig("/config.yaml");

      expect(config.batch.maxConcurrentDownloads).toBe(5);
      expect(config.batch.searchIntervalSeconds).toBe(60);
      expect(config.batch.downloadTimeoutMinutes).toBe(120);
    });

    it("should accept custom tag names", async () => {
      mockedExistsSync.mockReturnValue(true);
      mockedReadFile.mockResolvedValue("");
      mockedParse.mockReturnValue({
        ...validRawConfig(),
        tag: {
          enabled: true,
          successTag: "custom-ok",
          mismatchTag: "custom-mismatch",
        },
      });

      const config = await loadConfig("/config.yaml");

      expect(config.tag.successTag).toBe("custom-ok");
      expect(config.tag.mismatchTag).toBe("custom-mismatch");
    });
  });
});
