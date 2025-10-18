#!/usr/bin/env node

import { Command } from "commander";
import { resolve } from "node:path";
import { loadConfig } from "./config";
import { scanMarkdownFiles } from "./scanner";
import {
  configureAxios,
  createOrUpdatePage,
  uploadAttachment,
} from "./uploader";
import packageJson from "../package.json";

const program = new Command();

program
  .name("growi-uploader")
  .description("A content uploader for GROWI")
  .version(packageJson.version)
  .argument("<source-dir>", "Source directory containing Markdown files")
  .option("-c, --config <path>", "Path to config file", "growi-uploader.json")
  .action(async (sourceDir: string, options: { config: string }) => {
    try {
      // Load configuration
      const config = loadConfig(options.config);
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

      // Upload pages and their attachments
      for (const file of files) {
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

        // Upload attachments for this page (only if page was created or updated)
        if (
          result.pageId &&
          (result.action === "created" || result.action === "updated") &&
          file.attachments.length > 0
        ) {
          // Page was created or updated: upload attachments
          for (const attachment of file.attachments) {
            const attachmentResult = await uploadAttachment(
              attachment,
              result.pageId,
              file.growiPath,
              sourceDirPath,
            );
            if (attachmentResult.success) {
              attachmentsUploaded++;
            } else {
              attachmentErrors++;
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
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
