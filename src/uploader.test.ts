import axios from "axios";
import * as fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "./config";
import * as growi from "./growi";
import type { AttachmentFile, MarkdownFile } from "./scanner";
import {
  configureAxios,
  createOrUpdatePage,
  replaceAttachmentLinks,
  replaceMarkdownExtension,
  updatePageContent,
  uploadAttachment,
} from "./uploader";

// Mock dependencies
vi.mock("axios");
vi.mock("./growi");
vi.mock("node:fs");

describe("replaceAttachmentLinks", () => {
  describe("naming pattern", () => {
    it("should replace filename only link", () => {
      const markdown = "![image](guide_attachment_image.png)";
      const attachments: AttachmentFile[] = [
        {
          localPath: "guide_attachment_image.png",
          fileName: "image.png",
          attachmentId: "abc123",
          detectionPattern: "naming",
        },
      ];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe("![image](/attachment/abc123)");
      expect(result.replaced).toBe(true);
    });

    it("should replace relative path link with ./", () => {
      const markdown = "![image](./guide_attachment_image.png)";
      const attachments: AttachmentFile[] = [
        {
          localPath: "guide_attachment_image.png",
          fileName: "image.png",
          attachmentId: "abc123",
          detectionPattern: "naming",
        },
      ];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe("![image](/attachment/abc123)");
      expect(result.replaced).toBe(true);
    });

    it("should replace both image and link references", () => {
      const markdown =
        "![img](guide_attachment_file.pdf)\n[Download](guide_attachment_file.pdf)";
      const attachments: AttachmentFile[] = [
        {
          localPath: "guide_attachment_file.pdf",
          fileName: "file.pdf",
          attachmentId: "def456",
          detectionPattern: "naming",
        },
      ];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe(
        "![img](/attachment/def456)\n[Download](/attachment/def456)",
      );
      expect(result.replaced).toBe(true);
    });
  });

  describe("link pattern", () => {
    it("should replace link pattern with ./ prefix", () => {
      const markdown = "![logo](./images/logo.png)";
      const attachments: AttachmentFile[] = [
        {
          localPath: "images/logo.png",
          fileName: "logo.png",
          attachmentId: "ghi789",
          detectionPattern: "link",
          originalLinkPaths: ["./images/logo.png"],
        },
      ];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe("![logo](/attachment/ghi789)");
      expect(result.replaced).toBe(true);
    });

    it("should replace link pattern without ./ prefix", () => {
      const markdown = "![logo](images/logo.png)";
      const attachments: AttachmentFile[] = [
        {
          localPath: "images/logo.png",
          fileName: "logo.png",
          attachmentId: "ghi789",
          detectionPattern: "link",
          originalLinkPaths: ["./images/logo.png"],
        },
      ];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe("![logo](/attachment/ghi789)");
      expect(result.replaced).toBe(true);
    });

    it("should handle originalLinkPaths with both ./ and without", () => {
      const markdown = "![logo1](./images/logo.png)\n![logo2](images/logo.png)";
      const attachments: AttachmentFile[] = [
        {
          localPath: "images/logo.png",
          fileName: "logo.png",
          attachmentId: "ghi789",
          detectionPattern: "link",
          originalLinkPaths: ["./images/logo.png"],
        },
      ];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe(
        "![logo1](/attachment/ghi789)\n![logo2](/attachment/ghi789)",
      );
      expect(result.replaced).toBe(true);
    });
  });

  describe("mixed patterns", () => {
    it("should replace both naming and link patterns", () => {
      const markdown =
        "![diagram](guide_attachment_diagram.png)\n![logo](./images/logo.png)";
      const attachments: AttachmentFile[] = [
        {
          localPath: "guide_attachment_diagram.png",
          fileName: "diagram.png",
          attachmentId: "abc123",
          detectionPattern: "naming",
        },
        {
          localPath: "images/logo.png",
          fileName: "logo.png",
          attachmentId: "def456",
          detectionPattern: "link",
          originalLinkPaths: ["./images/logo.png"],
        },
      ];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe(
        "![diagram](/attachment/abc123)\n![logo](/attachment/def456)",
      );
      expect(result.replaced).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should not replace when attachment has no ID", () => {
      const markdown = "![image](guide_attachment_image.png)";
      const attachments: AttachmentFile[] = [
        {
          localPath: "guide_attachment_image.png",
          fileName: "image.png",
          detectionPattern: "naming",
        },
      ];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe(markdown);
      expect(result.replaced).toBe(false);
    });

    it("should return replaced: false when no match", () => {
      const markdown = "![other](other.png)";
      const attachments: AttachmentFile[] = [
        {
          localPath: "guide_attachment_image.png",
          fileName: "image.png",
          attachmentId: "abc123",
          detectionPattern: "naming",
        },
      ];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe(markdown);
      expect(result.replaced).toBe(false);
    });

    it("should handle special characters in filenames", () => {
      const markdown = "![special](guide_attachment_file(1).png)";
      const attachments: AttachmentFile[] = [
        {
          localPath: "guide_attachment_file(1).png",
          fileName: "file(1).png",
          attachmentId: "abc123",
          detectionPattern: "naming",
        },
      ];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe("![special](/attachment/abc123)");
      expect(result.replaced).toBe(true);
    });

    it("should replace multiple occurrences of the same link", () => {
      const markdown =
        "![img1](guide_attachment_image.png) and ![img2](guide_attachment_image.png)";
      const attachments: AttachmentFile[] = [
        {
          localPath: "guide_attachment_image.png",
          fileName: "image.png",
          attachmentId: "abc123",
          detectionPattern: "naming",
        },
      ];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe(
        "![img1](/attachment/abc123) and ![img2](/attachment/abc123)",
      );
      expect(result.replaced).toBe(true);
    });

    it("should handle empty markdown", () => {
      const markdown = "";
      const attachments: AttachmentFile[] = [
        {
          localPath: "guide_attachment_image.png",
          fileName: "image.png",
          attachmentId: "abc123",
          detectionPattern: "naming",
        },
      ];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe("");
      expect(result.replaced).toBe(false);
    });

    it("should handle empty attachments array", () => {
      const markdown = "![image](guide_attachment_image.png)";
      const attachments: AttachmentFile[] = [];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe(markdown);
      expect(result.replaced).toBe(false);
    });
  });
});

