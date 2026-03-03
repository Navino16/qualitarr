import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { healthCommand } from '../../src/commands/health.js';
import type { Config } from '../../src/types/config.js';

const mockGetSystemStatus = vi.fn();
const mockGetMovies = vi.fn();
const mockSendScoreMismatch = vi.fn();

vi.mock('../../src/services/index.js', () => ({
  RadarrService: function () {
    return {
      getSystemStatus: mockGetSystemStatus,
      getMovies: mockGetMovies,
    };
  },
  DiscordService: function () {
    return {
      sendScoreMismatch: mockSendScoreMismatch,
    };
  },
  compareScores: vi.fn(),
  handleScoreResult: vi.fn(),
  logScoreComparison: vi.fn(),
  logDryRunResult: vi.fn(),
  logScoreSummary: vi.fn(),
}));

describe('healthCommand', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  function createBaseConfig(overrides?: Partial<Config>): Config {
    return {
      discord: { enabled: false },
      tag: { enabled: true, successTag: 'check_ok', mismatchTag: 'quality-mismatch' },
      quality: { maxOverScore: 100, maxUnderScore: 0 },
      batch: {
        maxConcurrentDownloads: 3,
        searchIntervalSeconds: 30,
        downloadCheckIntervalSeconds: 10,
        downloadTimeoutMinutes: 60,
        commandTimeoutMs: 60000,
        commandPollIntervalMs: 2000,
        grabWaitTimeoutMs: 30000,
        historyPollIntervalMs: 3000,
      },
      ...overrides,
    } as Config;
  }

  it('should display version header', async () => {
    const config = createBaseConfig();

    await healthCommand(config);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toMatch(/Qualitarr v\d+\.\d+\.\d+ - Health Check/);
  });

  it('should warn when Radarr is not configured', async () => {
    const config = createBaseConfig();

    await healthCommand(config);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('[Radarr] Not configured');
  });

  it('should test Radarr connectivity when configured', async () => {
    mockGetSystemStatus.mockResolvedValue({ version: '5.2.1' });
    mockGetMovies.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

    const config = createBaseConfig({
      radarr: { url: 'http://radarr:7878', apiKey: 'test-key', api: { timeoutMs: 30000, retryAttempts: 3, retryDelayMs: 1000 } },
    });

    await healthCommand(config);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('[Radarr] Connected - Radarr v5.2.1');
    expect(output).toContain('[Radarr] Movie count: 3');
  });

  it('should handle Radarr connection failure gracefully', async () => {
    mockGetSystemStatus.mockRejectedValue(new Error('Connection refused'));

    const config = createBaseConfig({
      radarr: { url: 'http://radarr:7878', apiKey: 'test-key', api: { timeoutMs: 30000, retryAttempts: 3, retryDelayMs: 1000 } },
    });

    await healthCommand(config);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('[Radarr] Connection failed');
    expect(output).toContain('Connection refused');
  });

  it('should show Discord as disabled when not enabled', async () => {
    const config = createBaseConfig();

    await healthCommand(config);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('[Discord] Disabled');
  });

  it('should show masked webhook URL when Discord is enabled', async () => {
    const config = createBaseConfig({
      discord: {
        enabled: true,
        webhookUrl: 'https://discord.com/api/webhooks/1234567890/abcdefghijklmnopqrstuvwxyz1234567890',
      },
    });

    await healthCommand(config);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('[Discord] Enabled - Webhook:');
    expect(output).not.toContain('abcdefghijklmnopqrstuvwxyz1234567890');
    expect(output).toContain('abcd');
    expect(output).toContain('...');
  });

  it('should not send test notification when --notify is not set', async () => {
    const config = createBaseConfig({
      discord: {
        enabled: true,
        webhookUrl: 'https://discord.com/api/webhooks/123/abcdefghij',
      },
    });

    await healthCommand(config);

    expect(mockSendScoreMismatch).not.toHaveBeenCalled();
  });

  it('should send test notification when --notify is set', async () => {
    mockSendScoreMismatch.mockResolvedValue(undefined);

    const config = createBaseConfig({
      discord: {
        enabled: true,
        webhookUrl: 'https://discord.com/api/webhooks/123/abcdefghij',
      },
    });

    await healthCommand(config, { notify: true });

    expect(mockSendScoreMismatch).toHaveBeenCalledTimes(1);
    expect(mockSendScoreMismatch).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Health Check Test',
        quality: 'Bluray-1080p',
      })
    );
  });

  it('should handle test notification failure gracefully', async () => {
    mockSendScoreMismatch.mockRejectedValue(new Error('Webhook error'));

    const config = createBaseConfig({
      discord: {
        enabled: true,
        webhookUrl: 'https://discord.com/api/webhooks/123/abcdefghij',
      },
    });

    // Should not throw
    await healthCommand(config, { notify: true });

    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('[Discord] Failed to send test notification');
  });

  it('should display quality thresholds', async () => {
    const config = createBaseConfig({
      quality: { maxOverScore: 50, maxUnderScore: 10 },
    });

    await healthCommand(config);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('Max over score: 50');
    expect(output).toContain('Max under score: 10');
  });

  it('should display tag configuration when enabled', async () => {
    const config = createBaseConfig({
      tag: { enabled: true, successTag: 'my-ok', mismatchTag: 'my-fail' },
    });

    await healthCommand(config);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('Enabled: true');
    expect(output).toContain('Success tag: my-ok');
    expect(output).toContain('Mismatch tag: my-fail');
  });

  it('should not display tag names when tags are disabled', async () => {
    const config = createBaseConfig({
      tag: { enabled: false, successTag: 'check_ok', mismatchTag: 'quality-mismatch' },
    });

    await healthCommand(config);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('Enabled: false');
    expect(output).not.toContain('Success tag:');
  });

  it('should display batch settings', async () => {
    const config = createBaseConfig({
      batch: {
        maxConcurrentDownloads: 5,
        searchIntervalSeconds: 60,
        downloadCheckIntervalSeconds: 10,
        downloadTimeoutMinutes: 120,
        commandTimeoutMs: 60000,
        commandPollIntervalMs: 2000,
        grabWaitTimeoutMs: 30000,
        historyPollIntervalMs: 3000,
      },
    });

    await healthCommand(config);

    const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
    expect(output).toContain('Max concurrent downloads: 5');
    expect(output).toContain('Search interval: 60s');
    expect(output).toContain('Download timeout: 120min');
  });
});
