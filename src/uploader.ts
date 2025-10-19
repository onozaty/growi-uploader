import axios from "axios";
import { lookup as mimeTypeLookup } from "mime-types";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "./config";
import {
  getPage,
  postAttachment,
  postPage,
  putPage,
  type PostPageBody,
  type PutPageBody,
} from "./growi";
import type { AttachmentFile, MarkdownFile } from "./scanner";

export const configureAxios = (growiUrl: string, token: string): void => {
  axios.defaults.baseURL = `${growiUrl}/_api/v3`;
  axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
};

export type PageResult = {
  pageId: string | undefined;
  revisionId: string | undefined;
  action: "created" | "updated" | "skipped" | "error";
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

export const createOrUpdatePage = async (
  file: MarkdownFile,
  config: Config,
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

      if (!config.update) {
        // Skip if update is disabled
        console.log(
          `[SKIP] ${file.localPath} → ${file.growiPath} (page already exists)`,
        );
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

      console.log(`[SUCCESS] ${file.localPath} → ${file.growiPath} (updated)`);
      return {
        pageId,
        revisionId: newRevisionId || revisionId,
        action: "updated",
      };
    }
  } catch (error) {
    // If 404, page doesn't exist, proceed to create
    if (!axios.isAxiosError(error) || error.response?.status !== 404) {
      // Unexpected error
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.message || error.message;
        console.error(
          `[ERROR] ${file.localPath} → ${file.growiPath} (${status} ${message})`,
        );
      } else {
        console.error(
          `[ERROR] ${file.localPath} → ${file.growiPath} (${error})`,
        );
      }
      return { pageId: undefined, revisionId: undefined, action: "error" };
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
    console.log(`[SUCCESS] ${file.localPath} → ${file.growiPath} (created)`);
    return { pageId, revisionId, action: "created" };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;
      console.error(
        `[ERROR] ${file.localPath} → ${file.growiPath} (${status} ${message})`,
      );
    } else {
      console.error(`[ERROR] ${file.localPath} → ${file.growiPath} (${error})`);
    }
    return { pageId: undefined, revisionId: undefined, action: "error" };
  }
};

export type AttachmentResult = {
  success: boolean;
  attachmentId?: string;
  revisionId?: string;
};

/**
 * Replace attachment links in Markdown content with GROWI format
 *
 * Supports two detection patterns:
 * 1. Naming pattern: guide_attachment_file.png, ./guide_attachment_file.png
 * 2. Link pattern: ./images/photo.jpg, images/photo.jpg (as found in markdown)
 *
 * @param markdown Original Markdown content
 * @param attachments List of attachments with their IDs
 * @param pageName Page name (without .md extension)
 * @returns Object with replaced content and whether any replacement occurred
 */
export const replaceAttachmentLinks = (
  markdown: string,
  attachments: AttachmentFile[],
  pageName: string,
): { content: string; replaced: boolean } => {
  let result = markdown;
  let replaced = false;

  for (const attachment of attachments) {
    if (!attachment.attachmentId) continue;

    const growiPath = `/attachment/${attachment.attachmentId}`;
    const patterns: string[] = [];

    // Pattern 1: Naming convention (guide_attachment_file.png)
    if (attachment.detectionPattern === "naming") {
      const localFileName = `${pageName}_attachment_${attachment.fileName}`;
      const escapedFileName = localFileName.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );

      patterns.push(
        escapedFileName, // guide_attachment_file.png
        `\\./${escapedFileName}`, // ./guide_attachment_file.png
      );
    }

    // Pattern 2: Link-based (./images/photo.jpg)
    if (
      attachment.detectionPattern === "link" &&
      attachment.originalLinkPaths
    ) {
      for (const linkPath of attachment.originalLinkPaths) {
        const escapedPath = linkPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        patterns.push(escapedPath);

        // Also add variations: ./path <-> path
        if (linkPath.startsWith("./")) {
          // Add version without ./
          const withoutDot = linkPath.substring(2);
          const escapedWithoutDot = withoutDot.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&",
          );
          patterns.push(escapedWithoutDot);
        } else if (!linkPath.startsWith("../")) {
          // Add version with ./
          patterns.push(`\\./${escapedPath}`);
        }
      }
    }

    // Replace all patterns
    for (const pattern of patterns) {
      // Image link: ![...](pattern) → ![...](/attachment/id)
      const imgRegex = new RegExp(`!\\[([^\\]]*)\\]\\(${pattern}\\)`, "g");
      if (imgRegex.test(result)) {
        replaced = true;
        result = result.replace(imgRegex, `![$1](${growiPath})`);
      }

      // Regular link: [...](pattern) → [...](/attachment/id)
      // Note: Negative lookbehind to exclude image links (with !)
      const linkRegex = new RegExp(
        `(?<!!)\\[([^\\]]*)\\]\\(${pattern}\\)`,
        "g",
      );
      if (linkRegex.test(result)) {
        replaced = true;
        result = result.replace(linkRegex, `[$1](${growiPath})`);
      }
    }
  }

  return { content: result, replaced };
};

