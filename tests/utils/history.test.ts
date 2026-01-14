import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  findHistoryEvents,
  findNewHistoryEvent,
  waitForHistoryEvent,
  HISTORY_EVENT_TYPES,
} from '../../src/utils/history.js';
import type { RadarrHistory } from '../../src/types/radarr.js';

function createMockHistory(overrides: Partial<RadarrHistory> = {}): RadarrHistory {
  return {
    id: 1,
    movieId: 100,
    sourceTitle: 'Test.Movie.2024.1080p.BluRay',
    quality: {
      quality: { id: 7, name: 'Bluray-1080p', source: 'bluray', resolution: 1080 },
      revision: { version: 1, real: 0, isRepack: false },
    },
    customFormatScore: 50,
    date: '2024-01-01T12:00:00Z',
    eventType: 'grabbed',
    data: {},
    ...overrides,
  };
}

describe('HISTORY_EVENT_TYPES', () => {
  it('should have correct values', () => {
    expect(HISTORY_EVENT_TYPES.GRABBED).toBe('grabbed');
    expect(HISTORY_EVENT_TYPES.IMPORTED).toBe('downloadFolderImported');
  });
});

describe('findHistoryEvents', () => {
  it('should find both grabbed and imported events', () => {
    const history: RadarrHistory[] = [
      createMockHistory({ id: 1, eventType: 'grabbed' }),
      createMockHistory({ id: 2, eventType: 'downloadFolderImported' }),
    ];

    const result = findHistoryEvents(history);

    expect(result.grabbed).not.toBeNull();
    expect(result.grabbed?.id).toBe(1);
    expect(result.imported).not.toBeNull();
    expect(result.imported?.id).toBe(2);
  });

  it('should return null for missing grabbed event', () => {
    const history: RadarrHistory[] = [
      createMockHistory({ id: 1, eventType: 'downloadFolderImported' }),
    ];

    const result = findHistoryEvents(history);

    expect(result.grabbed).toBeNull();
    expect(result.imported).not.toBeNull();
  });

  it('should return null for missing imported event', () => {
    const history: RadarrHistory[] = [
      createMockHistory({ id: 1, eventType: 'grabbed' }),
    ];

    const result = findHistoryEvents(history);

    expect(result.grabbed).not.toBeNull();
    expect(result.imported).toBeNull();
  });

  it('should return nulls for empty history', () => {
    const result = findHistoryEvents([]);

    expect(result.grabbed).toBeNull();
    expect(result.imported).toBeNull();
  });

  it('should find first matching event when multiple exist', () => {
    const history: RadarrHistory[] = [
      createMockHistory({ id: 1, eventType: 'grabbed', customFormatScore: 100 }),
      createMockHistory({ id: 2, eventType: 'grabbed', customFormatScore: 50 }),
    ];

    const result = findHistoryEvents(history);

    expect(result.grabbed?.id).toBe(1);
    expect(result.grabbed?.customFormatScore).toBe(100);
  });

  it('should ignore unrelated event types', () => {
    const history: RadarrHistory[] = [
      createMockHistory({ id: 1, eventType: 'episodeFileDeleted' }),
      createMockHistory({ id: 2, eventType: 'movieFileRenamed' }),
    ];

    const result = findHistoryEvents(history);

    expect(result.grabbed).toBeNull();
    expect(result.imported).toBeNull();
  });
});

describe('findNewHistoryEvent', () => {
  it('should find new event not in initialEventIds', () => {
    const history: RadarrHistory[] = [
      createMockHistory({ id: 1, eventType: 'grabbed' }),
      createMockHistory({ id: 2, eventType: 'grabbed' }),
    ];
    const initialEventIds = new Set([1]);

    const result = findNewHistoryEvent(history, 'grabbed', initialEventIds);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(2);
  });

  it('should return null when all events are in initialEventIds', () => {
    const history: RadarrHistory[] = [
      createMockHistory({ id: 1, eventType: 'grabbed' }),
      createMockHistory({ id: 2, eventType: 'grabbed' }),
    ];
    const initialEventIds = new Set([1, 2]);

    const result = findNewHistoryEvent(history, 'grabbed', initialEventIds);

    expect(result).toBeNull();
  });

  it('should return null for empty history', () => {
    const initialEventIds = new Set<number>();

    const result = findNewHistoryEvent([], 'grabbed', initialEventIds);

    expect(result).toBeNull();
  });

  it('should only match the specified event type', () => {
    const history: RadarrHistory[] = [
      createMockHistory({ id: 1, eventType: 'grabbed' }),
      createMockHistory({ id: 2, eventType: 'downloadFolderImported' }),
    ];
    const initialEventIds = new Set<number>();

    const result = findNewHistoryEvent(history, 'downloadFolderImported', initialEventIds);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(2);
  });

  it('should return first new event matching criteria', () => {
    const history: RadarrHistory[] = [
      createMockHistory({ id: 1, eventType: 'grabbed' }),
      createMockHistory({ id: 2, eventType: 'grabbed' }),
      createMockHistory({ id: 3, eventType: 'grabbed' }),
    ];
    const initialEventIds = new Set([1]);

    const result = findNewHistoryEvent(history, 'grabbed', initialEventIds);

    expect(result?.id).toBe(2);
  });
});

describe('waitForHistoryEvent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return event when found', async () => {
    const newEvent = createMockHistory({ id: 2, eventType: 'grabbed' });
    let callCount = 0;
    const fetchHistory = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return [createMockHistory({ id: 1, eventType: 'grabbed' })];
      }
      return [
        createMockHistory({ id: 1, eventType: 'grabbed' }),
        newEvent,
      ];
    });

    const promise = waitForHistoryEvent(fetchHistory, 'grabbed', {
      pollIntervalMs: 100,
      timeoutMs: 5000,
    });

    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;

    expect(result).not.toBeNull();
    expect(result?.id).toBe(2);
  });

  it('should return null on timeout', async () => {
    const fetchHistory = vi.fn(async () => [
      createMockHistory({ id: 1, eventType: 'grabbed' }),
    ]);

    const promise = waitForHistoryEvent(fetchHistory, 'grabbed', {
      pollIntervalMs: 100,
      timeoutMs: 500,
    });

    await vi.advanceTimersByTimeAsync(600);

    const result = await promise;

    expect(result).toBeNull();
  });

  it('should use provided initialEventIds', async () => {
    const fetchHistory = vi.fn(async () => [
      createMockHistory({ id: 1, eventType: 'grabbed' }),
      createMockHistory({ id: 2, eventType: 'grabbed' }),
    ]);
    const initialEventIds = new Set([1]);

    const promise = waitForHistoryEvent(fetchHistory, 'grabbed', {
      pollIntervalMs: 100,
      timeoutMs: 5000,
      initialEventIds,
    });

    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;

    expect(result).not.toBeNull();
    expect(result?.id).toBe(2);
    expect(fetchHistory).toHaveBeenCalledTimes(1);
  });
});
