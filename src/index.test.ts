import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupTempDir, createTempDir, createTestFiles } from "../test/utils";
import { main } from "./index";
import * as growiClient from "./growi-client";
import * as uploader from "./uploader";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

// Mock only growi-client (external API calls) and uploader
vi.mock("./growi-client");
vi.mock("./uploader");

describe("main", () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTempDir(tempDir);
  });

  it("should load config, configure axios, scan files, and call uploadFiles", async () => {
    // Create real config file
    const configPath = join(tempDir, "config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        url: "https://growi.example.com",
        token: "test-token",
        basePath: "/",
        update: false,
      }),
      "utf-8",
    );

    // Create real markdown file
    await createTestFiles(tempDir, {
      "guide.md": "# Guide",
    });

    // Mock functions
    const configureAxiosSpy = vi
      .spyOn(growiClient, "configureAxios")
      .mockImplementation(() => {});

    const uploadFilesSpy = vi.spyOn(uploader, "uploadFiles").mockResolvedValue({
      pagesCreated: 1,
      pagesUpdated: 0,
      pagesSkipped: 0,
      pageErrors: 0,
      attachmentsUploaded: 0,
      attachmentsSkipped: 0,
      attachmentErrors: 0,
    });

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main(tempDir, configPath);

    // Verify axios was configured
    expect(configureAxiosSpy).toHaveBeenCalledWith(
      "https://growi.example.com",
      "test-token",
    );

    // Verify uploadFiles was called with scanned files
    expect(uploadFilesSpy).toHaveBeenCalledWith(
      [
        {
          localPath: "guide.md",
          growiPath: "/guide",
          content: "# Guide",
          attachments: [],
        },
      ],
      tempDir,
      {
        url: "https://growi.example.com",
        token: "test-token",
        basePath: "/",
        update: false,
      },
    );

    // Verify summary was displayed
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Found 1 Markdown file(s) and 0 attachment(s)\n",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith("\nCompleted:");
    expect(consoleLogSpy).toHaveBeenCalledWith("- Pages created: 1");
  });

  it("should handle multiple markdown files", async () => {
    const configPath = join(tempDir, "config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        url: "https://growi.example.com",
        token: "test-token",
        basePath: "/docs",
        update: true,
      }),
      "utf-8",
    );

    await createTestFiles(tempDir, {
      "guide1.md": "# Guide 1",
      "guide2.md": "# Guide 2",
      "guide3.md": "# Guide 3",
    });

    vi.spyOn(growiClient, "configureAxios").mockImplementation(() => {});
    vi.spyOn(uploader, "uploadFiles").mockResolvedValue({
      pagesCreated: 1,
      pagesUpdated: 2,
      pagesSkipped: 0,
      pageErrors: 0,
      attachmentsUploaded: 0,
      attachmentsSkipped: 0,
      attachmentErrors: 0,
    });

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main(tempDir, configPath);

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Found 3 Markdown file(s) and 0 attachment(s)\n",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith("- Pages created: 1");
    expect(consoleLogSpy).toHaveBeenCalledWith("- Pages updated: 2");
  });

  it("should display all statistics from uploadFiles", async () => {
    const configPath = join(tempDir, "config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        url: "https://growi.example.com",
        token: "test-token",
        basePath: "/",
        update: false,
      }),
      "utf-8",
    );

    await createTestFiles(tempDir, {
      "guide.md": "# Guide",
    });

    vi.spyOn(growiClient, "configureAxios").mockImplementation(() => {});
    vi.spyOn(uploader, "uploadFiles").mockResolvedValue({
      pagesCreated: 5,
      pagesUpdated: 3,
      pagesSkipped: 2,
      pageErrors: 1,
      attachmentsUploaded: 10,
      attachmentsSkipped: 3,
      attachmentErrors: 2,
    });

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main(tempDir, configPath);

    expect(consoleLogSpy).toHaveBeenCalledWith("- Pages created: 5");
    expect(consoleLogSpy).toHaveBeenCalledWith("- Pages updated: 3");
    expect(consoleLogSpy).toHaveBeenCalledWith("- Pages skipped: 2");
    expect(consoleLogSpy).toHaveBeenCalledWith("- Page errors: 1");
    expect(consoleLogSpy).toHaveBeenCalledWith("- Attachments uploaded: 10");
    expect(consoleLogSpy).toHaveBeenCalledWith("- Attachments skipped: 3");
    expect(consoleLogSpy).toHaveBeenCalledWith("- Attachment errors: 2");
  });
});
