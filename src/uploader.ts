import axios from "axios";
import { postPage, type PostPageBody } from "./growi";
import type { MarkdownFile } from "./scanner";

export const createPage = async (
  file: MarkdownFile,
  growiUrl: string,
  token: string,
): Promise<void> => {
  // Configure axios with base URL and auth header
  axios.defaults.baseURL = `${growiUrl}/_api/v3`;
  axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;

  const requestBody: PostPageBody = {
    path: file.growiPath,
    body: file.content,
  };

  try {
    await postPage(requestBody);
    console.log(`[SUCCESS] ${file.localPath} → ${file.growiPath}`);
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
