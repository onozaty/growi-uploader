#!/usr/bin/env node

import { Command } from "commander";
import { basename, resolve } from "node:path";
import packageJson from "../package.json";
import { loadConfig } from "./config";
import { scanMarkdownFiles } from "./scanner";
import {
  configureAxios,
  createOrUpdatePage,
  replaceAttachmentLinks,
  replaceMarkdownExtension,
  updatePageContent,
  uploadAttachment,
} from "./uploader";

const program = new Command();

export const main = async (
  sourceDir: string,
  configPath: string,
): Promise<void> => {
  // Load configuration
  const config = loadConfig(configPath);
  const sourceDirPath = resolve(sourceDir);

  // Configure axios once
  configureAxios(config.url, config.token);

  // Scan Markdown files
  const files = await scanMarkdownFiles(sourceDirPath, config.basePath);

  const totalAttachments = files.reduce(
    (sum, file) => sum + file.attachments.length,
    0,
  );
  console.log(
    `Found ${files.length} Markdown file(s) and ${totalAttachments} attachment(s)\n`,
  );

  // Statistics
  let pagesCreated = 0;
  let pagesUpdated = 0;
  let pagesSkipped = 0;
  let pageErrors = 0;
  let attachmentsUploaded = 0;
  let attachmentsSkipped = 0;
  let attachmentErrors = 0;

  // Upload pages and their attachments with 2-stage update flow
  for (const file of files) {
    // Stage 1: Create or update page with original Markdown
    const result = await createOrUpdatePage(file, config);

    // Track statistics
    if (result.action === "created") {
      pagesCreated++;
    } else if (result.action === "updated") {
      pagesUpdated++;
    } else if (result.action === "skipped") {
      pagesSkipped++;
    } else if (result.action === "error") {
      pageErrors++;
    }

    // Stage 2: Upload attachments (only if page was created or updated)
    if (
      result.pageId &&
      (result.action === "created" || result.action === "updated")
    ) {
      // Initialize content and revision tracking
      let currentContent = file.content;
      let currentRevisionId = result.revisionId;

      // Upload attachments if any
      if (file.attachments.length > 0) {
        let hasAttachments = false;
        let latestRevisionId = result.revisionId;

        for (const attachment of file.attachments) {
          const attachmentResult = await uploadAttachment(
            attachment,
            result.pageId,
            file.growiPath,
            sourceDirPath,
          );

          if (attachmentResult.success) {
            attachmentsUploaded++;
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
            attachmentErrors++;
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
            const newRevisionId = await updatePageContent(
              result.pageId,
              currentRevisionId,
              replacedContent,
              file.growiPath,
            );

            if (newRevisionId) {
              console.log(
                `[SUCCESS] ${file.localPath} → ${file.growiPath} (attachment links replaced)`,
              );
              currentContent = replacedContent;
              currentRevisionId = newRevisionId;
            }
          }
        }
      }

      // Stage 4: Replace .md extension in page links
      if (currentRevisionId) {
        const { content: linkedContent, replaced: linkReplaced } =
          replaceMarkdownExtension(currentContent);

        if (linkReplaced) {
          const newRevisionId = await updatePageContent(
            result.pageId,
            currentRevisionId,
            linkedContent,
            file.growiPath,
          );

          if (newRevisionId) {
            console.log(
              `[SUCCESS] ${file.localPath} → ${file.growiPath} (page links replaced)`,
            );
          }
        }
      }
    } else if (file.attachments.length > 0) {
      // Page was skipped or error: skip attachments too
      for (const attachment of file.attachments) {
        console.log(
          `[SKIP] ${attachment.localPath} → ${file.growiPath} (attachment skipped)`,
        );
        attachmentsSkipped++;
      }
    }
  }

  // Display summary
  console.log("\nCompleted:");
  console.log(`- Pages created: ${pagesCreated}`);
  console.log(`- Pages updated: ${pagesUpdated}`);
  console.log(`- Pages skipped: ${pagesSkipped}`);
  console.log(`- Page errors: ${pageErrors}`);
  console.log(`- Attachments uploaded: ${attachmentsUploaded}`);
  console.log(`- Attachments skipped: ${attachmentsSkipped}`);
  console.log(`- Attachment errors: ${attachmentErrors}`);
};

program
  .name("growi-uploader")
  .description("A content uploader for GROWI")
  .version(packageJson.version)
  .argument("<source-dir>", "Source directory containing Markdown files")
  .option("-c, --config <path>", "Path to config file", "growi-uploader.json")
  .action(async (sourceDir: string, options: { config: string }) => {
    try {
      await main(sourceDir, options.config);
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Only parse command line arguments if not in test mode
if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  program.parse();
}
