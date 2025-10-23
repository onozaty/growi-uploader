import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Config } from "./config";
import {
  createOrUpdatePage,
  updatePageContent,
  uploadAttachment,
} from "./growi-client";
import { replaceAttachmentLinks, replaceMarkdownExtension } from "./markdown";
import type { MarkdownFile } from "./scanner";

export type UploadStats = {
  pagesCreated: number;
  pagesUpdated: number;
  pagesSkipped: number;
  pageErrors: number;
  attachmentsUploaded: number;
  attachmentsSkipped: number;
  attachmentErrors: number;
  linkReplacementErrors: number;
};

/**
 * Upload Markdown files and their attachments to GROWI
 *
 * This function orchestrates a 4-stage upload process:
 * 1. Create or update page with original Markdown content
 * 2. Upload attachments
 * 3. Replace attachment links in Markdown and update page
 * 4. Replace .md extension in page links and update page
 *
 * @param files List of Markdown files to upload
 * @param sourceDir Source directory containing files
 * @param config Configuration (only update flag is used)
 * @returns Upload statistics
 */
export const uploadFiles = async (
  files: MarkdownFile[],
  sourceDir: string,
  config: Config,
): Promise<UploadStats> => {
  // Statistics
  const stats: UploadStats = {
    pagesCreated: 0,
    pagesUpdated: 0,
    pagesSkipped: 0,
    pageErrors: 0,
    attachmentsUploaded: 0,
    attachmentsSkipped: 0,
    attachmentErrors: 0,
    linkReplacementErrors: 0,
  };

  // Upload pages and their attachments with 4-stage update flow
  for (const file of files) {
    // Read file content
    const content = readFileSync(join(sourceDir, file.localPath), "utf-8");

    // Stage 1: Create or update page with original Markdown
    const result = await createOrUpdatePage(file, content, config.update);

    // Track statistics and log result
    if (result.action === "created") {
      stats.pagesCreated++;
      console.log(`[SUCCESS] ${file.localPath} → ${file.growiPath} (created)`);
    } else if (result.action === "updated") {
      stats.pagesUpdated++;
      console.log(`[SUCCESS] ${file.localPath} → ${file.growiPath} (updated)`);
    } else if (result.action === "skipped") {
      stats.pagesSkipped++;
      console.log(
        `[SKIP] ${file.localPath} → ${file.growiPath} (page already exists)`,
      );
    } else if (result.action === "error") {
      stats.pageErrors++;
      console.error(
        `[ERROR] ${file.localPath} → ${file.growiPath} (${result.errorMessage || "unknown error"})`,
      );
    }

    // Stage 2: Upload attachments (only if page was created or updated)
    if (
      result.pageId &&
      (result.action === "created" || result.action === "updated")
    ) {
      // Initialize content and revision tracking
      let currentContent = content;
      let currentRevisionId = result.revisionId;

      // Upload attachments if any
      if (file.attachments.length > 0) {
        let hasAttachments = false;
        let latestRevisionId = result.revisionId;

        for (const attachment of file.attachments) {
          const attachmentResult = await uploadAttachment(
            attachment,
            result.pageId,
            sourceDir,
          );

          if (attachmentResult.success) {
            stats.attachmentsUploaded++;
            console.log(
              `[SUCCESS] ${attachment.localPath} → ${file.growiPath} (attachment)`,
            );
            // Store attachment ID for link replacement
            if (attachmentResult.attachmentId) {
              attachment.attachmentId = attachmentResult.attachmentId;
              hasAttachments = true;
            }
            // Track the latest revision ID from attachment uploads
            if (attachmentResult.revisionId) {
              latestRevisionId = attachmentResult.revisionId;
            }
          } else {
            stats.attachmentErrors++;
            console.error(
              `[ERROR] ${attachment.localPath} → ${file.growiPath} (${attachmentResult.errorMessage || "failed to upload attachment"})`,
            );
          }
        }

        // Stage 3: Replace attachment links in Markdown and update page
        if (hasAttachments && latestRevisionId) {
          currentRevisionId = latestRevisionId;

          const pageName = basename(file.localPath, ".md");
          const { content: replacedContent, replaced } = replaceAttachmentLinks(
            currentContent,
            file.attachments,
            pageName,
          );

          // Re-update page only if links were replaced
          if (replaced) {
            const updateResult = await updatePageContent(
              result.pageId,
              currentRevisionId,
              replacedContent,
            );

            if (updateResult.success && updateResult.revisionId) {
              console.log(
                `[SUCCESS] ${file.localPath} → ${file.growiPath} (attachment links replaced)`,
              );
              currentContent = replacedContent;
              currentRevisionId = updateResult.revisionId;
            } else {
              console.error(
                `[ERROR] ${file.localPath} → ${file.growiPath} (failed to update attachment links: ${updateResult.errorMessage || "unknown error"})`,
              );
              stats.linkReplacementErrors++;
            }
          }
        }
      }

      // Stage 4: Replace .md extension in page links
      if (currentRevisionId) {
        const { content: linkedContent, replaced: linkReplaced } =
          replaceMarkdownExtension(currentContent);

        if (linkReplaced) {
          const updateResult = await updatePageContent(
            result.pageId,
            currentRevisionId,
            linkedContent,
          );

          if (updateResult.success && updateResult.revisionId) {
            console.log(
              `[SUCCESS] ${file.localPath} → ${file.growiPath} (page links replaced)`,
            );
            currentRevisionId = updateResult.revisionId;
          } else {
            console.error(
              `[ERROR] ${file.localPath} → ${file.growiPath} (failed to update page links: ${updateResult.errorMessage || "unknown error"})`,
            );
            stats.linkReplacementErrors++;
          }
        }
      }
    } else if (file.attachments.length > 0) {
      // Page was skipped or error: skip attachments too
      for (const attachment of file.attachments) {
        console.log(
          `[SKIP] ${attachment.localPath} → ${file.growiPath} (attachment skipped)`,
        );
        stats.attachmentsSkipped++;
      }
    }
  }

  return stats;
};
