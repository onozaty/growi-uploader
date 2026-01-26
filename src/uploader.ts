import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Config } from "./config";
import {
  createOrUpdatePage,
  formatDetailedError,
  updatePageContent,
  uploadAttachment,
} from "./growi-client";
import {
  replaceAttachmentLinks,
  replaceExternalAttachmentLinks,
  replaceMarkdownExtension,
} from "./markdown";
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

// Global map of attachment localPath → attachmentId
type AttachmentMap = Map<string, string>;

// Result from Pass 1 for use in Pass 2
type PageResult = {
  file: MarkdownFile;
  pageId: string;
  revisionId: string;
};

/**
 * Upload Markdown files and their attachments to GROWI
 *
 * This function orchestrates a 2-pass upload process:
 *
 * Pass 1: Page creation and attachment upload
 * - Create or update page with original Markdown content
 * - Upload attachments (skip external references)
 * - Build global attachment map for cross-page reference resolution
 *
 * Pass 2: Link replacement
 * - Replace attachment links (both local and external references)
 * - Replace .md extension in page links
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

  // Global attachment map: localPath → attachmentId
  const attachmentMap: AttachmentMap = new Map();

  // Results from Pass 1 for use in Pass 2
  const pageResults: PageResult[] = [];

  // ========================================
  // Pass 1: Page creation and attachment upload
  // ========================================
  for (const file of files) {
    // Read file content
    const content = readFileSync(join(sourceDir, file.localPath), "utf-8");

    // Create or update page with original Markdown
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
      if (config.verbose && result.error) {
        console.error(formatDetailedError(result.error));
      }
    }

    // Upload attachments (only if page was created or updated)
    if (
      result.pageId &&
      (result.action === "created" || result.action === "updated")
    ) {
      let latestRevisionId = result.revisionId;

      // Upload attachments (skip external references)
      for (const attachment of file.attachments) {
        // Skip external references - they will be resolved in Pass 2
        if (attachment.isExternalReference) {
          continue;
        }

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
            // Add to global attachment map for cross-page reference resolution
            attachmentMap.set(attachment.localPath, attachmentResult.attachmentId);
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
          if (config.verbose && attachmentResult.error) {
            console.error(formatDetailedError(attachmentResult.error));
          }
        }
      }

      // Save result for Pass 2
      if (latestRevisionId) {
        pageResults.push({
          file,
          pageId: result.pageId,
          revisionId: latestRevisionId,
        });
      }
    } else if (file.attachments.length > 0) {
      // Page was skipped or error: skip attachments too
      for (const attachment of file.attachments) {
        // Only log skip for non-external attachments
        if (!attachment.isExternalReference) {
          console.log(
            `[SKIP] ${attachment.localPath} → ${file.growiPath} (attachment skipped)`,
          );
          stats.attachmentsSkipped++;
        }
      }
    }
  }

  // ========================================
  // Pass 2: Link replacement
  // ========================================
  for (const pageResult of pageResults) {
    const { file, pageId } = pageResult;
    // Re-read file content to minimize memory usage
    let currentContent = readFileSync(join(sourceDir, file.localPath), "utf-8");
    let currentRevisionId = pageResult.revisionId;

    const pageName = basename(file.localPath, ".md");

    // Get local attachments (non-external) that have been uploaded
    const localAttachments = file.attachments.filter(
      (att) => !att.isExternalReference && att.attachmentId,
    );

    // Get external references
    const externalAttachments = file.attachments.filter(
      (att) => att.isExternalReference,
    );

    let hasReplacements = false;

    // Replace local attachment links
    if (localAttachments.length > 0) {
      const { content: replacedContent, replaced } = replaceAttachmentLinks(
        currentContent,
        localAttachments,
        pageName,
      );
      if (replaced) {
        currentContent = replacedContent;
        hasReplacements = true;
      }
    }

    // Replace external attachment links using global attachment map
    if (externalAttachments.length > 0) {
      const { content: replacedContent, replaced } =
        replaceExternalAttachmentLinks(
          currentContent,
          externalAttachments,
          attachmentMap,
        );
      if (replaced) {
        currentContent = replacedContent;
        hasReplacements = true;
      }
    }

    // Replace .md extension in page links
    const { content: linkedContent, replaced: linkReplaced } =
      replaceMarkdownExtension(currentContent, config.basePath);
    if (linkReplaced) {
      currentContent = linkedContent;
      hasReplacements = true;
    }

    // Update page if any replacements were made
    if (hasReplacements) {
      const updateResult = await updatePageContent(
        pageId,
        currentRevisionId,
        currentContent,
      );

      if (updateResult.success && updateResult.revisionId) {
        const replacementTypes: string[] = [];
        if (localAttachments.some((att) => att.attachmentId)) {
          replacementTypes.push("attachment links");
        }
        if (externalAttachments.length > 0) {
          replacementTypes.push("external references");
        }
        if (linkReplaced) {
          replacementTypes.push("page links");
        }
        console.log(
          `[SUCCESS] ${file.localPath} → ${file.growiPath} (${replacementTypes.join(", ")} replaced)`,
        );
        currentRevisionId = updateResult.revisionId;
      } else {
        console.error(
          `[ERROR] ${file.localPath} → ${file.growiPath} (failed to update links: ${updateResult.errorMessage || "unknown error"})`,
        );
        if (config.verbose && updateResult.error) {
          console.error(formatDetailedError(updateResult.error));
        }
        stats.linkReplacementErrors++;
      }
    }
  }

  return stats;
};
