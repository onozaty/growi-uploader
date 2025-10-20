import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig } from "./config";
import * as fs from "node:fs";

// Mock fs module
vi.mock("node:fs");

describe("loadConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should load valid config with all fields", () => {
    const mockConfig = {
      url: "https://example.com",
      token: "test-token",
      basePath: "/imported",
      update: true,
    };

    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(mockConfig));

    const config = loadConfig("test-config.json");

    expect(config.url).toBe("https://example.com");
    expect(config.token).toBe("test-token");
    expect(config.basePath).toBe("/imported");
    expect(config.update).toBe(true);
  });

  it("should load config with required fields only and apply defaults", () => {
    const mockConfig = {
      url: "https://example.com",
      token: "test-token",
    };

    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(mockConfig));

    const config = loadConfig("test-config.json");

    expect(config.url).toBe("https://example.com");
    expect(config.token).toBe("test-token");
    expect(config.basePath).toBe("/");
    expect(config.update).toBe(false);
  });

  it("should throw error when url is missing", () => {
    const mockConfig = {
      token: "test-token",
    };

    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(mockConfig));

    expect(() => loadConfig("test-config.json")).toThrow(
      "Missing required field: url",
    );
  });

  it("should throw error when token is missing", () => {
    const mockConfig = {
      url: "https://example.com",
    };

    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(mockConfig));

    expect(() => loadConfig("test-config.json")).toThrow(
      "Missing required field: token",
    );
  });

  it("should throw error for invalid JSON", () => {
    vi.spyOn(fs, "readFileSync").mockReturnValue("{ invalid json }");

    expect(() => loadConfig("test-config.json")).toThrow();
  });

  it("should throw error when config file not found", () => {
    const error = new Error("ENOENT") as NodeJS.ErrnoException;
    error.code = "ENOENT";

    vi.spyOn(fs, "readFileSync").mockImplementation(() => {
      throw error;
    });

    expect(() => loadConfig("missing-config.json")).toThrow(
      /Config file not found/,
    );
  });

  it("should apply default basePath when set to undefined explicitly", () => {
    const mockConfig = {
      url: "https://example.com",
      token: "test-token",
      basePath: undefined,
      update: true,
    };

    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(mockConfig));

    const config = loadConfig("test-config.json");

    expect(config.basePath).toBe("/");
  });

  it("should apply default update when set to undefined explicitly", () => {
    const mockConfig = {
      url: "https://example.com",
      token: "test-token",
      basePath: "/test",
      update: undefined,
    };

    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(mockConfig));

    const config = loadConfig("test-config.json");

    expect(config.update).toBe(false);
  });

  it("should preserve false value for update field", () => {
    const mockConfig = {
      url: "https://example.com",
      token: "test-token",
      update: false,
    };

    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(mockConfig));

    const config = loadConfig("test-config.json");

    expect(config.update).toBe(false);
  });

  it("should handle empty string basePath", () => {
    const mockConfig = {
      url: "https://example.com",
      token: "test-token",
      basePath: "",
    };

    vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(mockConfig));

    const config = loadConfig("test-config.json");

    // Empty string basePath is preserved (not replaced with default)
    expect(config.basePath).toBe("");
  });
});
