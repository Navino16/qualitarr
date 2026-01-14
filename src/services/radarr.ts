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
import { logger } from "../utils/index.js";

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
        await this.sleep(delay);
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    return this.request<RadarrMovie[]>("/movie");
  }

  async getMovie(id: number): Promise<RadarrMovie> {
    return this.request<RadarrMovie>(`/movie/${id}`);
  }

  async getMovieByTmdbId(tmdbId: number): Promise<RadarrMovie | null> {
    const endpoint = this.buildEndpoint("/movie", { tmdbId });
    const movies = await this.request<RadarrMovie[]>(endpoint);
    return movies[0] ?? null;
  }

  async searchMovie(movieId: number): Promise<RadarrCommand> {
    return this.request<RadarrCommand>("/command", {
      method: "POST",
      body: JSON.stringify({
        name: "MoviesSearch",
        movieIds: [movieId],
      }),
    });
  }

  async getQueue(): Promise<{ records: RadarrQueueItem[] }> {
    const endpoint = this.buildEndpoint("/queue", { includeMovie: true });
    return this.request<{ records: RadarrQueueItem[] }>(endpoint);
  }

  async getReleases(movieId: number): Promise<RadarrRelease[]> {
    const endpoint = this.buildEndpoint("/release", { movieId });
    return this.request<RadarrRelease[]>(endpoint);
  }

  async getMovieFile(movieId: number): Promise<RadarrMovieFile | null> {
    const endpoint = this.buildEndpoint("/moviefile", { movieId });
    const files = await this.request<RadarrMovieFile[]>(endpoint);
    return files[0] ?? null;
  }

  async getHistory(movieId: number): Promise<RadarrHistory[]> {
    const endpoint = this.buildEndpoint("/history/movie", { movieId });
    const result = await this.request<
      { records: RadarrHistory[] } | RadarrHistory[]
    >(endpoint);
    // API can return { records: [...] } or directly [...]
    if (Array.isArray(result)) {
      return result;
    }
    return result.records;
  }

  async getTags(): Promise<RadarrTag[]> {
    return this.request<RadarrTag[]>("/tag");
  }

  async createTag(label: string): Promise<RadarrTag> {
    return this.request<RadarrTag>("/tag", {
      method: "POST",
      body: JSON.stringify({ label }),
    });
  }

  async addTagToMovie(movie: RadarrMovie, tagId: number): Promise<RadarrMovie> {
    if (movie.tags.includes(tagId)) {
      logger.debug(`Movie ${movie.title} already has tag ${tagId}`);
      return movie;
    }

    return this.request<RadarrMovie>(`/movie/${movie.id}`, {
      method: "PUT",
      body: JSON.stringify({
        ...movie,
        tags: [...movie.tags, tagId],
      }),
    });
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
    return this.request<RadarrCommand>(`/command/${commandId}`);
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

      await this.sleep(pollIntervalMs);
    }

    throw new Error(`Command ${commandId} timed out after ${timeoutMs}ms`);
  }
}
