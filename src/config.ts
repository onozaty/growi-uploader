import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface Config {
  url: string;
  token: string;
  basePath?: string;
  update?: boolean;
}

export const loadConfig = (configPath: string): Config => {
  const fullPath = resolve(configPath);

  try {
    const content = readFileSync(fullPath, "utf-8");
    const config = JSON.parse(content) as Config;

    // Validate required fields
    if (!config.url) {
      throw new Error("Missing required field: url");
    }
    if (!config.token) {
      throw new Error("Missing required field: token");
    }

    // Set defaults
    if (config.basePath === undefined) {
      config.basePath = "/";
    }
    if (config.update === undefined) {
      config.update = false;
    }

    return config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Config file not found: ${fullPath}`);
    }
    throw error;
  }
};
