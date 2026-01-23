import type { AttachmentFile } from "./scanner";

/**
 * Escape special regex characters for safe use in RegExp
 * Escapes: . * + ? ^ $ { } ( ) | [ ] \ < >
 * Reference: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#escaping
 */
const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\<>]/g, "\\$&");
};

/**
 * Build regex patterns from originalLinkPaths
 * Generates escaped patterns including variations (./path <-> path)
 */
const buildPatternsFromLinkPaths = (linkPaths: string[]): string[] => {
  const patterns: string[] = [];

  for (const linkPath of linkPaths) {
    const escapedPath = escapeRegex(linkPath);
    patterns.push(escapedPath);

    // Also add variations: ./path <-> path
    if (linkPath.startsWith("./")) {
      // Add version without ./
      const withoutDot = linkPath.substring(2);
      const escapedWithoutDot = escapeRegex(withoutDot);
      patterns.push(escapedWithoutDot);
    } else if (!linkPath.startsWith("../") && !linkPath.startsWith("<")) {
      // Add version with ./
      patterns.push(`\\./${escapedPath}`);
    }
  }

  return patterns;
};

/**
 * Replace links in markdown content matching the given patterns with a target path
 * Handles image links, regular links, and HTML img tags
 *
 * @param markdown Markdown content
 * @param patterns Array of escaped regex patterns to match
 * @param targetPath Path to replace with (e.g., /attachment/xxx)
 * @returns Object with replaced content and whether any replacement occurred
 */
const replaceLinksWithPatterns = (
  markdown: string,
  patterns: string[],
  targetPath: string,
): { content: string; replaced: boolean } => {
  let result = markdown;
  let replaced = false;

  for (const pattern of patterns) {
    // Image link: ![...](pattern) → ![...](/attachment/id)
    // Supports escaped brackets in alt text: !\[\[Label\]...\](pattern)
    const imgRegex = new RegExp(
      `!\\[((?:[^\\]\\\\]|\\\\.)*)\\]\\(${pattern}\\)`,
      "g",
    );
    if (imgRegex.test(result)) {
      replaced = true;
      result = result.replace(imgRegex, `![$1](${targetPath})`);
    }

    // Regular link: [...](pattern) → [...](/attachment/id)
    // Note: Negative lookbehind to exclude image links (with !)
    // Supports escaped brackets in link text: \[\[Label\]...\](pattern)
    const linkRegex = new RegExp(
      `(?<!!)\\[((?:[^\\]\\\\]|\\\\.)*)\\]\\(${pattern}\\)`,
      "g",
    );
    if (linkRegex.test(result)) {
      replaced = true;
      result = result.replace(linkRegex, `[$1](${targetPath})`);
    }

    // HTML img tag: <img src="pattern" ...> → <img src="/attachment/id" ...>
    // Supports both single and double quotes
    const imgTagRegex = new RegExp(
      `(<img\\s+[^>]*src=)(["'])${pattern}\\2([^>]*>)`,
      "gi",
    );
    if (imgTagRegex.test(result)) {
      replaced = true;
      result = result.replace(imgTagRegex, `$1$2${targetPath}$2$3`);
    }
  }

  return { content: result, replaced };
};

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

    // Pattern 1: Naming convention - add default patterns for non-linked files
    if (attachment.detectionPattern === "naming") {
      const localFileName = `${pageName}_attachment_${attachment.fileName}`;
      const escapedFileName = escapeRegex(localFileName);

      // Add default patterns (for backward compatibility and non-linked files)
      patterns.push(
        escapedFileName, // guide_attachment_file.png
        `\\./${escapedFileName}`, // ./guide_attachment_file.png
      );
    }

    // Pattern 2: originalLinkPaths - for both naming and link patterns
    if (attachment.originalLinkPaths) {
      patterns.push(...buildPatternsFromLinkPaths(attachment.originalLinkPaths));
    }

    // Replace all patterns
    const { content: replacedContent, replaced: wasReplaced } =
      replaceLinksWithPatterns(result, patterns, growiPath);
    if (wasReplaced) {
      result = replacedContent;
      replaced = true;
    }
  }

  return { content: result, replaced };
};

