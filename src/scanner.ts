import { glob } from "glob";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface MarkdownFile {
  localPath: string;
  growiPath: string;
  content: string;
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

  return mdFiles.map((file) => {
    const fullPath = join(sourceDir, file);
    const content = readFileSync(fullPath, "utf-8");

    // Convert file path to GROWI page path
    // Example: docs/guide.md → /docs/guide
    const pathWithoutExt = file.replace(/\.md$/, "");
    const growiPath = join(basePath, pathWithoutExt).replace(/\\/g, "/");

    return {
      localPath: file,
      growiPath: growiPath.startsWith("/") ? growiPath : `/${growiPath}`,
      content,
    };
  });
};
