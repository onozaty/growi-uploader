#!/usr/bin/env node

import { Command } from "commander";
import { resolve } from "node:path";
import { loadConfig } from "./config";
import { scanMarkdownFiles } from "./scanner";
import {
  configureAxios,
  createPage,
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

      // Upload pages and their attachments
      for (const file of files) {
        const pageId = await createPage(file);

        // Upload attachments for this page
        if (pageId && file.attachments.length > 0) {
          for (const attachment of file.attachments) {
            await uploadAttachment(
              attachment,
              pageId,
              file.growiPath,
              sourceDirPath,
            );
          }
        }
      }

      console.log("\nCompleted");
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
