#!/usr/bin/env node

import { Command } from "commander";
import { resolve } from "node:path";
import { loadConfig } from "./config";
import { scanMarkdownFiles } from "./scanner";
import { createPage } from "./uploader";

const program = new Command();

program
  .name("growi-uploader")
  .description("A content uploader for GROWI")
  .version("1.0.0")
  .argument("<source-dir>", "Source directory containing Markdown files")
  .option("-c, --config <path>", "Path to config file", "growi-uploader.json")
  .action(async (sourceDir: string, options: { config: string }) => {
    try {
      // Load configuration
      const config = loadConfig(options.config);

      // Scan Markdown files
      const files = await scanMarkdownFiles(
        resolve(sourceDir),
        config.basePath,
      );

      console.log(`Found ${files.length} Markdown file(s)\n`);

      // Upload pages
      for (const file of files) {
        await createPage(file, config.url, config.token);
      }

      console.log("\nCompleted");
    } catch (error) {
      console.error("Error:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