/**
 * Replace .md extension in page links with GROWI format
 *
 * Converts Markdown page links to GROWI-compatible format by removing .md extension.
 * External URLs (http://, https://) are excluded from replacement.
 *
 * Supported patterns:
 * - Relative path: [text](./page.md) → [text](./page)
 * - Filename only: [text](page.md) → [text](page)
 * - With anchor: [text](./page.md#section) → [text](./page#section)
 *
 * @param markdown Original Markdown content
 * @returns Object with replaced content and whether any replacement occurred
 */
export const replaceMarkdownExtension = (
  markdown: string,
): { content: string; replaced: boolean } => {
  // Match markdown links ending with .md (with optional anchor)
  // Pattern: [text](path.md) or [text](path.md#anchor)
  // Exclude external URLs starting with http:// or https://
  const regex = /(\[[^\]]*\]\((?!https?:\/\/)[^)]*?)\.md((?:#[^)]*)?\))/g;
  const result = markdown.replace(regex, "$1$2");

  return {
    content: result,
    replaced: result !== markdown,
  };
};

/**
 * Update page content only (for re-updating after attachment link replacement)
 *
 * @param pageId Page ID
 * @param revisionId Current revision ID
 * @param content New Markdown content
 * @param growiPath GROWI page path (for logging)
 * @returns New revision ID if update succeeded, undefined otherwise
 */
export const updatePageContent = async (
  pageId: string,
  revisionId: string,
  content: string,
  growiPath: string,
): Promise<string | undefined> => {
  try {
    const updateBody: PutPageBody = {
      body: content,
      pageId,
      revisionId,
    };

    const response = await putPage(updateBody);
    // Get new revision ID from response (page.revision is a string)
    const newRevisionId = response.data.page?.revision;
    return newRevisionId;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;
      console.error(
        `[WARN] Failed to update page content for ${growiPath} (${status} ${message})`,
      );
    } else {
      console.error(`[WARN] Failed to update page content for ${growiPath}`);
    }
    return undefined;
  }
};

export const uploadAttachment = async (
  attachment: AttachmentFile,
  pageId: string,
  growiPath: string,
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

    console.log(
      `[SUCCESS] ${attachment.localPath} → ${growiPath} (attachment)`,
    );

    if (attachmentId && revisionId) {
      return { success: true, attachmentId, revisionId };
    } else if (attachmentId) {
      return { success: true, attachmentId };
    } else if (revisionId) {
      return { success: true, revisionId };
    } else {
      return { success: true };
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;
      console.error(
        `[ERROR] ${attachment.localPath} → ${growiPath} (${status} ${message})`,
      );
    } else {
      console.error(
        `[ERROR] ${attachment.localPath} → ${growiPath} (${error})`,
      );
    }
    return { success: false };
  }
};