/**
 * Replace external attachment links in Markdown content with GROWI format
 *
 * External attachments are files that belong to another page (detected via naming convention).
 * This function resolves them using a global attachment map that contains all uploaded attachments.
 *
 * @param markdown Original Markdown content
 * @param attachments List of external attachments (isExternalReference === true)
 * @param attachmentMap Global map of localPath → attachmentId
 * @returns Object with replaced content and whether any replacement occurred
 */
export const replaceExternalAttachmentLinks = (
  markdown: string,
  attachments: AttachmentFile[],
  attachmentMap: Map<string, string>,
): { content: string; replaced: boolean } => {
  let result = markdown;
  let replaced = false;

  for (const attachment of attachments) {
    // Skip if not an external reference
    if (!attachment.isExternalReference) continue;

    // Look up attachmentId from global map
    const attachmentId = attachmentMap.get(attachment.localPath);
    if (!attachmentId) continue;

    const growiPath = `/attachment/${attachmentId}`;

    // Build patterns from originalLinkPaths
    const patterns = attachment.originalLinkPaths
      ? buildPatternsFromLinkPaths(attachment.originalLinkPaths)
      : [];

    // Replace all patterns
    const { content: replacedContent, replaced: wasReplaced } =
      replaceLinksWithPatterns(result, patterns, growiPath);
    if (wasReplaced) {
      result = replacedContent;
      replaced = true;
    }
  }

  return { content: result, replaced };
};

/**
 * Replace .md extension in page links with GROWI format
 *
 * Converts Markdown page links to GROWI-compatible format by removing .md extension.
 * For absolute paths (starting with /), prepends basePath to the link.
 * External URLs (http://, https://) are excluded from replacement.
 *
 * Supported patterns:
 * - Relative path: [text](./page.md) → [text](./page)
 * - Filename only: [text](page.md) → [text](page)
 * - Absolute path: [text](/docs/page.md) → [text](/basePath/docs/page)
 * - With anchor: [text](./page.md#section) → [text](./page#section)
 *
 * @param markdown Original Markdown content
 * @param basePath Base path for GROWI pages (default: "/")
 * @returns Object with replaced content and whether any replacement occurred
 */
export const replaceMarkdownExtension = (
  markdown: string,
  basePath: string = "/",
): { content: string; replaced: boolean } => {
  // Match markdown links ending with .md extension
  // Pattern breakdown:
  // - (\[[^\]]*\]\(                   Group 1: [link text](
  // - (?!https?:\/\/)                 Negative lookahead: not http:// or https://
  // - ([^)]*?)                        Group 2: Path (non-greedy, anything except ))
  // - \.md                            The .md extension to remove
  // - ((?:#[^)]*)?\))                 Group 3: optional anchor + closing )
  // Example: [text](./page.md#anchor) → [text](./page#anchor)
  const regex = /(\[[^\]]*\]\((?!https?:\/\/))([^)]*?)\.md((?:#[^)]*)?\))/g;

  const result = markdown.replace(regex, (match, prefix, path, suffix) => {
    // If path starts with /, prepend basePath (unless basePath is just "/")
    if (path.startsWith("/") && basePath !== "/") {
      // Ensure basePath doesn't end with / to avoid double slashes
      const normalizedBasePath = basePath.endsWith("/")
        ? basePath.slice(0, -1)
        : basePath;
      return `${prefix}${normalizedBasePath}${path}${suffix}`;
    }
    // Otherwise, just remove .md extension
    return `${prefix}${path}${suffix}`;
  });

  return {
    content: result,
    replaced: result !== markdown,
  };
};
