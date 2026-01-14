import type { RadarrHistory } from "../types/radarr.js";
import type { HistoryEventPair } from "../types/score.js";

/**
 * Event types used in Radarr history
 */
export const HISTORY_EVENT_TYPES = {
  GRABBED: "grabbed",
  IMPORTED: "downloadFolderImported",
} as const;

/**
 * Find grabbed and imported events from a history array
 */
export function findHistoryEvents(history: RadarrHistory[]): HistoryEventPair {
  return {
    grabbed: history.find((h) => h.eventType === HISTORY_EVENT_TYPES.GRABBED) ?? null,
    imported: history.find((h) => h.eventType === HISTORY_EVENT_TYPES.IMPORTED) ?? null,
  };
}

/**
 * Find a new history event that doesn't exist in the initial set
 */
export function findNewHistoryEvent(
  history: RadarrHistory[],
  eventType: string,
  initialEventIds: Set<number>
): RadarrHistory | null {
  return history.find(
    (h) => h.eventType === eventType && !initialEventIds.has(h.id)
  ) ?? null;
}

/**
 * Options for waiting for a history event
 */
export interface WaitForHistoryEventOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  initialEventIds?: Set<number>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a new history event to appear
 *
 * @param fetchHistory - Function to fetch current history
 * @param eventType - The event type to wait for
 * @param options - Polling options
 * @returns The new history event or null if timed out
 */
export async function waitForHistoryEvent(
  fetchHistory: () => Promise<RadarrHistory[]>,
  eventType: string,
  options: WaitForHistoryEventOptions = {}
): Promise<RadarrHistory | null> {
  const {
    timeoutMs = 60000,
    pollIntervalMs = 5000,
    initialEventIds,
  } = options;

  const startTime = Date.now();

  // If no initial IDs provided, fetch them now
  let knownEventIds: Set<number>;
  if (initialEventIds) {
    knownEventIds = initialEventIds;
  } else {
    const initialHistory = await fetchHistory();
    knownEventIds = new Set(initialHistory.map((h) => h.id));
  }

  while (Date.now() - startTime < timeoutMs) {
    // Sleep first to give time for the event to occur
    await sleep(pollIntervalMs);

    const history = await fetchHistory();
    const newEvent = findNewHistoryEvent(history, eventType, knownEventIds);

    if (newEvent) {
      return newEvent;
    }
  }

  return null;
}
