import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parse } from "yaml";
import { configSchema, type Config } from "../types/index.js";

const DEFAULT_CONFIG_PATHS = [
  "./config.yaml",
  "./config.yml",
  "/etc/qualitarr/config.yaml",
  "/etc/qualitarr/config.yml",
];

export async function loadConfig(configPath?: string): Promise<Config> {
  const pathsToTry = configPath ? [configPath] : DEFAULT_CONFIG_PATHS;

  for (const path of pathsToTry) {
    if (existsSync(path)) {
      const content = await readFile(path, "utf-8");
      const rawConfig: unknown = parse(content);

      const result = configSchema.safeParse(rawConfig);

      if (!result.success) {
        const errors = result.error.issues
          .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
          .join("\n");
        throw new Error(`Config validation failed:\n${errors}`);
      }

      return result.data;
    }
  }

  throw new Error(
    `Config file not found. Tried: ${pathsToTry.join(", ")}`
  );
}
