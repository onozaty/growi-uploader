import axios from "axios";
import * as fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as growi from "./generated/growi";
import type { AttachmentFile, MarkdownFile } from "./scanner";
import {
  configureAxios,
  createOrUpdatePage,
  formatDetailedError,
  updatePageContent,
  uploadAttachment,
} from "./growi-client";

// Mock dependencies
vi.mock("axios");
vi.mock("./generated/growi");
vi.mock("node:fs");

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("configureAxios", () => {
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

  it("should remove trailing slash from URL", () => {
    configureAxios("https://growi.example.com/", "test-token");

    expect(axios.defaults.baseURL).toBe("https://growi.example.com/_api/v3");
  });

  it("should handle URL with multiple trailing slashes", () => {
    configureAxios("https://growi.example.com///", "test-token");

    expect(axios.defaults.baseURL).toBe("https://growi.example.com/_api/v3");
  });
});

describe("createOrUpdatePage", () => {
  const mockFile: MarkdownFile = {
    localPath: "guide.md",
    growiPath: "/guide",
    attachments: [],
  };
  const mockContent = "# Guide\n\nContent here";

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

    const result = await createOrUpdatePage(mockFile, mockContent, false);

    expect(result).toEqual({
      pageId: "page123",
      revisionId: "rev456",
      action: "created",
    });
    expect(growi.postPage).toHaveBeenCalledWith({
      path: "/guide",
      body: "# Guide\n\nContent here",
    });
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

    const result = await createOrUpdatePage(mockFile, mockContent, true);

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

    const result = await createOrUpdatePage(mockFile, mockContent, false);

    expect(result).toEqual({
      pageId: "page123",
      revisionId: "rev456",
      action: "skipped",
    });
    expect(putPageSpy).not.toHaveBeenCalled();
  });

  it("should return error action when getPage fails with non-404 error", async () => {
    const axiosError = {
      response: { status: 500, data: { message: "Server error" } },
      message: "Request failed",
      isAxiosError: true,
    };
    vi.spyOn(growi, "getPage").mockRejectedValue(axiosError);
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);

    const result = await createOrUpdatePage(mockFile, mockContent, false);

    expect(result).toMatchObject({
      pageId: undefined,
      revisionId: undefined,
      action: "error",
      errorMessage: "HTTP 500 Server error",
    });
    expect(result.error).toBeDefined();
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

    const result = await createOrUpdatePage(mockFile, mockContent, false);

    expect(result).toMatchObject({
      pageId: undefined,
      revisionId: undefined,
      action: "error",
      errorMessage: "HTTP 400 Invalid path",
    });
    expect(result.error).toBeDefined();
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

    const result = await createOrUpdatePage(mockFile, mockContent, false);

    expect(result).toMatchObject({
      pageId: undefined,
      revisionId: undefined,
      action: "error",
      errorMessage: "Network failure",
    });
    expect(result.error).toBeDefined();
  });
});

describe("uploadAttachment", () => {
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
    const postAttachmentSpy = vi
      .spyOn(growi, "postAttachment")
      .mockResolvedValue(postAttachmentResponse);

    const result = await uploadAttachment(mockAttachment, "page123", "/source");

    expect(result).toEqual({
      success: true,
      attachmentId: "attach123",
      revisionId: "rev789",
    });
    expect(fs.readFileSync).toHaveBeenCalledWith("/source/images/photo.jpg");

    // Verify FormData content
    const formDataArg = postAttachmentSpy.mock.calls[0]?.[0] as FormData;
    expect(formDataArg).toBeInstanceOf(FormData);
    expect(formDataArg.get("page_id")).toBe("page123");

    const fileEntry = formDataArg.get("file");
    expect(fileEntry).toBeInstanceOf(Blob);
    expect((fileEntry as Blob).type).toBe("image/jpeg");
    expect((fileEntry as File).name).toBe("photo.jpg");
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
    const postAttachmentSpy = vi
      .spyOn(growi, "postAttachment")
      .mockResolvedValue(postAttachmentResponse);

    await uploadAttachment(pdfAttachment, "page123", "/source");

    // Verify FormData content with PDF MIME type
    const formDataArg = postAttachmentSpy.mock.calls[0]?.[0] as FormData;
    expect(formDataArg).toBeInstanceOf(FormData);
    expect(formDataArg.get("page_id")).toBe("page123");

    const fileEntry = formDataArg.get("file");
    expect(fileEntry).toBeInstanceOf(Blob);
    expect((fileEntry as Blob).type).toBe("application/pdf");
    expect((fileEntry as File).name).toBe("document.pdf");
  });

  it("should handle file read errors", async () => {
    const readError = new Error("File not found");
    vi.spyOn(fs, "readFileSync").mockImplementation(() => {
      throw readError;
    });

    const result = await uploadAttachment(mockAttachment, "page123", "/source");

    expect(result).toMatchObject({
      success: false,
      errorMessage: "File not found",
    });
    expect(result.error).toBeDefined();
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

    const result = await uploadAttachment(mockAttachment, "page123", "/source");

    expect(result).toMatchObject({
      success: false,
      errorMessage: "HTTP 413 File too large",
    });
    expect(result.error).toBeDefined();
  });
});

