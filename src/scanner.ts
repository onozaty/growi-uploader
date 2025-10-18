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
  });

  // Find all potential attachment files (*_attachment_*)
  const allFiles = await glob("**/*_attachment_*", {
    cwd: sourceDir,
    absolute: false,
  });

  return mdFiles.map((file) => {
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
    const attachmentPrefix = `${pageName}_attachment_`;

    const attachments = allFiles
      .filter((attachFile) => {
        const attachDir = dirname(attachFile);
        const attachBase = basename(attachFile);
        return attachDir === dir && attachBase.startsWith(attachmentPrefix);
      })
      .map((attachFile) => ({
        localPath: attachFile,
        fileName: basename(attachFile).replace(attachmentPrefix, ""),
      }));

    return {
      localPath: file,
      growiPath: growiPath.startsWith("/") ? growiPath : `/${growiPath}`,
      content,
      attachments,
    };
  });
};
