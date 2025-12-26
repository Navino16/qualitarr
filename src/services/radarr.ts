import type {
  RadarrConfig,
  RadarrMovie,
  RadarrQueueItem,
  RadarrRelease,
  RadarrHistory,
  RadarrTag,
  RadarrCommand,
} from "../types/index.js";
import { logger } from "../utils/index.js";

export class RadarrService {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: RadarrConfig) {
    this.baseUrl = config.url.replace(/\/$/, "");
    this.apiKey = config.apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v3${endpoint}`;
    const headers = {
      "X-Api-Key": this.apiKey,
      "Content-Type": "application/json",
      ...options.headers,
    };

    logger.debug(`Radarr API request: ${options.method ?? "GET"} ${endpoint}`);

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      throw new Error(
        `Radarr API error: ${response.status} ${response.statusText}`
      );
    }

    return response.json() as Promise<T>;
  }

  async getMovies(): Promise<RadarrMovie[]> {
    return this.request<RadarrMovie[]>("/movie");
  }

  async getMovie(id: number): Promise<RadarrMovie> {
    return this.request<RadarrMovie>(`/movie/${id}`);
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
    return this.request<{ records: RadarrQueueItem[] }>(
      "/queue?includeMovie=true"
    );
  }

  async getReleases(movieId: number): Promise<RadarrRelease[]> {
    return this.request<RadarrRelease[]>(`/release?movieId=${movieId}`);
  }

  async getHistory(movieId: number): Promise<RadarrHistory[]> {
    const result = await this.request<{ records: RadarrHistory[] }>(
      `/history/movie?movieId=${movieId}`
    );
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

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Command ${commandId} timed out after ${timeoutMs}ms`);
  }
}
