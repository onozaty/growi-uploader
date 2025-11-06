import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Config file format (JSON input)
 * basePath, update, and verbose are optional in the file
 */
interface ConfigInput {
  url: string;
  token: string;
  basePath?: string;
  update?: boolean;
  verbose?: boolean;
}

/**
 * Runtime config (with defaults applied)
 * basePath, update, and verbose are always present
 */
export interface Config {
  url: string;
  token: string;
  basePath: string;
  update: boolean;
  verbose: boolean;
}

/**
 * Load configuration from JSON file
 *
 * @param configPath - Path to the configuration file
 * @returns Configuration object with defaults applied:
 *   - basePath defaults to "/" if not specified or empty
 *   - update defaults to false if not specified
 *   - verbose defaults to false if not specified
 * @throws Error if config file is not found or required fields (url, token) are missing
 */
export const loadConfig = (configPath: string): Config => {
  const fullPath = resolve(configPath);

  try {
    const content = readFileSync(fullPath, "utf-8");
    const input = JSON.parse(content) as ConfigInput;

    // Validate required fields
    if (!input.url) {
      throw new Error("Missing required field: url");
    }
    if (!input.token) {
      throw new Error("Missing required field: token");
    }

    // Return config with defaults applied
    return {
      url: input.url,
      token: input.token,
      basePath: input.basePath || "/",
      update: input.update ?? false,
      verbose: input.verbose ?? false,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Config file not found: ${fullPath}`);
    }
    throw error;
  }
};
