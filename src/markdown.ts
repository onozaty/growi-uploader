import type { AttachmentFile } from "./scanner";

/**
 * Replace attachment links in Markdown content with GROWI format
 *
 * Supports two detection patterns:
 * 1. Naming pattern: guide_attachment_file.png, ./guide_attachment_file.png
 * 2. Link pattern: ./images/photo.jpg, images/photo.jpg (as found in markdown)
 *
 * @param markdown Original Markdown content
 * @param attachments List of attachments with their IDs
 * @param pageName Page name (without .md extension)
 * @returns Object with replaced content and whether any replacement occurred
 */
export const replaceAttachmentLinks = (
  markdown: string,
  attachments: AttachmentFile[],
  pageName: string,
): { content: string; replaced: boolean } => {
  let result = markdown;
  let replaced = false;

  for (const attachment of attachments) {
    if (!attachment.attachmentId) continue;

    const growiPath = `/attachment/${attachment.attachmentId}`;
    const patterns: string[] = [];

    // Pattern 1: Naming convention (guide_attachment_file.png)
    if (attachment.detectionPattern === "naming") {
      const localFileName = `${pageName}_attachment_${attachment.fileName}`;
      const escapedFileName = localFileName.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
      );

      patterns.push(
        escapedFileName, // guide_attachment_file.png
        `\\./${escapedFileName}`, // ./guide_attachment_file.png
      );
    }

    // Pattern 2: Link-based (./images/photo.jpg)
    if (
      attachment.detectionPattern === "link" &&
      attachment.originalLinkPaths
    ) {
      for (const linkPath of attachment.originalLinkPaths) {
        // Escape special regex chars including angle brackets
        const escapedPath = linkPath.replace(/[.*+?^${}()|[\]\\<>]/g, "\\$&");
        patterns.push(escapedPath);

        // Also add variations: ./path <-> path
        if (linkPath.startsWith("./")) {
          // Add version without ./
          const withoutDot = linkPath.substring(2);
          const escapedWithoutDot = withoutDot.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&",
          );
          patterns.push(escapedWithoutDot);
        } else if (!linkPath.startsWith("../")) {
          // Add version with ./
          patterns.push(`\\./${escapedPath}`);
        }
      }
    }

    // Replace all patterns
    for (const pattern of patterns) {
      // Image link: ![...](pattern) → ![...](/attachment/id)
      const imgRegex = new RegExp(`!\\[([^\\]]*)\\]\\(${pattern}\\)`, "g");
      if (imgRegex.test(result)) {
        replaced = true;
        result = result.replace(imgRegex, `![$1](${growiPath})`);
      }

      // Regular link: [...](pattern) → [...](/attachment/id)
      // Note: Negative lookbehind to exclude image links (with !)
      const linkRegex = new RegExp(
        `(?<!!)\\[([^\\]]*)\\]\\(${pattern}\\)`,
        "g",
      );
      if (linkRegex.test(result)) {
        replaced = true;
        result = result.replace(linkRegex, `[$1](${growiPath})`);
      }
    }
  }

  return { content: result, replaced };
};

/**
 * Replace .md extension in page links with GROWI format
 *
 * Converts Markdown page links to GROWI-compatible format by removing .md extension.
 * External URLs (http://, https://) are excluded from replacement.
 *
 * Supported patterns:
 * - Relative path: [text](./page.md) → [text](./page)
 * - Filename only: [text](page.md) → [text](page)
 * - With anchor: [text](./page.md#section) → [text](./page#section)
 *
 * @param markdown Original Markdown content
 * @returns Object with replaced content and whether any replacement occurred
 */
export const replaceMarkdownExtension = (
  markdown: string,
): { content: string; replaced: boolean } => {
  // Match markdown links ending with .md (with optional anchor)
  // Pattern: [text](path.md) or [text](path.md#anchor)
  // Exclude external URLs starting with http:// or https://
  const regex = /(\[[^\]]*\]\((?!https?:\/\/)[^)]*?)\.md((?:#[^)]*)?\))/g;
  const result = markdown.replace(regex, "$1$2");

  return {
    content: result,
    replaced: result !== markdown,
  };
};
