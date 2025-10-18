import { glob } from "glob";
import { readFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";

export interface MarkdownFile {
  localPath: string;
  growiPath: string;
  content: string;
  attachments: AttachmentFile[];
}

export interface AttachmentFile {
  localPath: string;
  fileName: string;
}

export const scanMarkdownFiles = async (
  sourceDir: string,
  basePath: string = "/",
): Promise<MarkdownFile[]> => {
  // Find all .md files
  const mdFiles = await glob("**/*.md", {
    cwd: sourceDir,
    absolute: false,
    // Sort files to ensure consistent processing order
  });

  // Sort to process in alphabetical order (ensures parent pages before child pages)
  mdFiles.sort();

  const results = await Promise.all(
    mdFiles.map(async (file) => {
      const fullPath = join(sourceDir, file);
      const content = readFileSync(fullPath, "utf-8");

      // Convert file path to GROWI page path
      // Example: docs/guide.md → /docs/guide
      const pathWithoutExt = file.replace(/\.md$/, "");
      const growiPath = join(basePath, pathWithoutExt).replace(/\\/g, "/");

      // Find attachments for this markdown file
      // Pattern: <page-name>_attachment_<filename>
      const dir = dirname(file);
      const pageName = basename(file, ".md");
      const attachmentPattern =
        dir === "."
          ? `${pageName}_attachment_*`
          : `${dir}/${pageName}_attachment_*`;

      const attachmentFiles = await glob(attachmentPattern, {
        cwd: sourceDir,
        absolute: false,
      });

      const attachments = attachmentFiles.map((attachFile) => ({
        localPath: attachFile,
        fileName: basename(attachFile).replace(`${pageName}_attachment_`, ""),
      }));

      return {
        localPath: file,
        growiPath: growiPath.startsWith("/") ? growiPath : `/${growiPath}`,
        content,
        attachments,
      };
    }),
  );

  return results;
};
