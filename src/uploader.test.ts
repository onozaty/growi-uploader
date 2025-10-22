import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as growiClient from "./growi-client";
import * as markdown from "./markdown";
import type { MarkdownFile } from "./scanner";
import { uploadFiles } from "./uploader";
import type { Config } from "./config";

// Mock dependencies
vi.mock("./growi-client");
vi.mock("./markdown");

describe("uploadFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockConfig: Config = {
    url: "https://growi.example.com",
    token: "test-token",
    basePath: "/",
    update: false,
  };

  it("should upload a single page without attachments", async () => {
    const files: MarkdownFile[] = [
      {
        localPath: "guide.md",
        growiPath: "/guide",
        content: "# Guide",
        attachments: [],
      },
    ];

    vi.spyOn(growiClient, "createOrUpdatePage").mockResolvedValue({
      pageId: "page123",
      revisionId: "rev456",
      action: "created",
    });

    vi.spyOn(markdown, "replaceMarkdownExtension").mockReturnValue({
      content: "# Guide",
      replaced: false,
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
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[SUCCESS] guide.md → /guide (created)",
    );
  });

  it("should upload page and attachments", async () => {
    const files: MarkdownFile[] = [
      {
        localPath: "guide.md",
        growiPath: "/guide",
        content: "# Guide\n\n![image](guide_attachment_image.png)",
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

    vi.spyOn(growiClient, "uploadAttachment").mockResolvedValue({
      success: true,
      attachmentId: "attach789",
      revisionId: "rev999",
    });

    vi.spyOn(markdown, "replaceAttachmentLinks").mockReturnValue({
      content: "# Guide\n\n![image](/attachment/attach789)",
      replaced: true,
    });

    vi.spyOn(growiClient, "updatePageContent").mockResolvedValue({
      success: true,
      revisionId: "rev1000",
    });

    vi.spyOn(markdown, "replaceMarkdownExtension").mockReturnValue({
      content: "# Guide\n\n![image](/attachment/attach789)",
      replaced: false,
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

    expect(growiClient.uploadAttachment).toHaveBeenCalled();
    expect(markdown.replaceAttachmentLinks).toHaveBeenCalled();
    expect(growiClient.updatePageContent).toHaveBeenCalled();

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
        content: "# Guide",
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
        content: "# Guide",
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

    vi.spyOn(growiClient, "uploadAttachment").mockResolvedValue({
      success: false,
    });

    vi.spyOn(markdown, "replaceMarkdownExtension").mockReturnValue({
      content: "# Guide",
      replaced: false,
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
        content: "# Guide\n\n![image](./image.png)",
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

    vi.spyOn(markdown, "replaceAttachmentLinks").mockReturnValue({
      content: "# Guide\n\n![image](/attachment/attach789)",
      replaced: true,
    });

    const updatePageContentSpy = vi
      .spyOn(growiClient, "updatePageContent")
      .mockResolvedValue({
        success: false,
        errorMessage: "Update failed",
      });

    vi.spyOn(markdown, "replaceMarkdownExtension").mockReturnValue({
      content: "# Guide\n\n![image](/attachment/attach789)",
      replaced: false,
    });

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const stats = await uploadFiles(files, "/source", mockConfig);

    expect(stats.pagesCreated).toBe(1);
    expect(stats.attachmentsUploaded).toBe(1);
    expect(stats.linkReplacementErrors).toBe(1);
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
      "[ERROR] guide.md → /guide (failed to update attachment links: Update failed)",
    );
  });

  it("should replace page links when .md extension is found", async () => {
    const files: MarkdownFile[] = [
      {
        localPath: "guide.md",
        growiPath: "/guide",
        content: "# Guide\n\n[Link](./other.md)",
        attachments: [],
      },
    ];

    vi.spyOn(growiClient, "createOrUpdatePage").mockResolvedValue({
      pageId: "page123",
      revisionId: "rev456",
      action: "created",
    });

    vi.spyOn(markdown, "replaceMarkdownExtension").mockReturnValue({
      content: "# Guide\n\n[Link](./other)",
      replaced: true,
    });

    const updatePageContentSpy = vi
      .spyOn(growiClient, "updatePageContent")
      .mockResolvedValue({ success: true, revisionId: "rev789" });

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const stats = await uploadFiles(files, "/source", mockConfig);

    expect(stats.pagesCreated).toBe(1);
    expect(stats.linkReplacementErrors).toBe(0);
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
        content: "# Guide\n\n[Link](./other.md)",
        attachments: [],
      },
    ];

    vi.spyOn(growiClient, "createOrUpdatePage").mockResolvedValue({
      pageId: "page123",
      revisionId: "rev456",
      action: "created",
    });

    vi.spyOn(markdown, "replaceMarkdownExtension").mockReturnValue({
      content: "# Guide\n\n[Link](./other)",
      replaced: true,
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
      "[ERROR] guide.md → /guide (failed to update page links: Update failed)",
    );
  });

  it("should handle multiple pages with different outcomes", async () => {
    const files: MarkdownFile[] = [
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

    vi.spyOn(markdown, "replaceMarkdownExtension").mockReturnValue({
      content: "# Guide",
      replaced: false,
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
});
