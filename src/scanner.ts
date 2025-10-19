import { glob } from "glob";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname, basename, resolve, relative } from "node:path";

export interface MarkdownFile {
  localPath: string;
  growiPath: string;
  content: string;
  attachments: AttachmentFile[];
}

export interface AttachmentFile {
  localPath: string;
  fileName: string;
  attachmentId?: string; // Set after upload
  detectionPattern: "naming" | "link"; // How this attachment was detected
  originalLinkPaths?: string[]; // Original link paths in markdown (for link pattern)
}

/**
 * Extract attachment files from markdown links
 *
 * Scans markdown content for image and link references, resolves their paths,
 * and returns those that exist as files (excluding .md files and external URLs).
 *
 * @param content Markdown content
 * @param markdownFilePath Path to the markdown file (relative to sourceDir)
 * @param sourceDir Source directory (absolute path)
 * @returns Array of attachment files found via links
 */
const extractLinkedAttachments = (
  content: string,
  markdownFilePath: string,
  sourceDir: string,
): AttachmentFile[] => {
  const attachments: AttachmentFile[] = [];

  // Match markdown links: ![alt](path) or [text](path)
  // Exclude external URLs (http://, https://)
  const linkRegex = /!?\[([^\]]*)\]\(([^)]+)\)/g;

  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const linkPath = match[2];

    // Skip if linkPath is undefined
    if (!linkPath) {
      continue;
    }

    // Skip external URLs
    if (linkPath.startsWith("http://") || linkPath.startsWith("https://")) {
      continue;
    }

    // Skip .md files (these are page links, not attachments)
    if (linkPath.endsWith(".md")) {
      continue;
    }

    // Skip absolute paths (we only handle relative paths)
    if (linkPath.startsWith("/")) {
      continue;
    }

    // Resolve relative path
    const markdownDir = dirname(join(sourceDir, markdownFilePath));
    const absolutePath = resolve(markdownDir, linkPath);

    // Check if file exists
    if (!existsSync(absolutePath)) {
      continue;
    }

    // Convert back to path relative to sourceDir
    const relativePath = relative(sourceDir, absolutePath);

    // Normalize path separators to forward slashes
    const normalizedPath = relativePath.replace(/\\/g, "/");

    attachments.push({
      localPath: normalizedPath,
      fileName: basename(normalizedPath),
      detectionPattern: "link",
      originalLinkPaths: [linkPath],
    });
  }

  return attachments;
};

/**
 * Merge attachments from naming pattern and link pattern, removing duplicates
 *
 * If the same file is detected by both patterns, it will be kept as a single
 * attachment with merged originalLinkPaths.
 *
 * @param namingAttachments Attachments detected by naming pattern
 * @param linkAttachments Attachments detected by link pattern
 * @returns Merged array with duplicates removed
 */
const mergeAttachments = (
  namingAttachments: AttachmentFile[],
  linkAttachments: AttachmentFile[],
): AttachmentFile[] => {
  const map = new Map<string, AttachmentFile>();

  // Add naming pattern attachments first
  for (const att of namingAttachments) {
    map.set(att.localPath, att);
  }

  // Add link pattern attachments (merge if duplicate)
  for (const att of linkAttachments) {
    const existing = map.get(att.localPath);
    if (existing) {
      // Duplicate: merge originalLinkPaths
      if (!existing.originalLinkPaths) {
        existing.originalLinkPaths = [];
      }
      if (att.originalLinkPaths) {
        existing.originalLinkPaths.push(...att.originalLinkPaths);
      }
    } else {
      // New attachment
      map.set(att.localPath, att);
    }
  }

  return Array.from(map.values());
};

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

  // Filter out attachment files (files matching *_attachment_*.md pattern)
  const pageFiles = mdFiles.filter(
    (file) => !basename(file).includes("_attachment_"),
  );

  // Sort to process in alphabetical order (ensures parent pages before child pages)
  pageFiles.sort();

  const results = await Promise.all(
    pageFiles.map(async (file) => {
      const fullPath = join(sourceDir, file);
      const content = readFileSync(fullPath, "utf-8");

      // Convert file path to GROWI page path
      // Example: docs/guide.md → /docs/guide
      const pathWithoutExt = file.replace(/\.md$/, "");
      const growiPath = join(basePath, pathWithoutExt).replace(/\\/g, "/");

      // Find attachments for this markdown file using both patterns

      // Pattern 1: Naming convention - <page-name>_attachment_<filename>
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

      const namingAttachments: AttachmentFile[] = attachmentFiles.map(
        (attachFile) => ({
          localPath: attachFile,
          fileName: basename(attachFile).replace(`${pageName}_attachment_`, ""),
          detectionPattern: "naming" as const,
        }),
      );

      // Pattern 2: Link-based - extract from markdown links
      const linkAttachments = extractLinkedAttachments(
        content,
        file,
        sourceDir,
      );

      // Merge both patterns and remove duplicates
      const attachments = mergeAttachments(namingAttachments, linkAttachments);

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
