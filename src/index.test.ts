import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupTempDir, createTempDir } from "../test/utils";
import * as config from "./config";
import { main } from "./index";
import * as scanner from "./scanner";
import * as uploader from "./uploader";

// Mock dependencies
vi.mock("./config");
vi.mock("./scanner");
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

  it("should process single page with no attachments", async () => {
    const mockConfig = {
      url: "https://growi.example.com",
      token: "test-token",
      basePath: "/",
      update: false,
    };
    vi.spyOn(config, "loadConfig").mockReturnValue(mockConfig);

    const mockFiles = [
      {
        localPath: "guide.md",
        growiPath: "/guide",
        content: "# Guide",
        attachments: [],
      },
    ];
    vi.spyOn(scanner, "scanMarkdownFiles").mockResolvedValue(mockFiles);

    const configureAxiosSpy = vi
      .spyOn(uploader, "configureAxios")
      .mockImplementation(() => {});
    const createOrUpdatePageSpy = vi
      .spyOn(uploader, "createOrUpdatePage")
      .mockResolvedValue({
        pageId: "page123",
        revisionId: "rev456",
        action: "created",
      });

    vi.spyOn(uploader, "replaceMarkdownExtension").mockReturnValue({
      content: "# Guide",
      replaced: false,
    });

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main(tempDir, "config.json");

    expect(config.loadConfig).toHaveBeenCalledWith("config.json");
    expect(configureAxiosSpy).toHaveBeenCalledWith(
      "https://growi.example.com",
      "test-token",
    );
    expect(scanner.scanMarkdownFiles).toHaveBeenCalledWith(tempDir, "/");
    expect(createOrUpdatePageSpy).toHaveBeenCalledWith(
      mockFiles[0],
      mockConfig,
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "Found 1 Markdown file(s) and 0 attachment(s)\n",
    );

    consoleLogSpy.mockRestore();
  });

  it("should process page with attachments (full flow)", async () => {
    const mockConfig = {
      url: "https://growi.example.com",
      token: "test-token",
      basePath: "/",
      update: true,
    };
    vi.spyOn(config, "loadConfig").mockReturnValue(mockConfig);

    const mockFiles = [
      {
        localPath: "guide.md",
        growiPath: "/guide",
        content: "# Guide\n\n![image](guide_attachment_image.png)",
        attachments: [
          {
            localPath: "guide_attachment_image.png",
            fileName: "image.png",
            detectionPattern: "naming" as const,
          },
        ],
      },
    ];
    vi.spyOn(scanner, "scanMarkdownFiles").mockResolvedValue(mockFiles);

    vi.spyOn(uploader, "configureAxios").mockImplementation(() => {});
    vi.spyOn(uploader, "createOrUpdatePage").mockResolvedValue({
      pageId: "page123",
      revisionId: "rev456",
      action: "created",
    });

    const uploadAttachmentSpy = vi
      .spyOn(uploader, "uploadAttachment")
      .mockResolvedValue({
        success: true,
        attachmentId: "attach789",
        revisionId: "rev999",
      });

    vi.spyOn(uploader, "replaceAttachmentLinks").mockReturnValue({
      content: "# Guide\n\n![image](/attachment/attach789)",
      replaced: true,
    });

    const updatePageContentSpy = vi
      .spyOn(uploader, "updatePageContent")
      .mockResolvedValue("rev1000");

    vi.spyOn(uploader, "replaceMarkdownExtension").mockReturnValue({
      content: "# Guide\n\n![image](/attachment/attach789)",
      replaced: false,
    });

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main(tempDir, "config.json");

    expect(uploadAttachmentSpy).toHaveBeenCalledWith(
      mockFiles[0]?.attachments[0],
      "page123",
      "/guide",
      tempDir,
    );
    expect(uploader.replaceAttachmentLinks).toHaveBeenCalled();
    expect(updatePageContentSpy).toHaveBeenCalledWith(
      "page123",
      "rev999",
      "# Guide\n\n![image](/attachment/attach789)",
      "/guide",
    );

    consoleLogSpy.mockRestore();
  });

  it("should skip page when update=false and page exists", async () => {
    const mockConfig = {
      url: "https://growi.example.com",
      token: "test-token",
      basePath: "/",
      update: false,
    };
    vi.spyOn(config, "loadConfig").mockReturnValue(mockConfig);

    const mockFiles = [
      {
        localPath: "guide.md",
        growiPath: "/guide",
        content: "# Guide",
        attachments: [
          {
            localPath: "guide_attachment_image.png",
            fileName: "image.png",
            detectionPattern: "naming" as const,
          },
        ],
      },
    ];
    vi.spyOn(scanner, "scanMarkdownFiles").mockResolvedValue(mockFiles);

    vi.spyOn(uploader, "configureAxios").mockImplementation(() => {});
    vi.spyOn(uploader, "createOrUpdatePage").mockResolvedValue({
      pageId: "page123",
      revisionId: "rev456",
      action: "skipped",
    });

    const uploadAttachmentSpy = vi.spyOn(uploader, "uploadAttachment");
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main(tempDir, "config.json");

    expect(uploadAttachmentSpy).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[SKIP] guide_attachment_image.png → /guide (attachment skipped)",
    );

    consoleLogSpy.mockRestore();
  });

  it("should handle page creation error", async () => {
    const mockConfig = {
      url: "https://growi.example.com",
      token: "test-token",
      basePath: "/",
      update: false,
    };
    vi.spyOn(config, "loadConfig").mockReturnValue(mockConfig);

    const mockFiles = [
      {
        localPath: "guide.md",
        growiPath: "/guide",
        content: "# Guide",
        attachments: [],
      },
    ];
    vi.spyOn(scanner, "scanMarkdownFiles").mockResolvedValue(mockFiles);

    vi.spyOn(uploader, "configureAxios").mockImplementation(() => {});
    vi.spyOn(uploader, "createOrUpdatePage").mockResolvedValue({
      pageId: undefined,
      revisionId: undefined,
      action: "error",
    });

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main(tempDir, "config.json");

    expect(consoleLogSpy).toHaveBeenCalledWith("\nCompleted:");
    expect(consoleLogSpy).toHaveBeenCalledWith("- Page errors: 1");

    consoleLogSpy.mockRestore();
  });

  it("should skip attachments when page creation fails", async () => {
    const mockConfig = {
      url: "https://growi.example.com",
      token: "test-token",
      basePath: "/",
      update: false,
    };
    vi.spyOn(config, "loadConfig").mockReturnValue(mockConfig);

    const mockFiles = [
      {
        localPath: "guide.md",
        growiPath: "/guide",
        content: "# Guide",
        attachments: [
          {
            localPath: "guide_attachment_image.png",
            fileName: "image.png",
            detectionPattern: "naming" as const,
          },
        ],
      },
    ];
    vi.spyOn(scanner, "scanMarkdownFiles").mockResolvedValue(mockFiles);

    vi.spyOn(uploader, "configureAxios").mockImplementation(() => {});
    vi.spyOn(uploader, "createOrUpdatePage").mockResolvedValue({
      pageId: undefined,
      revisionId: undefined,
      action: "error",
    });

    const uploadAttachmentSpy = vi.spyOn(uploader, "uploadAttachment");
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main(tempDir, "config.json");

    expect(uploadAttachmentSpy).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[SKIP] guide_attachment_image.png → /guide (attachment skipped)",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith("- Attachments skipped: 1");

    consoleLogSpy.mockRestore();
  });

  it("should handle attachment upload error", async () => {
    const mockConfig = {
      url: "https://growi.example.com",
      token: "test-token",
      basePath: "/",
      update: false,
    };
    vi.spyOn(config, "loadConfig").mockReturnValue(mockConfig);

    const mockFiles = [
      {
        localPath: "guide.md",
        growiPath: "/guide",
        content: "# Guide",
        attachments: [
          {
            localPath: "guide_attachment_image.png",
            fileName: "image.png",
            detectionPattern: "naming" as const,
          },
        ],
      },
    ];
    vi.spyOn(scanner, "scanMarkdownFiles").mockResolvedValue(mockFiles);

    vi.spyOn(uploader, "configureAxios").mockImplementation(() => {});
    vi.spyOn(uploader, "createOrUpdatePage").mockResolvedValue({
      pageId: "page123",
      revisionId: "rev456",
      action: "created",
    });

    vi.spyOn(uploader, "uploadAttachment").mockResolvedValue({
      success: false,
    });

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main(tempDir, "config.json");

    expect(consoleLogSpy).toHaveBeenCalledWith("- Attachment errors: 1");

    consoleLogSpy.mockRestore();
  });

  it("should process multiple pages with different outcomes", async () => {
    const mockConfig = {
      url: "https://growi.example.com",
      token: "test-token",
      basePath: "/",
      update: true,
    };
    vi.spyOn(config, "loadConfig").mockReturnValue(mockConfig);

    const mockFiles = [
      {
        localPath: "guide1.md",
        growiPath: "/guide1",
        content: "# Guide 1",
        attachments: [],
      },
      {
        localPath: "guide2.md",
        growiPath: "/guide2",
        content: "# Guide 2",
        attachments: [],
      },
      {
        localPath: "guide3.md",
        growiPath: "/guide3",
        content: "# Guide 3",
        attachments: [],
      },
    ];
    vi.spyOn(scanner, "scanMarkdownFiles").mockResolvedValue(mockFiles);

    vi.spyOn(uploader, "configureAxios").mockImplementation(() => {});

    const createOrUpdatePageSpy = vi
      .spyOn(uploader, "createOrUpdatePage")
      .mockResolvedValueOnce({
        pageId: "page1",
        revisionId: "rev1",
        action: "created",
      })
      .mockResolvedValueOnce({
        pageId: "page2",
        revisionId: "rev2",
        action: "updated",
      })
      .mockResolvedValueOnce({
        pageId: undefined,
        revisionId: undefined,
        action: "error",
      });

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main(tempDir, "config.json");

    expect(createOrUpdatePageSpy).toHaveBeenCalledTimes(3);
    expect(consoleLogSpy).toHaveBeenCalledWith("- Pages created: 1");
    expect(consoleLogSpy).toHaveBeenCalledWith("- Pages updated: 1");
    expect(consoleLogSpy).toHaveBeenCalledWith("- Page errors: 1");

    consoleLogSpy.mockRestore();
  });

  it("should replace page links (.md extension) after attachments", async () => {
    const mockConfig = {
      url: "https://growi.example.com",
      token: "test-token",
      basePath: "/",
      update: false,
    };
    vi.spyOn(config, "loadConfig").mockReturnValue(mockConfig);

    const mockFiles = [
      {
        localPath: "guide.md",
        growiPath: "/guide",
        content: "# Guide\n\n[Link](./other.md)",
        attachments: [],
      },
    ];
    vi.spyOn(scanner, "scanMarkdownFiles").mockResolvedValue(mockFiles);

    vi.spyOn(uploader, "configureAxios").mockImplementation(() => {});
    vi.spyOn(uploader, "createOrUpdatePage").mockResolvedValue({
      pageId: "page123",
      revisionId: "rev456",
      action: "created",
    });

    vi.spyOn(uploader, "replaceMarkdownExtension").mockReturnValue({
      content: "# Guide\n\n[Link](./other)",
      replaced: true,
    });

    const updatePageContentSpy = vi
      .spyOn(uploader, "updatePageContent")
      .mockResolvedValue("rev789");

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await main(tempDir, "config.json");

    expect(uploader.replaceMarkdownExtension).toHaveBeenCalledWith(
      "# Guide\n\n[Link](./other.md)",
    );
    expect(updatePageContentSpy).toHaveBeenCalledWith(
      "page123",
      "rev456",
      "# Guide\n\n[Link](./other)",
      "/guide",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[SUCCESS] guide.md → /guide (page links replaced)",
    );

    consoleLogSpy.mockRestore();
  });
});