describe("replaceMarkdownExtension", () => {
  describe("basic replacement", () => {
    it("should remove .md extension from relative path with ./", () => {
      const markdown = "[Guide](./guide.md)";
      const result = replaceMarkdownExtension(markdown);
      expect(result.content).toBe("[Guide](./guide)");
      expect(result.replaced).toBe(true);
    });

    it("should remove .md extension from filename only", () => {
      const markdown = "[Guide](guide.md)";
      const result = replaceMarkdownExtension(markdown);
      expect(result.content).toBe("[Guide](guide)");
      expect(result.replaced).toBe(true);
    });

    it("should preserve anchors", () => {
      const markdown = "[Section](./guide.md#intro)";
      const result = replaceMarkdownExtension(markdown);
      expect(result.content).toBe("[Section](./guide#intro)");
      expect(result.replaced).toBe(true);
    });

    it("should handle relative paths with ../", () => {
      const markdown = "[Parent](../parent.md)";
      const result = replaceMarkdownExtension(markdown);
      expect(result.content).toBe("[Parent](../parent)");
      expect(result.replaced).toBe(true);
    });
  });

  describe("external URLs", () => {
    it("should not replace external URLs with http://", () => {
      const markdown = "[External](http://example.com/guide.md)";
      const result = replaceMarkdownExtension(markdown);
      expect(result.content).toBe(markdown);
      expect(result.replaced).toBe(false);
    });

    it("should not replace external URLs with https://", () => {
      const markdown = "[GitHub](https://github.com/user/repo/README.md)";
      const result = replaceMarkdownExtension(markdown);
      expect(result.content).toBe(markdown);
      expect(result.replaced).toBe(false);
    });
  });

  describe("multiple links", () => {
    it("should handle multiple links", () => {
      const markdown = "[A](./a.md) and [B](b.md)";
      const result = replaceMarkdownExtension(markdown);
      expect(result.content).toBe("[A](./a) and [B](b)");
      expect(result.replaced).toBe(true);
    });

    it("should replace only internal links in mixed content", () => {
      const markdown =
        "[A](./a.md) and [B](b.md) but not [C](https://example.com/c.md)";
      const result = replaceMarkdownExtension(markdown);
      expect(result.content).toBe(
        "[A](./a) and [B](b) but not [C](https://example.com/c.md)",
      );
      expect(result.replaced).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should return replaced: false when no .md links", () => {
      const markdown = "[Guide](./guide)";
      const result = replaceMarkdownExtension(markdown);
      expect(result.content).toBe(markdown);
      expect(result.replaced).toBe(false);
    });

    it("should handle empty markdown", () => {
      const markdown = "";
      const result = replaceMarkdownExtension(markdown);
      expect(result.content).toBe("");
      expect(result.replaced).toBe(false);
    });

    it("should handle markdown with no links", () => {
      const markdown = "# Title\n\nSome text without links.";
      const result = replaceMarkdownExtension(markdown);
      expect(result.content).toBe(markdown);
      expect(result.replaced).toBe(false);
    });

    it("should handle complex anchors", () => {
      const markdown = "[Complex](./guide.md#section-with-dashes)";
      const result = replaceMarkdownExtension(markdown);
      expect(result.content).toBe("[Complex](./guide#section-with-dashes)");
      expect(result.replaced).toBe(true);
    });
  });
});

