import axios from "axios";
import { lookup as mimeTypeLookup } from "mime-types";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getPage,
  postAttachment,
  postPage,
  putPage,
  type PostPageBody,
  type PutPageBody,
} from "./generated/growi";
import type { AttachmentFile, MarkdownFile } from "./scanner";

/**
 * Configure axios with GROWI API endpoint and authentication
 *
 * @param growiUrl GROWI base URL (e.g., "https://example.com")
 * @param token API token for authentication
 */
export const configureAxios = (growiUrl: string, token: string): void => {
  axios.defaults.baseURL = `${growiUrl}/_api/v3`;
  axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
};

/**
 * Format error into a human-readable error message
 *
 * @param error Error object from catch block
 * @returns Formatted error message string
 */
const formatErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    return `${error.response?.status} ${error.response?.data?.message || error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

export type PageResult = {
  pageId: string | undefined;
  revisionId: string | undefined;
  action: "created" | "updated" | "skipped" | "error";
  errorMessage?: string;
};

/**
 * Actual response structure from GROWI API for GET /page
 *
 * NOTE: The OpenAPI definition (growi-openapi.json) incorrectly defines the response
 * as returning a Page object directly. However, the actual GROWI API implementation
 * returns the page wrapped in an object: { page: Page }
 *
 * See: https://github.com/growilabs/growi/issues/10416
 *
 * Additionally, the `revision` field is returned as an object with { _id: string },
 * not as a string as defined in the OpenAPI spec.
 */
interface ActualGetPageResponse {
  page: {
    _id: string;
    revision?: {
      _id: string;
    };
    [key: string]: unknown;
  };
}

/**
 * Create a new page or update an existing page in GROWI
 *
 * @param file Markdown file to upload
 * @param shouldUpdate If true, update existing pages; if false, skip existing pages
 * @returns Result containing page ID, revision ID, and action taken
 */
export const createOrUpdatePage = async (
  file: MarkdownFile,
  shouldUpdate: boolean,
): Promise<PageResult> => {
  try {
    // Check if page already exists
    const existingPage = await getPage({ path: file.growiPath });

    // Page exists
    // Cast to actual response structure (see ActualGetPageResponse comment above)
    const actualResponse =
      existingPage.data as unknown as ActualGetPageResponse;
    if (actualResponse.page) {
      const pageId = actualResponse.page._id;
      const revisionId = actualResponse.page.revision?._id;

      if (!shouldUpdate) {
        // Skip if update is disabled
        return { pageId, revisionId, action: "skipped" };
      }

      // Update existing page when update flag is true
      const updateBody: PutPageBody = {
        body: file.content,
        pageId: pageId!,
        revisionId: revisionId!,
      };

      const updateResponse = await putPage(updateBody);
      // Get new revision ID from response (page.revision is a string)
      const newRevisionId = updateResponse.data.page?.revision;

      return {
        pageId,
        revisionId: newRevisionId || revisionId,
        action: "updated",
      };
    }
  } catch (error) {
    // If 404, page doesn't exist, proceed to create
    if (!axios.isAxiosError(error) || error.response?.status !== 404) {
      // Unexpected error - format error message
      return {
        pageId: undefined,
        revisionId: undefined,
        action: "error",
        errorMessage: formatErrorMessage(error),
      };
    }
  }

  // Create new page
  try {
    const requestBody: PostPageBody = {
      path: file.growiPath,
      body: file.content,
    };

    const response = await postPage(requestBody);
    const pageId = response.data.page?._id;
    // page.revision is a string (revision ID)
    const revisionId = response.data.page?.revision;
    return { pageId, revisionId, action: "created" };
  } catch (error) {
    return {
      pageId: undefined,
      revisionId: undefined,
      action: "error",
      errorMessage: formatErrorMessage(error),
    };
  }
};

export type AttachmentResult = {
  success: boolean;
  attachmentId?: string;
  revisionId?: string;
  errorMessage?: string;
};

export type UpdatePageContentResult = {
  success: boolean;
  revisionId?: string;
  errorMessage?: string;
};

/**
 * Update page content with new Markdown content
 *
 * @param pageId Page ID
 * @param revisionId Current revision ID
 * @param content New Markdown content
 * @returns Result containing success status, new revision ID, or error message
 */
export const updatePageContent = async (
  pageId: string,
  revisionId: string,
  content: string,
): Promise<UpdatePageContentResult> => {
  try {
    const updateBody: PutPageBody = {
      body: content,
      pageId,
      revisionId,
    };

    const response = await putPage(updateBody);
    // Get new revision ID from response (page.revision is a string)
    const newRevisionId = response.data.page?.revision;
    return {
      success: true,
      ...(newRevisionId && { revisionId: newRevisionId }),
    };
  } catch (error) {
    return { success: false, errorMessage: formatErrorMessage(error) };
  }
};

/**
 * Upload an attachment file to a GROWI page
 *
 * @param attachment Attachment file to upload
 * @param pageId Page ID to attach the file to
 * @param sourceDir Source directory containing the attachment file
 * @returns Result containing attachment ID, revision ID, and success status
 */
export const uploadAttachment = async (
  attachment: AttachmentFile,
  pageId: string,
  sourceDir: string,
): Promise<AttachmentResult> => {
  try {
    const filePath = join(sourceDir, attachment.localPath);
    const fileBuffer = readFileSync(filePath);

    // Get MIME type from file extension
    const mimeType =
      mimeTypeLookup(attachment.fileName) || "application/octet-stream";

    // Create FormData for multipart/form-data request
    const formData = new FormData();
    formData.append("page_id", pageId);
    formData.append(
      "file",
      new Blob([fileBuffer], { type: mimeType }),
      attachment.fileName,
    );

    const response = await postAttachment(
      formData as unknown as { page_id: string; file: Blob },
    );

    // Get attachment ID and new revision ID from response
    const attachmentId = response.data.attachment?._id;
    const revisionId =
      typeof response.data.revision === "string"
        ? response.data.revision
        : undefined;

    return {
      success: true,
      ...(attachmentId && { attachmentId }),
      ...(revisionId && { revisionId }),
    };
  } catch (error) {
    return { success: false, errorMessage: formatErrorMessage(error) };
  }
};
