import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "./config";
import { createTempDir, cleanupTempDir } from "../test/utils";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

describe("loadConfig", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("should load valid config with all fields", async () => {
    const mockConfig = {
      url: "https://example.com",
      token: "test-token",
      basePath: "/imported",
      update: true,
    };

    const configPath = join(tempDir, "config.json");
    await writeFile(configPath, JSON.stringify(mockConfig), "utf-8");

    const config = loadConfig(configPath);

    expect(config.url).toBe("https://example.com");
    expect(config.token).toBe("test-token");
    expect(config.basePath).toBe("/imported");
    expect(config.update).toBe(true);
  });

  it("should load config with required fields only and apply defaults", async () => {
    const mockConfig = {
      url: "https://example.com",
      token: "test-token",
    };

    const configPath = join(tempDir, "config.json");
    await writeFile(configPath, JSON.stringify(mockConfig), "utf-8");

    const config = loadConfig(configPath);

    expect(config.url).toBe("https://example.com");
    expect(config.token).toBe("test-token");
    expect(config.basePath).toBe("/");
    expect(config.update).toBe(false);
  });

  it("should throw error when url is missing", async () => {
    const mockConfig = {
      token: "test-token",
    };

    const configPath = join(tempDir, "config.json");
    await writeFile(configPath, JSON.stringify(mockConfig), "utf-8");

    expect(() => loadConfig(configPath)).toThrow("Missing required field: url");
  });

  it("should throw error when token is missing", async () => {
    const mockConfig = {
      url: "https://example.com",
    };

    const configPath = join(tempDir, "config.json");
    await writeFile(configPath, JSON.stringify(mockConfig), "utf-8");

    expect(() => loadConfig(configPath)).toThrow(
      "Missing required field: token",
    );
  });

  it("should throw error for invalid JSON", async () => {
    const configPath = join(tempDir, "config.json");
    await writeFile(configPath, "{ invalid json }", "utf-8");

    expect(() => loadConfig(configPath)).toThrow();
  });

  it("should throw error when config file not found", () => {
    const missingPath = join(tempDir, "missing-config.json");

    expect(() => loadConfig(missingPath)).toThrow(/Config file not found/);
  });

  it("should apply default basePath when set to undefined explicitly", async () => {
    const mockConfig = {
      url: "https://example.com",
      token: "test-token",
      basePath: undefined,
      update: true,
    };

    const configPath = join(tempDir, "config.json");
    await writeFile(configPath, JSON.stringify(mockConfig), "utf-8");

    const config = loadConfig(configPath);

    expect(config.basePath).toBe("/");
  });

  it("should apply default update when set to undefined explicitly", async () => {
    const mockConfig = {
      url: "https://example.com",
      token: "test-token",
      basePath: "/test",
      update: undefined,
    };

    const configPath = join(tempDir, "config.json");
    await writeFile(configPath, JSON.stringify(mockConfig), "utf-8");

    const config = loadConfig(configPath);

    expect(config.update).toBe(false);
  });

  it("should preserve false value for update field", async () => {
    const mockConfig = {
      url: "https://example.com",
      token: "test-token",
      update: false,
    };

    const configPath = join(tempDir, "config.json");
    await writeFile(configPath, JSON.stringify(mockConfig), "utf-8");

    const config = loadConfig(configPath);

    expect(config.update).toBe(false);
  });

  it("should normalize empty string basePath to default", async () => {
    const mockConfig = {
      url: "https://example.com",
      token: "test-token",
      basePath: "",
    };

    const configPath = join(tempDir, "config.json");
    await writeFile(configPath, JSON.stringify(mockConfig), "utf-8");

    const config = loadConfig(configPath);

    // Empty string basePath should be normalized to "/"
    expect(config.basePath).toBe("/");
  });
});
