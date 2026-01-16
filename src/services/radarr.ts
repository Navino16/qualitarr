import type { z } from "zod/v4";
import type {
  RadarrConfig,
  ApiConfig,
  RadarrMovie,
  RadarrMovieFile,
  RadarrQueueItem,
  RadarrRelease,
  RadarrHistory,
  RadarrTag,
  RadarrCommand,
} from "../types/index.js";
import {
  radarrMovieSchema,
  radarrMovieFileSchema,
  radarrQueueItemSchema,
  radarrReleaseSchema,
  radarrHistorySchema,
  radarrTagSchema,
  radarrCommandSchema,
} from "../types/radarr.js";
import { logger, sleep } from "../utils/index.js";

class RetryableError extends Error {
  constructor(
    message: string,
    public retryAfterMs?: number
  ) {
    super(message);
    this.name = "RetryableError";
  }
}

export class RadarrService {
  private baseUrl: string;
  private apiKey: string;
  private apiConfig: ApiConfig;

  constructor(config: RadarrConfig) {
    this.baseUrl = config.url.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.apiConfig = config.api;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v3${endpoint}`;
    const headers: Record<string, string> = {
      "X-Api-Key": this.apiKey,
      "Content-Type": "application/json",
    };
    if (
      options.headers &&
      typeof options.headers === "object" &&
      !Array.isArray(options.headers)
    ) {
      Object.assign(headers, options.headers);
    }

    logger.debug(`Radarr API request: ${options.method ?? "GET"} ${endpoint}`);

    return this.requestWithRetry<T>(url, { ...options, headers }, endpoint);
  }

  private async requestWithRetry<T>(
    url: string,
    options: RequestInit,
    endpoint: string
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.apiConfig.retryAttempts; attempt++) {
      if (attempt > 0) {
        const delay = this.calculateRetryDelay(attempt);
        logger.debug(
          `Retry attempt ${attempt} after ${delay}ms for ${endpoint}`
        );
        await sleep(delay);
      }

      try {
        return await this.executeRequest<T>(url, options, endpoint);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (!this.isRetryableError(lastError)) {
          throw lastError;
        }

        logger.debug(
          `Request failed (attempt ${attempt + 1}): ${lastError.message}`
        );
      }
    }

    throw (
      lastError ??
      new Error(`Request failed after ${this.apiConfig.retryAttempts} retries`)
    );
  }

  private async executeRequest<T>(
    url: string,
    options: RequestInit,
    endpoint: string
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.apiConfig.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          `Radarr API timeout after ${this.apiConfig.timeoutMs}ms (${endpoint})`
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Radarr API connection failed (${endpoint}): ${message}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const delay = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : this.apiConfig.retryDelayMs;
      throw new RetryableError(
        `Rate limited (429), retry after ${delay}ms`,
        delay
      );
    }

    if (!response.ok) {
      const isRetryable = response.status >= 500 || response.status === 408;
      if (isRetryable) {
        throw new RetryableError(
          `Radarr API error: ${response.status} ${response.statusText} (${endpoint})`
        );
      }
      throw new Error(
        `Radarr API error: ${response.status} ${response.statusText} (${endpoint})`
      );
    }

    return response.json() as Promise<T>;
  }

  private validateResponse<T>(
    data: unknown,
    schema: z.ZodType<T>,
    endpoint: string
  ): T {
    const result = schema.safeParse(data);
    if (!result.success) {
      logger.debug(`Validation error for ${endpoint}: ${result.error.message}`);
      throw new Error(
        `Invalid API response from ${endpoint}: ${result.error.message}`
      );
    }
    return result.data;
  }

  private validateArrayResponse<T>(
    data: unknown,
    schema: z.ZodType<T>,
    endpoint: string
  ): T[] {
    if (!Array.isArray(data)) {
      throw new Error(`Expected array response from ${endpoint}`);
    }
    return data.map((item, index) => {
      const result = schema.safeParse(item);
      if (!result.success) {
        logger.debug(
          `Validation error for ${endpoint}[${index}]: ${result.error.message}`
        );
        throw new Error(
          `Invalid API response from ${endpoint}[${index}]: ${result.error.message}`
        );
      }
      return result.data;
    });
  }

  private calculateRetryDelay(attempt: number): number {
    // Exponential backoff: delay * 2^(attempt-1)
    return Math.min(
      this.apiConfig.retryDelayMs * Math.pow(2, attempt - 1),
      30000 // Max 30 seconds
    );
  }

  private isRetryableError(error: Error): boolean {
    return error instanceof RetryableError;
  }

  private buildEndpoint(
    path: string,
    params?: Record<string, string | number | boolean>
  ): string {
    if (!params || Object.keys(params).length === 0) {
      return path;
    }
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      searchParams.append(key, String(value));
    }
    return `${path}?${searchParams.toString()}`;
  }

  async getMovies(): Promise<RadarrMovie[]> {
    const data = await this.request<unknown>("/movie");
    return this.validateArrayResponse(data, radarrMovieSchema, "/movie");
  }

  async getMovie(id: number): Promise<RadarrMovie> {
    const endpoint = `/movie/${id}`;
    const data = await this.request<unknown>(endpoint);
    return this.validateResponse(data, radarrMovieSchema, endpoint);
  }

  async getMovieByTmdbId(tmdbId: number): Promise<RadarrMovie | null> {
    const endpoint = this.buildEndpoint("/movie", { tmdbId });
    const data = await this.request<unknown>(endpoint);
    const movies = this.validateArrayResponse(
      data,
      radarrMovieSchema,
      endpoint
    );
    return movies[0] ?? null;
  }

  async searchMovie(movieId: number): Promise<RadarrCommand> {
    const data = await this.request<unknown>("/command", {
      method: "POST",
      body: JSON.stringify({
        name: "MoviesSearch",
        movieIds: [movieId],
      }),
    });
    return this.validateResponse(data, radarrCommandSchema, "/command");
  }

  async getQueue(): Promise<{ records: RadarrQueueItem[] }> {
    const endpoint = this.buildEndpoint("/queue", { includeMovie: true });
    const data = await this.request<{ records: unknown[] }>(endpoint);
    const records = this.validateArrayResponse(
      data.records,
      radarrQueueItemSchema,
      endpoint
    );
    return { records };
  }

  async getReleases(movieId: number): Promise<RadarrRelease[]> {
    const endpoint = this.buildEndpoint("/release", { movieId });
    const data = await this.request<unknown>(endpoint);
    return this.validateArrayResponse(data, radarrReleaseSchema, endpoint);
  }

  async getMovieFile(movieId: number): Promise<RadarrMovieFile | null> {
    const endpoint = this.buildEndpoint("/moviefile", { movieId });
    const data = await this.request<unknown>(endpoint);
    const files = this.validateArrayResponse(
      data,
      radarrMovieFileSchema,
      endpoint
    );
    return files[0] ?? null;
  }

  async getMovieFileOrFail(
    movieId: number,
    movieTitle?: string
  ): Promise<RadarrMovieFile> {
    const movieFile = await this.getMovieFile(movieId);
    if (!movieFile) {
      const context = movieTitle ? ` for "${movieTitle}"` : "";
      throw new Error(`No movie file found${context} (movieId: ${movieId})`);
    }
    return movieFile;
  }

  async getHistory(movieId: number): Promise<RadarrHistory[]> {
    const endpoint = this.buildEndpoint("/history/movie", { movieId });
    const data = await this.request<{ records?: unknown[] } | unknown[]>(
      endpoint
    );
    // API can return { records: [...] } or directly [...]
    const records = Array.isArray(data) ? data : (data.records ?? []);
    return this.validateArrayResponse(records, radarrHistorySchema, endpoint);
  }

  async getTags(): Promise<RadarrTag[]> {
    const data = await this.request<unknown>("/tag");
    return this.validateArrayResponse(data, radarrTagSchema, "/tag");
  }

  async createTag(label: string): Promise<RadarrTag> {
    const data = await this.request<unknown>("/tag", {
      method: "POST",
      body: JSON.stringify({ label }),
    });
    return this.validateResponse(data, radarrTagSchema, "/tag");
  }

  async addTagToMovie(movie: RadarrMovie, tagId: number): Promise<RadarrMovie> {
    if (movie.tags.includes(tagId)) {
      logger.debug(`Movie ${movie.title} already has tag ${tagId}`);
      return movie;
    }

    const endpoint = `/movie/${movie.id}`;
    const data = await this.request<unknown>(endpoint, {
      method: "PUT",
      body: JSON.stringify({
        ...movie,
        tags: [...movie.tags, tagId],
      }),
    });
    return this.validateResponse(data, radarrMovieSchema, endpoint);
  }

  async getOrCreateTag(label: string): Promise<RadarrTag> {
    const tags = await this.getTags();
    const existing = tags.find(
      (t) => t.label.toLowerCase() === label.toLowerCase()
    );

    if (existing) {
      return existing;
    }

    logger.info(`Creating tag: ${label}`);
    return this.createTag(label);
  }

  async getCommand(commandId: number): Promise<RadarrCommand> {
    const endpoint = `/command/${commandId}`;
    const data = await this.request<unknown>(endpoint);
    return this.validateResponse(data, radarrCommandSchema, endpoint);
  }

  async waitForCommand(
    commandId: number,
    timeoutMs = 300000,
    pollIntervalMs = 2000
  ): Promise<RadarrCommand> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const command = await this.getCommand(commandId);

      if (command.status === "completed") {
        return command;
      }

      if (command.status === "failed") {
        throw new Error(`Command ${commandId} failed`);
      }

      await sleep(pollIntervalMs);
    }

    throw new Error(`Command ${commandId} timed out after ${timeoutMs}ms`);
  }
}
