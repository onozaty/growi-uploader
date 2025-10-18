import axios from "axios";
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
        return { pageId, action: "skipped" };
      }

      // Update existing page when update flag is true
      const updateBody: PutPageBody = {
        body: file.content,
        pageId: pageId!,
        revisionId: revisionId!,
      };

      await putPage(updateBody);
      console.log(`[SUCCESS] ${file.localPath} → ${file.growiPath} (updated)`);
      return { pageId, action: "updated" };
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
      return { pageId: undefined, action: "error" };
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
    console.log(`[SUCCESS] ${file.localPath} → ${file.growiPath} (created)`);
    return { pageId, action: "created" };
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
    return { pageId: undefined, action: "error" };
  }
};

export type AttachmentResult = {
  success: boolean;
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

    // Create FormData for multipart/form-data request
    const formData = new FormData();
    formData.append("page_id", pageId);
    formData.append("file", new Blob([fileBuffer]), attachment.fileName);

    await postAttachment(
      formData as unknown as { page_id: string; file: Blob },
    );
    console.log(
      `[SUCCESS] ${attachment.localPath} → ${growiPath} (attachment)`,
    );
    return { success: true };
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
