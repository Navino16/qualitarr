import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DiscordService } from '../../src/services/discord.js';
import type { ScoreMismatchInfo, BatchSummaryInfo } from '../../src/services/discord.js';

describe('DiscordService', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 204 })
    );
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  function createService(enabled = true, webhookUrl = 'https://discord.com/api/webhooks/123/abc'): DiscordService {
    return new DiscordService({ enabled, webhookUrl });
  }

  function createBasicMismatchInfo(): ScoreMismatchInfo {
    return {
      title: 'Test Movie',
      year: 2024,
      expectedScore: 100,
      actualScore: 50,
      difference: -50,
      maxOverScore: 100,
      quality: 'Bluray-1080p',
    };
  }

  describe('sendScoreMismatch', () => {
    it('should skip when disabled', async () => {
      const discord = createService(false);

      await discord.sendScoreMismatch(createBasicMismatchInfo());

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should skip when webhook URL is not set', async () => {
      const discord = new DiscordService({ enabled: true });

      await discord.sendScoreMismatch(createBasicMismatchInfo());

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should send a POST request to the webhook URL', async () => {
      const discord = createService();

      await discord.sendScoreMismatch(createBasicMismatchInfo());

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://discord.com/api/webhooks/123/abc',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should include basic embed fields in the payload', async () => {
      const discord = createService();

      await discord.sendScoreMismatch(createBasicMismatchInfo());

      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      const embed = body.embeds[0];

      expect(embed.title).toBe('Quality Score Mismatch');
      expect(embed.description).toContain('Test Movie (2024)');
      expect(embed.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Expected Score', value: '100' }),
          expect.objectContaining({ name: 'Actual Score', value: '50' }),
          expect.objectContaining({ name: 'Difference', value: '-50' }),
          expect.objectContaining({ name: 'Quality', value: 'Bluray-1080p' }),
        ])
      );
    });

    it('should format title without year when year is not provided', async () => {
      const discord = createService();
      const info = { ...createBasicMismatchInfo() };
      delete info.year;

      await discord.sendScoreMismatch(info);

      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      expect(body.embeds[0].description).toBe('**Test Movie**');
    });

    it('should show positive sign for positive differences', async () => {
      const discord = createService();
      const info = { ...createBasicMismatchInfo(), difference: 20 };

      await discord.sendScoreMismatch(info);

      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      const diffField = body.embeds[0].fields.find((f: { name: string }) => f.name === 'Difference');
      expect(diffField.value).toBe('+20');
    });

    it('should include indexer field when provided', async () => {
      const discord = createService();
      const info = { ...createBasicMismatchInfo(), indexer: 'NZBgeek' };

      await discord.sendScoreMismatch(info);

      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      const indexerField = body.embeds[0].fields.find((f: { name: string }) => f.name === 'Indexer');
      expect(indexerField).toBeDefined();
      expect(indexerField.value).toBe('NZBgeek');
    });

    it('should not include indexer field when not provided', async () => {
      const discord = createService();

      await discord.sendScoreMismatch(createBasicMismatchInfo());

      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      const indexerField = body.embeds[0].fields.find((f: { name: string }) => f.name === 'Indexer');
      expect(indexerField).toBeUndefined();
    });

    it('should include clickable Radarr link when radarrUrl and movieId are provided', async () => {
      const discord = createService();
      const info = {
        ...createBasicMismatchInfo(),
        radarrUrl: 'http://radarr:7878',
        movieId: 42,
      };

      await discord.sendScoreMismatch(info);

      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      expect(body.embeds[0].description).toContain('[Test Movie (2024)](http://radarr:7878/movie/42)');
    });

    it('should not include link when only radarrUrl is provided without movieId', async () => {
      const discord = createService();
      const info = {
        ...createBasicMismatchInfo(),
        radarrUrl: 'http://radarr:7878',
      };

      await discord.sendScoreMismatch(info);

      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      expect(body.embeds[0].description).toBe('**Test Movie (2024)**');
    });

    it('should include poster thumbnail when posterUrl is provided', async () => {
      const discord = createService();
      const info = {
        ...createBasicMismatchInfo(),
        posterUrl: 'https://image.tmdb.org/poster.jpg',
      };

      await discord.sendScoreMismatch(info);

      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      expect(body.embeds[0].thumbnail).toEqual({ url: 'https://image.tmdb.org/poster.jpg' });
    });

    it('should not include thumbnail when posterUrl is not provided', async () => {
      const discord = createService();

      await discord.sendScoreMismatch(createBasicMismatchInfo());

      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      expect(body.embeds[0].thumbnail).toBeUndefined();
    });

    it('should include dynamic version in footer', async () => {
      const discord = createService();

      await discord.sendScoreMismatch(createBasicMismatchInfo());

      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      expect(body.embeds[0].footer.text).toMatch(/^Qualitarr v\d+\.\d+\.\d+/);
    });

    it('should use red color for very bad differences (< -50)', async () => {
      const discord = createService();
      const info = { ...createBasicMismatchInfo(), difference: -51 };

      await discord.sendScoreMismatch(info);

      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      expect(body.embeds[0].color).toBe(0xff0000);
    });

    it('should use orange color for bad differences (-50 to -21)', async () => {
      const discord = createService();
      const info = { ...createBasicMismatchInfo(), difference: -30 };

      await discord.sendScoreMismatch(info);

      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      expect(body.embeds[0].color).toBe(0xff8c00);
    });

    it('should use yellow color for slight mismatches (-20 to -1)', async () => {
      const discord = createService();
      const info = { ...createBasicMismatchInfo(), difference: -10 };

      await discord.sendScoreMismatch(info);

      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      expect(body.embeds[0].color).toBe(0xffff00);
    });

    it('should use green color for positive or zero differences', async () => {
      const discord = createService();
      const info = { ...createBasicMismatchInfo(), difference: 10 };

      await discord.sendScoreMismatch(info);

      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      expect(body.embeds[0].color).toBe(0x00ff00);
    });

    it('should throw on non-OK response', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 500, statusText: 'Internal Server Error' }));
      const discord = createService();

      await expect(discord.sendScoreMismatch(createBasicMismatchInfo()))
        .rejects.toThrow('Discord webhook error: 500 Internal Server Error');
    });
  });

  describe('sendBatchSummary', () => {
    function createBasicBatchInfo(): BatchSummaryInfo {
      return {
        totalProcessed: 10,
        completed: 8,
        failed: 2,
        mismatches: 3,
        durationMs: 125000,
        failedItems: [],
      };
    }

    it('should skip when disabled', async () => {
      const discord = createService(false);

      await discord.sendBatchSummary(createBasicBatchInfo());

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should skip when webhook URL is not set', async () => {
      const discord = new DiscordService({ enabled: true });

      await discord.sendBatchSummary(createBasicBatchInfo());

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should send a POST request to the webhook URL', async () => {
      const discord = createService();

      await discord.sendBatchSummary(createBasicBatchInfo());

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://discord.com/api/webhooks/123/abc',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should include all stats fields in the embed', async () => {
      const discord = createService();

      await discord.sendBatchSummary(createBasicBatchInfo());

      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      const embed = body.embeds[0];

      expect(embed.title).toBe('Batch Processing Summary');
      expect(embed.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Total Processed', value: '10' }),
          expect.objectContaining({ name: 'Completed', value: '8' }),
          expect.objectContaining({ name: 'Failed', value: '2' }),
          expect.objectContaining({ name: 'Mismatches', value: '3' }),
          expect.objectContaining({ name: 'Duration', value: '2m 5s' }),
        ])
      );
    });

    it('should format duration as seconds only when under a minute', async () => {
      const discord = createService();
      const info = { ...createBasicBatchInfo(), durationMs: 45000 };

      await discord.sendBatchSummary(info);

      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      const durationField = body.embeds[0].fields.find((f: { name: string }) => f.name === 'Duration');
      expect(durationField.value).toBe('45s');
    });

    it('should use orange color when there are failures', async () => {
      const discord = createService();

      await discord.sendBatchSummary(createBasicBatchInfo());

      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      expect(body.embeds[0].color).toBe(0xff8c00);
    });

    it('should use green color when there are no failures', async () => {
      const discord = createService();
      const info = { ...createBasicBatchInfo(), failed: 0 };

      await discord.sendBatchSummary(info);

      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      expect(body.embeds[0].color).toBe(0x00ff00);
    });

    it('should include failed items list when present', async () => {
      const discord = createService();
      const info = {
        ...createBasicBatchInfo(),
        failedItems: [
          { title: 'Movie A', error: 'Timeout' },
          { title: 'Movie B', error: 'No file found' },
        ],
      };

      await discord.sendBatchSummary(info);

      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      const failedField = body.embeds[0].fields.find((f: { name: string }) => f.name === 'Failed Items');
      expect(failedField).toBeDefined();
      expect(failedField.value).toContain('Movie A: Timeout');
      expect(failedField.value).toContain('Movie B: No file found');
    });

    it('should truncate failed items list to 5 and show count of remaining', async () => {
      const discord = createService();
      const failedItems = Array.from({ length: 8 }, (_, i) => ({
        title: `Movie ${i + 1}`,
        error: `Error ${i + 1}`,
      }));

      await discord.sendBatchSummary({ ...createBasicBatchInfo(), failedItems });

      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      const failedField = body.embeds[0].fields.find((f: { name: string }) => f.name === 'Failed Items');
      expect(failedField.value).toContain('Movie 5: Error 5');
      expect(failedField.value).not.toContain('Movie 6');
      expect(failedField.value).toContain('... and 3 more');
    });

    it('should not include failed items field when list is empty', async () => {
      const discord = createService();
      const info = { ...createBasicBatchInfo(), failedItems: [] };

      await discord.sendBatchSummary(info);

      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      const failedField = body.embeds[0].fields.find((f: { name: string }) => f.name === 'Failed Items');
      expect(failedField).toBeUndefined();
    });

    it('should include dynamic version in footer', async () => {
      const discord = createService();

      await discord.sendBatchSummary(createBasicBatchInfo());

      const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string);
      expect(body.embeds[0].footer.text).toMatch(/^Qualitarr v\d+\.\d+\.\d+/);
    });

    it('should throw on non-OK response', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 400, statusText: 'Bad Request' }));
      const discord = createService();

      await expect(discord.sendBatchSummary(createBasicBatchInfo()))
        .rejects.toThrow('Discord webhook error: 400 Bad Request');
    });
  });
});