describe("configureAxios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should set axios baseURL correctly", () => {
    configureAxios("https://growi.example.com", "test-token");

    expect(axios.defaults.baseURL).toBe("https://growi.example.com/_api/v3");
  });

  it("should set axios Authorization header correctly", () => {
    configureAxios("https://growi.example.com", "test-token-123");

    expect(axios.defaults.headers.common["Authorization"]).toBe(
      "Bearer test-token-123",
    );
  });
});

describe("createOrUpdatePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockFile: MarkdownFile = {
    localPath: "guide.md",
    growiPath: "/guide",
    content: "# Guide\n\nContent here",
    attachments: [],
  };

  const config: Config = {
    url: "https://growi.example.com",
    token: "test-token",
    basePath: "/",
    update: false,
  };

  it("should create new page when page does not exist", async () => {
    const axiosError = {
      response: { status: 404 },
      isAxiosError: true,
    };
    vi.spyOn(growi, "getPage").mockRejectedValue(axiosError);
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);

    const postPageResponse = {
      data: {
        page: {
          _id: "page123",
          revision: "rev456",
        },
      },
    };
    vi.spyOn(growi, "postPage").mockResolvedValue(postPageResponse);

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await createOrUpdatePage(mockFile, config);

    expect(result).toEqual({
      pageId: "page123",
      revisionId: "rev456",
      action: "created",
    });
    expect(growi.postPage).toHaveBeenCalledWith({
      path: "/guide",
      body: "# Guide\n\nContent here",
    });
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[SUCCESS] guide.md → /guide (created)",
    );

    consoleLogSpy.mockRestore();
  });

  it("should update existing page when update flag is true", async () => {
    const getPageResponse = {
      data: {
        page: {
          _id: "page123",
          revision: { _id: "rev456" },
        },
      },
    };
    vi.spyOn(growi, "getPage").mockResolvedValue(getPageResponse);

    const putPageResponse = {
      data: {
        page: {
          revision: "rev789",
        },
      },
    };
    vi.spyOn(growi, "putPage").mockResolvedValue(putPageResponse);

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const configWithUpdate = { ...config, update: true };
    const result = await createOrUpdatePage(mockFile, configWithUpdate);

    expect(result).toEqual({
      pageId: "page123",
      revisionId: "rev789",
      action: "updated",
    });
    expect(growi.putPage).toHaveBeenCalledWith({
      body: "# Guide\n\nContent here",
      pageId: "page123",
      revisionId: "rev456",
    });
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[SUCCESS] guide.md → /guide (updated)",
    );

    consoleLogSpy.mockRestore();
  });

  it("should skip existing page when update flag is false", async () => {
    const getPageResponse = {
      data: {
        page: {
          _id: "page123",
          revision: { _id: "rev456" },
        },
      },
    };
    vi.spyOn(growi, "getPage").mockResolvedValue(getPageResponse);

    const putPageSpy = vi.spyOn(growi, "putPage");
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await createOrUpdatePage(mockFile, config);

    expect(result).toEqual({
      pageId: "page123",
      revisionId: "rev456",
      action: "skipped",
    });
    expect(putPageSpy).not.toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[SKIP] guide.md → /guide (page already exists)",
    );

    consoleLogSpy.mockRestore();
  });

  it("should return error action when getPage fails with non-404 error", async () => {
    const axiosError = {
      response: { status: 500, data: { message: "Server error" } },
      message: "Request failed",
      isAxiosError: true,
    };
    vi.spyOn(growi, "getPage").mockRejectedValue(axiosError);
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await createOrUpdatePage(mockFile, config);

    expect(result).toEqual({
      pageId: undefined,
      revisionId: undefined,
      action: "error",
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[ERROR] guide.md → /guide (500 Server error)",
    );

    consoleErrorSpy.mockRestore();
  });

  it("should return error action when postPage fails", async () => {
    const axiosError = {
      response: { status: 404 },
      isAxiosError: true,
    };
    vi.spyOn(growi, "getPage").mockRejectedValue(axiosError);
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);

    const createError = {
      response: { status: 400, data: { message: "Invalid path" } },
      message: "Bad request",
      isAxiosError: true,
    };
    vi.spyOn(growi, "postPage").mockRejectedValue(createError);

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await createOrUpdatePage(mockFile, config);

    expect(result).toEqual({
      pageId: undefined,
      revisionId: undefined,
      action: "error",
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[ERROR] guide.md → /guide (400 Invalid path)",
    );

    consoleErrorSpy.mockRestore();
  });

  it("should handle non-axios errors during page creation", async () => {
    const axiosError = {
      response: { status: 404 },
      isAxiosError: true,
    };
    vi.spyOn(growi, "getPage").mockRejectedValue(axiosError);
    vi.spyOn(axios, "isAxiosError").mockReturnValueOnce(true);

    const nonAxiosError = new Error("Network failure");
    vi.spyOn(growi, "postPage").mockRejectedValue(nonAxiosError);
    vi.spyOn(axios, "isAxiosError").mockReturnValueOnce(false);

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await createOrUpdatePage(mockFile, config);

    expect(result).toEqual({
      pageId: undefined,
      revisionId: undefined,
      action: "error",
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[ERROR] guide.md → /guide (Error: Network failure)",
    );

    consoleErrorSpy.mockRestore();
  });
});

