#!/usr/bin/env node

import { Command } from "commander";
import { resolve } from "node:path";
import packageJson from "../package.json";
import { loadConfig } from "./config";
import { configureAxios } from "./growi-client";
import { scanMarkdownFiles } from "./scanner";
import { uploadFiles } from "./uploader";

const program = new Command();

export const main = async (
  sourceDir: string,
  configPath: string,
  verboseOverride?: boolean,
): Promise<void> => {
  // Load configuration
  const config = loadConfig(configPath);

  // Override verbose setting if CLI option is provided
  if (verboseOverride !== undefined) {
    config.verbose = verboseOverride;
  }

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

  // Upload files and get statistics
  const stats = await uploadFiles(files, sourceDirPath, config);

  // Display summary
  console.log("\nCompleted:");
  console.log(`- Pages created: ${stats.pagesCreated}`);
  console.log(`- Pages updated: ${stats.pagesUpdated}`);
  console.log(`- Pages skipped: ${stats.pagesSkipped}`);
  console.log(`- Page errors: ${stats.pageErrors}`);
  console.log(`- Attachments uploaded: ${stats.attachmentsUploaded}`);
  console.log(`- Attachments skipped: ${stats.attachmentsSkipped}`);
  console.log(`- Attachment errors: ${stats.attachmentErrors}`);
  console.log(`- Link replacement errors: ${stats.linkReplacementErrors}`);
};

program
  .name("growi-uploader")
  .description("A content uploader for GROWI")
  .version(packageJson.version)
  .argument("<source-dir>", "Source directory containing Markdown files")
  .option("-c, --config <path>", "Path to config file", "growi-uploader.json")
  .option(
    "-v, --verbose",
    "Enable verbose error output with detailed information",
  )
  .action(
    async (
      sourceDir: string,
      options: { config: string; verbose?: boolean },
    ) => {
      try {
        await main(sourceDir, options.config, options.verbose);
      } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
        process.exit(1);
      }
    },
  );

// Only parse command line arguments if not in test mode
if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  program.parse();
}
