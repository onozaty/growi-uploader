import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as growiClient from "./growi-client";
import type { MarkdownFile } from "./scanner";
import { uploadFiles } from "./uploader";
import type { Config } from "./config";
import * as fs from "node:fs";

// Mock dependencies
vi.mock("./growi-client");
vi.mock("node:fs");

describe("uploadFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock readFileSync for all tests - return a default content
    vi.spyOn(fs, "readFileSync").mockReturnValue("# Guide");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockConfig: Config = {
    url: "https://growi.example.com",
    token: "test-token",
    basePath: "/",
    update: false,
    verbose: false,
  };

  it("should upload a single page without attachments", async () => {
    const files: MarkdownFile[] = [
      {
        localPath: "guide.md",
        growiPath: "/guide",
        attachments: [],
      },
    ];

    const createOrUpdatePageSpy = vi
      .spyOn(growiClient, "createOrUpdatePage")
      .mockResolvedValue({
        pageId: "page123",
        revisionId: "rev456",
        action: "created",
      });

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const stats = await uploadFiles(files, "/source", mockConfig);

    expect(stats).toEqual({
      pagesCreated: 1,
      pagesUpdated: 0,
      pagesSkipped: 0,
      pageErrors: 0,
      attachmentsUploaded: 0,
      attachmentsSkipped: 0,
      attachmentErrors: 0,
      linkReplacementErrors: 0,
    });
    expect(createOrUpdatePageSpy).toHaveBeenCalledWith(
      files[0],
      "# Guide",
      false,
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[SUCCESS] guide.md → /guide (created)",
    );
  });

  it("should upload page and attachments", async () => {
    const files: MarkdownFile[] = [
      {
        localPath: "guide.md",
        growiPath: "/guide",
        attachments: [
          {
            localPath: "guide_attachment_image.png",
            fileName: "image.png",
            detectionPattern: "naming",
          },
        ],
      },
    ];

    // Override default readFileSync to return content with naming pattern reference
    vi.spyOn(fs, "readFileSync").mockReturnValue(
      "# Guide\n\n![image](guide_attachment_image.png)",
    );

    const createOrUpdatePageSpy = vi
      .spyOn(growiClient, "createOrUpdatePage")
      .mockResolvedValue({
        pageId: "page123",
        revisionId: "rev456",
        action: "created",
      });

    const uploadAttachmentSpy = vi
      .spyOn(growiClient, "uploadAttachment")
      .mockResolvedValue({
        success: true,
        attachmentId: "attach789",
        revisionId: "rev999",
      });

    const updatePageContentSpy = vi
      .spyOn(growiClient, "updatePageContent")
      .mockResolvedValue({
        success: true,
        revisionId: "rev1000",
      });

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const stats = await uploadFiles(files, "/source", mockConfig);

    expect(stats).toEqual({
      pagesCreated: 1,
      pagesUpdated: 0,
      pagesSkipped: 0,
      pageErrors: 0,
      attachmentsUploaded: 1,
      attachmentsSkipped: 0,
      attachmentErrors: 0,
      linkReplacementErrors: 0,
    });

    expect(createOrUpdatePageSpy).toHaveBeenCalledWith(
      files[0],
      "# Guide\n\n![image](guide_attachment_image.png)",
      false,
    );
    expect(uploadAttachmentSpy).toHaveBeenCalled();
    expect(updatePageContentSpy).toHaveBeenCalledWith(
      "page123",
      "rev999",
      "# Guide\n\n![image](/attachment/attach789)",
    );

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[SUCCESS] guide.md → /guide (created)",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[SUCCESS] guide_attachment_image.png → /guide (attachment)",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[SUCCESS] guide.md → /guide (attachment links replaced)",
    );
  });

  it("should skip attachments when page creation fails", async () => {
    const files: MarkdownFile[] = [
      {
        localPath: "guide.md",
        growiPath: "/guide",
        attachments: [
          {
            localPath: "guide_attachment_image.png",
            fileName: "image.png",
            detectionPattern: "naming",
          },
        ],
      },
    ];

    const createOrUpdatePageSpy = vi
      .spyOn(growiClient, "createOrUpdatePage")
      .mockResolvedValue({
        pageId: undefined,
        revisionId: undefined,
        action: "error",
      });

    const uploadAttachmentSpy = vi.spyOn(growiClient, "uploadAttachment");
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const stats = await uploadFiles(files, "/source", mockConfig);

    expect(stats).toEqual({
      pagesCreated: 0,
      pagesUpdated: 0,
      pagesSkipped: 0,
      pageErrors: 1,
      attachmentsUploaded: 0,
      attachmentsSkipped: 1,
      attachmentErrors: 0,
      linkReplacementErrors: 0,
    });

    expect(createOrUpdatePageSpy).toHaveBeenCalledWith(
      files[0],
      "# Guide",
      false,
    );
    expect(uploadAttachmentSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[ERROR] guide.md → /guide (unknown error)",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[SKIP] guide_attachment_image.png → /guide (attachment skipped)",
    );
  });

  it("should handle attachment upload errors", async () => {
    const files: MarkdownFile[] = [
      {
        localPath: "guide.md",
        growiPath: "/guide",
        attachments: [
          {
            localPath: "guide_attachment_image.png",
            fileName: "image.png",
            detectionPattern: "naming",
          },
        ],
      },
    ];

    const createOrUpdatePageSpy = vi
      .spyOn(growiClient, "createOrUpdatePage")
      .mockResolvedValue({
        pageId: "page123",
        revisionId: "rev456",
        action: "created",
      });

    vi.spyOn(growiClient, "uploadAttachment").mockResolvedValue({
      success: false,
    });

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const stats = await uploadFiles(files, "/source", mockConfig);

    expect(stats).toEqual({
      pagesCreated: 1,
      pagesUpdated: 0,
      pagesSkipped: 0,
      pageErrors: 0,
      attachmentsUploaded: 0,
      attachmentsSkipped: 0,
      attachmentErrors: 1,
      linkReplacementErrors: 0,
    });
    expect(createOrUpdatePageSpy).toHaveBeenCalledWith(
      files[0],
      "# Guide",
      false,
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[SUCCESS] guide.md → /guide (created)",
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[ERROR] guide_attachment_image.png → /guide (failed to upload attachment)",
    );
  });

  it("should handle attachment link update failure", async () => {
    const files: MarkdownFile[] = [
      {
        localPath: "guide.md",
        growiPath: "/guide",
        attachments: [
          {
            localPath: "image.png",
            fileName: "image.png",
            detectionPattern: "link",
            originalLinkPaths: ["./image.png"],
          },
        ],
      },
    ];

    // Override default readFileSync to return content with image link
    vi.spyOn(fs, "readFileSync").mockReturnValue(
      "# Guide\n\n![image](./image.png)",
    );

    const createOrUpdatePageSpy = vi
      .spyOn(growiClient, "createOrUpdatePage")
      .mockResolvedValue({
        pageId: "page123",
        revisionId: "rev456",
        action: "created",
      });

    vi.spyOn(growiClient, "uploadAttachment").mockResolvedValue({
      success: true,
      attachmentId: "attach789",
      revisionId: "rev999",
    });

    const updatePageContentSpy = vi
      .spyOn(growiClient, "updatePageContent")
      .mockResolvedValue({
        success: false,
        errorMessage: "Update failed",
      });

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const stats = await uploadFiles(files, "/source", mockConfig);

    expect(stats.pagesCreated).toBe(1);
    expect(stats.attachmentsUploaded).toBe(1);
    expect(stats.linkReplacementErrors).toBe(1);
    expect(createOrUpdatePageSpy).toHaveBeenCalledWith(
      files[0],
      "# Guide\n\n![image](./image.png)",
      false,
    );
    expect(updatePageContentSpy).toHaveBeenCalledWith(
      "page123",
      "rev999",
      "# Guide\n\n![image](/attachment/attach789)",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[SUCCESS] guide.md → /guide (created)",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[SUCCESS] image.png → /guide (attachment)",
    );
    // Should NOT log success for attachment links replacement
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      "[SUCCESS] guide.md → /guide (attachment links replaced)",
    );
    // Should log error with error message
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[ERROR] guide.md → /guide (failed to update links: Update failed)",
    );
  });

  it("should replace page links when .md extension is found", async () => {
    const files: MarkdownFile[] = [
      {
        localPath: "guide.md",
        growiPath: "/guide",
        attachments: [],
      },
    ];

    // Override default readFileSync to return content with .md link
    vi.spyOn(fs, "readFileSync").mockReturnValue(
      "# Guide\n\n[Link](./other.md)",
    );

    const createOrUpdatePageSpy = vi
      .spyOn(growiClient, "createOrUpdatePage")
      .mockResolvedValue({
        pageId: "page123",
        revisionId: "rev456",
        action: "created",
      });

    const updatePageContentSpy = vi
      .spyOn(growiClient, "updatePageContent")
      .mockResolvedValue({ success: true, revisionId: "rev789" });

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const stats = await uploadFiles(files, "/source", mockConfig);

    expect(stats.pagesCreated).toBe(1);
    expect(stats.linkReplacementErrors).toBe(0);
    expect(createOrUpdatePageSpy).toHaveBeenCalledWith(
      files[0],
      "# Guide\n\n[Link](./other.md)",
      false,
    );
    expect(updatePageContentSpy).toHaveBeenCalledWith(
      "page123",
      "rev456",
      "# Guide\n\n[Link](./other)",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[SUCCESS] guide.md → /guide (created)",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[SUCCESS] guide.md → /guide (page links replaced)",
    );
  });

  it("should handle page link update failure", async () => {
    const files: MarkdownFile[] = [
      {
        localPath: "guide.md",
        growiPath: "/guide",
        attachments: [],
      },
    ];

    // Override default readFileSync to return content with .md link
    vi.spyOn(fs, "readFileSync").mockReturnValue(
      "# Guide\n\n[Link](./other.md)",
    );

    const createOrUpdatePageSpy = vi
      .spyOn(growiClient, "createOrUpdatePage")
      .mockResolvedValue({
        pageId: "page123",
        revisionId: "rev456",
        action: "created",
      });

    const updatePageContentSpy = vi
      .spyOn(growiClient, "updatePageContent")
      .mockResolvedValue({
        success: false,
        errorMessage: "Update failed",
      });

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const stats = await uploadFiles(files, "/source", mockConfig);

    expect(stats.pagesCreated).toBe(1);
    expect(stats.linkReplacementErrors).toBe(1);
    expect(createOrUpdatePageSpy).toHaveBeenCalledWith(
      files[0],
      "# Guide\n\n[Link](./other.md)",
      false,
    );
    expect(updatePageContentSpy).toHaveBeenCalledWith(
      "page123",
      "rev456",
      "# Guide\n\n[Link](./other)",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[SUCCESS] guide.md → /guide (created)",
    );
    // Should NOT log success for page links replacement
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      "[SUCCESS] guide.md → /guide (page links replaced)",
    );
    // Should log error with error message
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[ERROR] guide.md → /guide (failed to update links: Update failed)",
    );
  });

  it("should handle multiple pages with different outcomes", async () => {
    const files: MarkdownFile[] = [
      {
        localPath: "guide1.md",
        growiPath: "/guide1",
        attachments: [],
      },
      {
        localPath: "guide2.md",
        growiPath: "/guide2",
        attachments: [],
      },
      {
        localPath: "guide3.md",
        growiPath: "/guide3",
        attachments: [],
      },
    ];

    const createOrUpdatePageSpy = vi
      .spyOn(growiClient, "createOrUpdatePage")
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
        pageId: "page3",
        revisionId: "rev3",
        action: "skipped",
      });

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const stats = await uploadFiles(files, "/source", mockConfig);

    expect(stats).toEqual({
      pagesCreated: 1,
      pagesUpdated: 1,
      pagesSkipped: 1,
      pageErrors: 0,
      attachmentsUploaded: 0,
      attachmentsSkipped: 0,
      attachmentErrors: 0,
      linkReplacementErrors: 0,
    });

    expect(createOrUpdatePageSpy).toHaveBeenCalledTimes(3);
    expect(createOrUpdatePageSpy).toHaveBeenNthCalledWith(
      1,
      files[0],
      "# Guide",
      false,
    );
    expect(createOrUpdatePageSpy).toHaveBeenNthCalledWith(
      2,
      files[1],
      "# Guide",
      false,
    );
    expect(createOrUpdatePageSpy).toHaveBeenNthCalledWith(
      3,
      files[2],
      "# Guide",
      false,
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[SUCCESS] guide1.md → /guide1 (created)",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[SUCCESS] guide2.md → /guide2 (updated)",
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[SKIP] guide3.md → /guide3 (page already exists)",
    );
  });

  describe("verbose mode", () => {
    it("should call formatDetailedError when verbose is true and page creation fails", async () => {
      const verboseConfig: Config = {
        ...mockConfig,
        verbose: true,
      };

      const files: MarkdownFile[] = [
        {
          localPath: "guide.md",
          growiPath: "/guide",
          attachments: [],
        },
      ];

      const mockError = new Error("API Error");
      vi.spyOn(growiClient, "createOrUpdatePage").mockResolvedValue({
        pageId: undefined,
        revisionId: undefined,
        action: "error",
        errorMessage: "HTTP 500 Server Error",
        error: mockError,
      });

      const formatDetailedErrorSpy = vi
        .spyOn(growiClient, "formatDetailedError")
        .mockReturnValue("  Details:\n  HTTP Status: 500");

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await uploadFiles(files, "/source", verboseConfig);

      expect(formatDetailedErrorSpy).toHaveBeenCalledWith(mockError);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[ERROR] guide.md → /guide (HTTP 500 Server Error)",
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "  Details:\n  HTTP Status: 500",
      );
    });

    it("should NOT call formatDetailedError when verbose is false and page creation fails", async () => {
      const files: MarkdownFile[] = [
        {
          localPath: "guide.md",
          growiPath: "/guide",
          attachments: [],
        },
      ];

      const mockError = new Error("API Error");
      vi.spyOn(growiClient, "createOrUpdatePage").mockResolvedValue({
        pageId: undefined,
        revisionId: undefined,
        action: "error",
        errorMessage: "HTTP 500 Server Error",
        error: mockError,
      });

      const formatDetailedErrorSpy = vi
        .spyOn(growiClient, "formatDetailedError")
        .mockReturnValue("  Details:\n  HTTP Status: 500");

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await uploadFiles(files, "/source", mockConfig);

      expect(formatDetailedErrorSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[ERROR] guide.md → /guide (HTTP 500 Server Error)",
      );
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        "  Details:\n  HTTP Status: 500",
      );
    });

    it("should call formatDetailedError when verbose is true and attachment upload fails", async () => {
      const verboseConfig: Config = {
        ...mockConfig,
        verbose: true,
      };

      const files: MarkdownFile[] = [
        {
          localPath: "guide.md",
          growiPath: "/guide",
          attachments: [
            {
              localPath: "guide_attachment_image.png",
              fileName: "image.png",
              detectionPattern: "naming",
            },
          ],
        },
      ];

      vi.spyOn(growiClient, "createOrUpdatePage").mockResolvedValue({
        pageId: "page123",
        revisionId: "rev456",
        action: "created",
      });

      const mockError = new Error("Upload failed");
      vi.spyOn(growiClient, "uploadAttachment").mockResolvedValue({
        success: false,
        errorMessage: "HTTP 413 File too large",
        error: mockError,
      });

      const formatDetailedErrorSpy = vi
        .spyOn(growiClient, "formatDetailedError")
        .mockReturnValue("  Details:\n  HTTP Status: 413");

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await uploadFiles(files, "/source", verboseConfig);

      expect(formatDetailedErrorSpy).toHaveBeenCalledWith(mockError);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[ERROR] guide_attachment_image.png → /guide (HTTP 413 File too large)",
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "  Details:\n  HTTP Status: 413",
      );
    });

    it("should call formatDetailedError when verbose is true and link replacement fails", async () => {
      const verboseConfig: Config = {
        ...mockConfig,
        verbose: true,
      };

      const files: MarkdownFile[] = [
        {
          localPath: "guide.md",
          growiPath: "/guide",
          attachments: [
            {
              localPath: "images/logo.png",
              fileName: "logo.png",
              detectionPattern: "link",
              originalLinkPaths: ["./images/logo.png"],
              attachmentId: "attach123",
            },
          ],
        },
      ];

      vi.spyOn(growiClient, "createOrUpdatePage").mockResolvedValue({
        pageId: "page123",
        revisionId: "rev456",
        action: "created",
      });

      vi.spyOn(growiClient, "uploadAttachment").mockResolvedValue({
        success: true,
        attachmentId: "attach123",
        revisionId: "rev789",
      });

      // Mock replaceAttachmentLinks
      vi.spyOn(
        await import("./markdown"),
        "replaceAttachmentLinks",
      ).mockReturnValue({
        content: "![Logo](/attachment/attach123)",
        replaced: true,
      });

      const mockError = new Error("Update failed");
      vi.spyOn(growiClient, "updatePageContent").mockResolvedValue({
        success: false,
        errorMessage: "HTTP 409 Conflict",
        error: mockError,
      });

      const formatDetailedErrorSpy = vi
        .spyOn(growiClient, "formatDetailedError")
        .mockReturnValue("  Details:\n  HTTP Status: 409");

      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await uploadFiles(files, "/source", verboseConfig);

      expect(formatDetailedErrorSpy).toHaveBeenCalledWith(mockError);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[ERROR] guide.md → /guide (failed to update links: HTTP 409 Conflict)",
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "  Details:\n  HTTP Status: 409",
      );
    });
  });
});