describe("uploadAttachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockAttachment: AttachmentFile = {
    localPath: "images/photo.jpg",
    fileName: "photo.jpg",
    detectionPattern: "link",
    originalLinkPaths: ["./images/photo.jpg"],
  };

  it("should upload attachment successfully with attachmentId and revisionId", async () => {
    const mockBuffer = Buffer.from("fake-image-data");
    vi.spyOn(fs, "readFileSync").mockReturnValue(mockBuffer);

    const postAttachmentResponse = {
      data: {
        attachment: { _id: "attach123" },
        revision: "rev789",
      },
    };
    vi.spyOn(growi, "postAttachment").mockResolvedValue(postAttachmentResponse);

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await uploadAttachment(
      mockAttachment,
      "page123",
      "/guide",
      "/source",
    );

    expect(result).toEqual({
      success: true,
      attachmentId: "attach123",
      revisionId: "rev789",
    });
    expect(fs.readFileSync).toHaveBeenCalledWith("/source/images/photo.jpg");
    expect(consoleLogSpy).toHaveBeenCalledWith(
      "[SUCCESS] images/photo.jpg → /guide (attachment)",
    );

    consoleLogSpy.mockRestore();
  });

  it("should handle different MIME types correctly", async () => {
    const mockBuffer = Buffer.from("fake-pdf-data");
    vi.spyOn(fs, "readFileSync").mockReturnValue(mockBuffer);

    const pdfAttachment: AttachmentFile = {
      localPath: "document.pdf",
      fileName: "document.pdf",
      detectionPattern: "naming",
    };

    const postAttachmentResponse = {
      data: {
        attachment: { _id: "attach456" },
        revision: "rev999",
      },
    };
    vi.spyOn(growi, "postAttachment").mockResolvedValue(postAttachmentResponse);

    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await uploadAttachment(pdfAttachment, "page123", "/guide", "/source");

    const formDataCall = vi.mocked(growi.postAttachment).mock.calls[0]?.[0];
    expect(formDataCall).toBeDefined();

    consoleLogSpy.mockRestore();
  });

  it("should handle file read errors", async () => {
    const readError = new Error("File not found");
    vi.spyOn(fs, "readFileSync").mockImplementation(() => {
      throw readError;
    });

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await uploadAttachment(
      mockAttachment,
      "page123",
      "/guide",
      "/source",
    );

    expect(result).toEqual({ success: false });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[ERROR] images/photo.jpg → /guide (Error: File not found)",
    );

    consoleErrorSpy.mockRestore();
  });

  it("should handle upload API errors", async () => {
    const mockBuffer = Buffer.from("fake-data");
    vi.spyOn(fs, "readFileSync").mockReturnValue(mockBuffer);

    const axiosError = {
      response: { status: 413, data: { message: "File too large" } },
      message: "Request failed",
      isAxiosError: true,
    };
    vi.spyOn(growi, "postAttachment").mockRejectedValue(axiosError);
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await uploadAttachment(
      mockAttachment,
      "page123",
      "/guide",
      "/source",
    );

    expect(result).toEqual({ success: false });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[ERROR] images/photo.jpg → /guide (413 File too large)",
    );

    consoleErrorSpy.mockRestore();
  });
});