describe("updatePageContent", () => {
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
    );

    expect(result).toEqual({ success: true, revisionId: "rev999" });
    expect(growi.putPage).toHaveBeenCalledWith({
      body: "# Updated content",
      pageId: "page123",
      revisionId: "rev456",
    });
  });

  it("should return error message on 409 conflict errors", async () => {
    const axiosError = {
      response: { status: 409, data: { message: "Conflict" } },
      message: "Conflict",
      isAxiosError: true,
    };
    vi.spyOn(growi, "putPage").mockRejectedValue(axiosError);
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);

    const result = await updatePageContent("page123", "rev456", "# Content");

    expect(result).toMatchObject({
      success: false,
      errorMessage: "HTTP 409 Conflict",
    });
    expect(result.error).toBeDefined();
  });

  it("should return error message for non-axios errors", async () => {
    const nonAxiosError = new Error("Network timeout");
    vi.spyOn(growi, "putPage").mockRejectedValue(nonAxiosError);
    vi.spyOn(axios, "isAxiosError").mockReturnValue(false);

    const result = await updatePageContent("page123", "rev456", "# Content");

    expect(result).toMatchObject({
      success: false,
      errorMessage: "Network timeout",
    });
    expect(result.error).toBeDefined();
  });
});

describe("formatDetailedError", () => {
  it("should format axios error with complete information", () => {
    const axiosError = {
      response: {
        status: 500,
        statusText: "Internal Server Error",
        data: { message: "Database connection failed", code: "DB_ERROR" },
      },
      code: "ERR_BAD_RESPONSE",
      config: { method: "post", url: "/page" },
      stack: "Error: Request failed\n    at line1\n    at line2\n    at line3",
      isAxiosError: true,
    };
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);

    const result = formatDetailedError(axiosError);

    expect(result).toContain("HTTP Status: 500 Internal Server Error");
    expect(result).toContain("Response Body:");
    expect(result).toContain('"message": "Database connection failed"');
    expect(result).toContain('"code": "DB_ERROR"');
    expect(result).toContain("Error Code: ERR_BAD_RESPONSE");
    expect(result).toContain("Request: POST /page");
    expect(result).toContain("Stack Trace:");
    expect(result).toContain("Error: Request failed");
  });

  it("should format axios error with minimal information", () => {
    const axiosError = {
      response: { status: 404 },
      message: "Not Found",
      isAxiosError: true,
    };
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);

    const result = formatDetailedError(axiosError);

    expect(result).toContain("HTTP Status: 404");
    expect(result).not.toContain("Response Body:");
  });

  it("should format axios error with response data as string", () => {
    const axiosError = {
      response: {
        status: 400,
        data: "Invalid request format",
      },
      isAxiosError: true,
    };
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);

    const result = formatDetailedError(axiosError);

    expect(result).toContain("HTTP Status: 400");
    expect(result).toContain("Response Body:");
    expect(result).toContain("Invalid request format");
  });

  it("should format standard Error objects", () => {
    const error = new Error("Connection timeout");
    error.stack = "Error: Connection timeout\n    at line1\n    at line2";
    vi.spyOn(axios, "isAxiosError").mockReturnValue(false);

    const result = formatDetailedError(error);

    expect(result).toContain("Error: Connection timeout");
    expect(result).toContain("Stack Trace:");
    expect(result).toContain("Error: Connection timeout");
    expect(result).toContain("at line1");
  });

  it("should format non-Error objects", () => {
    const error = "Something went wrong";
    vi.spyOn(axios, "isAxiosError").mockReturnValue(false);

    const result = formatDetailedError(error);

    expect(result).toContain("Error: Something went wrong");
  });

  it("should handle axios error with complex nested response data", () => {
    const axiosError = {
      response: {
        status: 422,
        data: {
          errors: [
            { field: "title", message: "Title is required" },
            { field: "body", message: "Body is too short" },
          ],
        },
      },
      isAxiosError: true,
    };
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);

    const result = formatDetailedError(axiosError);

    expect(result).toContain("HTTP Status: 422");
    expect(result).toContain("Response Body:");
    expect(result).toContain('"field": "title"');
    expect(result).toContain('"message": "Title is required"');
    expect(result).toContain('"field": "body"');
    expect(result).toContain('"message": "Body is too short"');
  });

  it("should limit stack trace to first 5 lines", () => {
    const axiosError = {
      response: { status: 500 },
      stack:
        "Error: Test\n    at line1\n    at line2\n    at line3\n    at line4\n    at line5\n    at line6\n    at line7",
      isAxiosError: true,
    };
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);

    const result = formatDetailedError(axiosError);

    // Stack trace is limited to first 5 lines (including the Error line)
    expect(result).toContain("at line1");
    expect(result).toContain("at line4");
    expect(result).not.toContain("at line5");
    expect(result).not.toContain("at line6");
    expect(result).not.toContain("at line7");
  });
});
