import axios from "axios";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { postPage, postAttachment, type PostPageBody } from "./growi";
import type { MarkdownFile, AttachmentFile } from "./scanner";

export const createPage = async (
  file: MarkdownFile,
  growiUrl: string,
  token: string,
): Promise<string | undefined> => {
  // Configure axios with base URL and auth header
  axios.defaults.baseURL = `${growiUrl}/_api/v3`;
  axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;

  const requestBody: PostPageBody = {
    path: file.growiPath,
    body: file.content,
  };

  try {
    const response = await postPage(requestBody);
    console.log(`[SUCCESS] ${file.localPath} → ${file.growiPath}`);
    return response.data.page?._id;
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
    throw error;
  }
};

export const uploadAttachment = async (
  attachment: AttachmentFile,
  pageId: string,
  growiPath: string,
  sourceDir: string,
): Promise<void> => {
  try {
    const filePath = join(sourceDir, attachment.localPath);
    const fileBuffer = readFileSync(filePath);
    const blob = new Blob([fileBuffer]);

    const formData = new FormData();
    formData.append("page_id", pageId);
    formData.append("file", blob, attachment.fileName);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await postAttachment(formData as any);
    console.log(
      `[SUCCESS] ${attachment.localPath} → ${growiPath} (attachment)`,
    );
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
    throw error;
  }
};