describe("updatePageContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should update page content successfully", async () => {
    const putPageResponse = {
      data: {
        page: {
          revision: "rev999",
        },
      },
    };
    vi.spyOn(growi, "putPage").mockResolvedValue(putPageResponse);

    const result = await updatePageContent(
      "page123",
      "rev456",
      "# Updated content",
      "/guide",
    );

    expect(result).toBe("rev999");
    expect(growi.putPage).toHaveBeenCalledWith({
      body: "# Updated content",
      pageId: "page123",
      revisionId: "rev456",
    });
  });

  it("should handle 409 conflict errors gracefully", async () => {
    const axiosError = {
      response: { status: 409, data: { message: "Conflict" } },
      message: "Conflict",
      isAxiosError: true,
    };
    vi.spyOn(growi, "putPage").mockRejectedValue(axiosError);
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await updatePageContent(
      "page123",
      "rev456",
      "# Content",
      "/guide",
    );

    expect(result).toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[WARN] Failed to update page content for /guide (409 Conflict)",
    );

    consoleErrorSpy.mockRestore();
  });

  it("should handle non-axios errors", async () => {
    const nonAxiosError = new Error("Network timeout");
    vi.spyOn(growi, "putPage").mockRejectedValue(nonAxiosError);
    vi.spyOn(axios, "isAxiosError").mockReturnValue(false);

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await updatePageContent(
      "page123",
      "rev456",
      "# Content",
      "/guide",
    );

    expect(result).toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[WARN] Failed to update page content for /guide",
    );

    consoleErrorSpy.mockRestore();
  });
});
