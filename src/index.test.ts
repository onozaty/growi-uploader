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
      linkReplacementErrors: 0,
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
          attachments: [],
        },
      ],
      tempDir,
      {
        url: "https://growi.example.com",
        token: "test-token",
        basePath: "/",
        update: false,
        verbose: false,
      },
    );

    // Verify summary was displayed
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Found 1 Markdown file(s) and 0 attachment(s)\n",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith("\nCompleted:");
    expect(consoleLogSpy).toHaveBeenCalledWith("- Pages created: 1");
  });

  it("should throw an error when source directory does not exist", async () => {
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

    const missingDir = join(tempDir, "does-not-exist");

    vi.spyOn(growiClient, "configureAxios").mockImplementation(() => {});
    const uploadFilesSpy = vi
      .spyOn(uploader, "uploadFiles")
      .mockResolvedValue({
        pagesCreated: 0,
        pagesUpdated: 0,
        pagesSkipped: 0,
        pageErrors: 0,
        attachmentsUploaded: 0,
        attachmentsSkipped: 0,
        attachmentErrors: 0,
        linkReplacementErrors: 0,
      });

    await expect(main(missingDir, configPath)).rejects.toThrow(
      `Source directory not found: ${missingDir}`,
    );

    expect(uploadFilesSpy).not.toHaveBeenCalled();
  });

  it("should throw an error when source path is a file, not a directory", async () => {
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

    const filePath = join(tempDir, "not-a-dir.md");
    await writeFile(filePath, "# Not a directory", "utf-8");

    vi.spyOn(growiClient, "configureAxios").mockImplementation(() => {});
    const uploadFilesSpy = vi
      .spyOn(uploader, "uploadFiles")
      .mockResolvedValue({
        pagesCreated: 0,
        pagesUpdated: 0,
        pagesSkipped: 0,
        pageErrors: 0,
        attachmentsUploaded: 0,
        attachmentsSkipped: 0,
        attachmentErrors: 0,
        linkReplacementErrors: 0,
      });

    await expect(main(filePath, configPath)).rejects.toThrow(
      `Source path is not a directory: ${filePath}`,
    );

    expect(uploadFilesSpy).not.toHaveBeenCalled();
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
      linkReplacementErrors: 0,
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
      linkReplacementErrors: 0,
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

  describe("end-to-end integration tests", () => {
    // These tests use real scanner, uploader, and markdown implementations
    // Only growi-client is mocked

    beforeEach(() => {
      // Restore uploader.uploadFiles to use real implementation
      vi.restoreAllMocks();
    });

    it("should handle normal filenames with standard link format", async () => {
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
        "guide.md":
          "# Guide\n\n![image](./images/photo.png)\n\n[document](./docs/file.pdf)",
        "images/photo.png": "fake-image-data",
        "docs/file.pdf": "fake-pdf-data",
      });

      vi.spyOn(growiClient, "configureAxios").mockImplementation(() => {});
      vi.spyOn(growiClient, "createOrUpdatePage").mockResolvedValue({
        pageId: "page123",
        revisionId: "rev456",
        action: "created",
      });
      vi.spyOn(growiClient, "uploadAttachment")
        .mockResolvedValueOnce({
          success: true,
          attachmentId: "attach_img",
          revisionId: "rev789",
        })
        .mockResolvedValueOnce({
          success: true,
          attachmentId: "attach_pdf",
          revisionId: "rev999",
        });
      vi.spyOn(growiClient, "updatePageContent").mockResolvedValue({
        success: true,
        revisionId: "rev1000",
      });

      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});

      await main(tempDir, configPath);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Found 1 Markdown file(s) and 2 attachment(s)\n",
      );

      expect(growiClient.createOrUpdatePage).toHaveBeenCalledWith(
        expect.objectContaining({
          localPath: "guide.md",
          growiPath: "/guide",
        }),
        "# Guide\n\n![image](./images/photo.png)\n\n[document](./docs/file.pdf)",
        false,
      );

      expect(growiClient.uploadAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          localPath: "images/photo.png",
          fileName: "photo.png",
          originalLinkPaths: ["./images/photo.png"],
        }),
        "page123",
        tempDir,
      );

      expect(growiClient.uploadAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          localPath: "docs/file.pdf",
          fileName: "file.pdf",
          originalLinkPaths: ["./docs/file.pdf"],
        }),
        "page123",
        tempDir,
      );

      expect(growiClient.updatePageContent).toHaveBeenCalledWith(
        "page123",
        "rev999",
        "# Guide\n\n![image](/attachment/attach_img)\n\n[document](/attachment/attach_pdf)",
      );

      expect(consoleLogSpy).toHaveBeenCalledWith("- Pages created: 1");
      expect(consoleLogSpy).toHaveBeenCalledWith("- Attachments uploaded: 2");
    });

    it("should handle filenames with parentheses using angle brackets", async () => {
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
        "guide.md": "![image](<./images/photo(1).png>)",
        "images/photo(1).png": "fake-image-data",
      });

      vi.spyOn(growiClient, "configureAxios").mockImplementation(() => {});
      vi.spyOn(growiClient, "createOrUpdatePage").mockResolvedValue({
        pageId: "page123",
        revisionId: "rev456",
        action: "created",
      });
      vi.spyOn(growiClient, "uploadAttachment").mockResolvedValue({
        success: true,
        attachmentId: "attach789",
        revisionId: "rev999",
      });
      vi.spyOn(growiClient, "updatePageContent").mockResolvedValue({
        success: true,
        revisionId: "rev1000",
      });

      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});

      await main(tempDir, configPath);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Found 1 Markdown file(s) and 1 attachment(s)\n",
      );

      expect(growiClient.createOrUpdatePage).toHaveBeenCalledWith(
        expect.objectContaining({
          localPath: "guide.md",
          growiPath: "/guide",
        }),
        "![image](<./images/photo(1).png>)",
        false,
      );

      expect(growiClient.uploadAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          localPath: "images/photo(1).png",
          fileName: "photo(1).png",
          originalLinkPaths: ["<./images/photo(1).png>"],
        }),
        "page123",
        tempDir,
      );

      expect(growiClient.updatePageContent).toHaveBeenCalledWith(
        "page123",
        "rev999",
        "![image](/attachment/attach789)",
      );

      expect(consoleLogSpy).toHaveBeenCalledWith("- Pages created: 1");
      expect(consoleLogSpy).toHaveBeenCalledWith("- Attachments uploaded: 1");
    });

    it("should handle filenames with escaped parentheses", async () => {
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
        "guide.md": "![image](./images/photo\\(1\\).png)",
        "images/photo(1).png": "fake-image-data",
      });

      vi.spyOn(growiClient, "configureAxios").mockImplementation(() => {});
      vi.spyOn(growiClient, "createOrUpdatePage").mockResolvedValue({
        pageId: "page123",
        revisionId: "rev456",
        action: "created",
      });
      vi.spyOn(growiClient, "uploadAttachment").mockResolvedValue({
        success: true,
        attachmentId: "attach789",
        revisionId: "rev999",
      });
      vi.spyOn(growiClient, "updatePageContent").mockResolvedValue({
        success: true,
        revisionId: "rev1000",
      });

      vi.spyOn(console, "log").mockImplementation(() => {});

      await main(tempDir, configPath);

      expect(growiClient.uploadAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          originalLinkPaths: ["./images/photo\\(1\\).png"],
        }),
        "page123",
        tempDir,
      );

      expect(growiClient.updatePageContent).toHaveBeenCalledWith(
        "page123",
        "rev999",
        "![image](/attachment/attach789)",
      );
    });

    it("should handle filenames with parentheses using naming pattern", async () => {
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
        "guide.md": "![image](guide_attachment_photo(1).png)",
        "guide_attachment_photo(1).png": "fake-image-data",
      });

      vi.spyOn(growiClient, "configureAxios").mockImplementation(() => {});
      vi.spyOn(growiClient, "createOrUpdatePage").mockResolvedValue({
        pageId: "page123",
        revisionId: "rev456",
        action: "created",
      });
      vi.spyOn(growiClient, "uploadAttachment").mockResolvedValue({
        success: true,
        attachmentId: "attach789",
        revisionId: "rev999",
      });
      vi.spyOn(growiClient, "updatePageContent").mockResolvedValue({
        success: true,
        revisionId: "rev1000",
      });

      vi.spyOn(console, "log").mockImplementation(() => {});

      await main(tempDir, configPath);

      expect(growiClient.updatePageContent).toHaveBeenCalledWith(
        "page123",
        "rev999",
        "![image](/attachment/attach789)",
      );
    });
  });
});
