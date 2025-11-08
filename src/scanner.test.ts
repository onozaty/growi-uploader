import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupTempDir, createTempDir, createTestFiles } from "../test/utils";
import { scanMarkdownFiles } from "./scanner";

describe("scanMarkdownFiles", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("basic scanning", () => {
    it("should scan single markdown file without attachments", async () => {
      await createTestFiles(tempDir, {
        "README.md": "# Hello World",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "README.md",
          growiPath: "/README",
          attachments: [],
        },
      ]);
    });

    it("should scan multiple markdown files in alphabetical order", async () => {
      await createTestFiles(tempDir, {
        "zebra.md": "# Zebra",
        "alpha.md": "# Alpha",
        "beta.md": "# Beta",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "alpha.md",
          growiPath: "/alpha",
          attachments: [],
        },
        {
          localPath: "beta.md",
          growiPath: "/beta",
          attachments: [],
        },
        {
          localPath: "zebra.md",
          growiPath: "/zebra",
          attachments: [],
        },
      ]);
    });

    it("should handle subdirectories correctly", async () => {
      await createTestFiles(tempDir, {
        "docs/guide.md": "# Guide",
        "docs/api/reference.md": "# Reference",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "docs/api/reference.md",
          growiPath: "/docs/api/reference",
          attachments: [],
        },
        {
          localPath: "docs/guide.md",
          growiPath: "/docs/guide",
          attachments: [],
        },
      ]);
    });

    it("should apply basePath correctly", async () => {
      await createTestFiles(tempDir, {
        "guide.md": "# Guide",
      });

      const results = await scanMarkdownFiles(tempDir, "/docs");

      expect(results).toEqual([
        {
          localPath: "guide.md",
          growiPath: "/docs/guide",
          attachments: [],
        },
      ]);
    });

    it("should handle empty directory", async () => {
      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([]);
    });
  });

  describe("naming pattern detection", () => {
    it("should detect attachment with naming convention", async () => {
      await createTestFiles(tempDir, {
        "guide.md": "# Guide",
        "guide_attachment_image.png": "fake-image-data",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "guide.md",
          growiPath: "/guide",
          attachments: [
            {
              localPath: "guide_attachment_image.png",
              fileName: "image.png",
              detectionPattern: "naming",
            },
          ],
        },
      ]);
    });

    it("should detect multiple attachments with naming convention", async () => {
      await createTestFiles(tempDir, {
        "guide.md": "# Guide",
        "guide_attachment_image1.png": "data1",
        "guide_attachment_image2.png": "data2",
        "guide_attachment_doc.pdf": "data3",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toHaveLength(1);
      expect(results[0]!.attachments).toHaveLength(3);
      expect(results[0]!.attachments.map((a) => a.fileName).sort()).toEqual([
        "doc.pdf",
        "image1.png",
        "image2.png",
      ]);
    });

    it("should detect attachments in subdirectories with naming convention", async () => {
      await createTestFiles(tempDir, {
        "docs/guide.md": "# Guide",
        "docs/guide_attachment_image.png": "data",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "docs/guide.md",
          growiPath: "/docs/guide",
          attachments: [
            {
              localPath: "docs/guide_attachment_image.png",
              fileName: "image.png",
              detectionPattern: "naming",
            },
          ],
        },
      ]);
    });
  });

  describe("link pattern detection", () => {
    it("should detect image link attachment", async () => {
      await createTestFiles(tempDir, {
        "guide.md": "![Logo](./images/logo.png)",
        "images/logo.png": "fake-image",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "guide.md",
          growiPath: "/guide",
          attachments: [
            {
              localPath: "images/logo.png",
              fileName: "logo.png",
              detectionPattern: "link",
              originalLinkPaths: ["./images/logo.png"],
            },
          ],
        },
      ]);
    });

    it("should detect link without ./ prefix", async () => {
      await createTestFiles(tempDir, {
        "guide.md": "![Logo](images/logo.png)",
        "images/logo.png": "fake-image",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "guide.md",
          growiPath: "/guide",
          attachments: [
            {
              localPath: "images/logo.png",
              fileName: "logo.png",
              detectionPattern: "link",
              originalLinkPaths: ["images/logo.png"],
            },
          ],
        },
      ]);
    });

    it("should detect multiple links to different files", async () => {
      await createTestFiles(tempDir, {
        "guide.md": "![A](a.png)\n![B](b.png)",
        "a.png": "data-a",
        "b.png": "data-b",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toHaveLength(1);
      expect(results[0]!.attachments).toHaveLength(2);
      expect(results[0]!.attachments.map((a) => a.fileName).sort()).toEqual([
        "a.png",
        "b.png",
      ]);
    });

    it("should handle relative parent directory paths", async () => {
      await createTestFiles(tempDir, {
        "docs/guide.md": "![Logo](../images/logo.png)",
        "images/logo.png": "fake-image",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "docs/guide.md",
          growiPath: "/docs/guide",
          attachments: [
            {
              localPath: "images/logo.png",
              fileName: "logo.png",
              detectionPattern: "link",
              originalLinkPaths: ["../images/logo.png"],
            },
          ],
        },
      ]);
    });

    it("should detect both image and non-image links", async () => {
      await createTestFiles(tempDir, {
        "guide.md": "![Image](./file.png)\n[Download](./doc.pdf)",
        "file.png": "image",
        "doc.pdf": "pdf",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toHaveLength(1);
      expect(results[0]!.attachments).toHaveLength(2);
      expect(results[0]!.attachments.map((a) => a.fileName).sort()).toEqual([
        "doc.pdf",
        "file.png",
      ]);
    });

    it("should detect link with angle brackets for special chars", async () => {
      await createTestFiles(tempDir, {
        "guide.md": "![image](<./images/photo(1).png>)",
        "images/photo(1).png": "fake-image",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toHaveLength(1);
      expect(results[0]!.attachments).toHaveLength(1);
      expect(results[0]!.attachments[0]).toMatchObject({
        localPath: "images/photo(1).png",
        fileName: "photo(1).png",
        detectionPattern: "link",
        originalLinkPaths: ["<./images/photo(1).png>"],
      });
    });

    it("should detect link with escaped parentheses", async () => {
      await createTestFiles(tempDir, {
        "guide.md": "![image](./images/photo\\(1\\).png)",
        "images/photo(1).png": "fake-image",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toHaveLength(1);
      expect(results[0]!.attachments).toHaveLength(1);
      expect(results[0]!.attachments[0]).toMatchObject({
        localPath: "images/photo(1).png",
        fileName: "photo(1).png",
        detectionPattern: "link",
        originalLinkPaths: ["./images/photo\\(1\\).png"],
      });
    });

    it("should detect link with URL-encoded spaces", async () => {
      await createTestFiles(tempDir, {
        "guide.md": "![image](./images/photo%20with%20spaces.png)",
        "images/photo with spaces.png": "fake-image",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toHaveLength(1);
      expect(results[0]!.attachments).toHaveLength(1);
      expect(results[0]!.attachments[0]).toMatchObject({
        localPath: "images/photo with spaces.png",
        fileName: "photo with spaces.png",
        detectionPattern: "link",
        originalLinkPaths: ["./images/photo%20with%20spaces.png"],
      });
    });

    it("should detect link with URL-encoded Japanese characters", async () => {
      await createTestFiles(tempDir, {
        "guide.md": "![image](./images/%E7%94%BB%E5%83%8F.png)",
        "images/画像.png": "fake-image",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toHaveLength(1);
      expect(results[0]!.attachments).toHaveLength(1);
      expect(results[0]!.attachments[0]).toMatchObject({
        localPath: "images/画像.png",
        fileName: "画像.png",
        detectionPattern: "link",
        originalLinkPaths: ["./images/%E7%94%BB%E5%83%8F.png"],
      });
    });

    it("should detect link with fully URL-encoded path including parentheses", async () => {
      await createTestFiles(tempDir, {
        "guide.md": "![image](./images/my%20file%20%281%29.png)",
        "images/my file (1).png": "fake-image",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toHaveLength(1);
      expect(results[0]!.attachments).toHaveLength(1);
      expect(results[0]!.attachments[0]).toMatchObject({
        localPath: "images/my file (1).png",
        fileName: "my file (1).png",
        detectionPattern: "link",
        originalLinkPaths: ["./images/my%20file%20%281%29.png"],
      });
    });

    it("should handle malformed URL encoding gracefully", async () => {
      await createTestFiles(tempDir, {
        "guide.md": "![image](./images/bad%2.png)",
        "images/bad%2.png": "fake-image",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toHaveLength(1);
      expect(results[0]!.attachments).toHaveLength(1);
      expect(results[0]!.attachments[0]).toMatchObject({
        localPath: "images/bad%2.png",
        fileName: "bad%2.png",
        detectionPattern: "link",
        originalLinkPaths: ["./images/bad%2.png"],
      });
    });
  });

  describe("HTML img tag detection", () => {
    it("should detect img tag with double quotes", async () => {
      await createTestFiles(tempDir, {
        "guide.md": '<img src="./images/logo.png" alt="Logo">',
        "images/logo.png": "fake-image",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toHaveLength(1);
      expect(results[0]!.attachments).toHaveLength(1);
      expect(results[0]!.attachments[0]).toMatchObject({
        localPath: "images/logo.png",
        fileName: "logo.png",
        detectionPattern: "link",
        originalLinkPaths: ["./images/logo.png"],
      });
    });

    it("should detect img tag with single quotes", async () => {
      await createTestFiles(tempDir, {
        "guide.md": "<img src='./images/logo.png' alt='Logo'>",
        "images/logo.png": "fake-image",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toHaveLength(1);
      expect(results[0]!.attachments).toHaveLength(1);
      expect(results[0]!.attachments[0]).toMatchObject({
        localPath: "images/logo.png",
        fileName: "logo.png",
        detectionPattern: "link",
        originalLinkPaths: ["./images/logo.png"],
      });
    });

    it("should detect img tag with additional attributes", async () => {
      await createTestFiles(tempDir, {
        "guide.md":
          '<img class="responsive" src="./images/logo.png" alt="Logo" width="100">',
        "images/logo.png": "fake-image",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toHaveLength(1);
      expect(results[0]!.attachments).toHaveLength(1);
      expect(results[0]!.attachments[0]).toMatchObject({
        localPath: "images/logo.png",
        fileName: "logo.png",
        detectionPattern: "link",
        originalLinkPaths: ["./images/logo.png"],
      });
    });

    it("should detect img tag without ./ prefix", async () => {
      await createTestFiles(tempDir, {
        "guide.md": '<img src="images/logo.png" alt="Logo">',
        "images/logo.png": "fake-image",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toHaveLength(1);
      expect(results[0]!.attachments).toHaveLength(1);
      expect(results[0]!.attachments[0]).toMatchObject({
        localPath: "images/logo.png",
        fileName: "logo.png",
        detectionPattern: "link",
        originalLinkPaths: ["images/logo.png"],
      });
    });

    it("should detect img tag with URL-encoded path", async () => {
      await createTestFiles(tempDir, {
        "guide.md":
          '<img src="./images/photo%20with%20spaces.png" alt="Photo">',
        "images/photo with spaces.png": "fake-image",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toHaveLength(1);
      expect(results[0]!.attachments).toHaveLength(1);
      expect(results[0]!.attachments[0]).toMatchObject({
        localPath: "images/photo with spaces.png",
        fileName: "photo with spaces.png",
        detectionPattern: "link",
        originalLinkPaths: ["./images/photo%20with%20spaces.png"],
      });
    });

    it("should skip external URLs in img tags", async () => {
      await createTestFiles(tempDir, {
        "guide.md": '<img src="https://example.com/logo.png" alt="Logo">',
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toHaveLength(1);
      expect(results[0]!.attachments).toHaveLength(0);
    });

    it("should detect both markdown and HTML img tags", async () => {
      await createTestFiles(tempDir, {
        "guide.md":
          '![markdown](./images/md.png)\n<img src="./images/html.png" alt="HTML">',
        "images/md.png": "fake-md-image",
        "images/html.png": "fake-html-image",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toHaveLength(1);
      expect(results[0]!.attachments).toHaveLength(2);
      const fileNames = results[0]!.attachments.map((a) => a.fileName).sort();
      expect(fileNames).toEqual(["html.png", "md.png"]);
    });
  });

  describe("pattern merging", () => {
    it("should merge same file detected by both patterns", async () => {
      await createTestFiles(tempDir, {
        "guide.md": "![Logo](./guide_attachment_logo.png)",
        "guide_attachment_logo.png": "fake-image",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "guide.md",
          growiPath: "/guide",
          attachments: [
            {
              localPath: "guide_attachment_logo.png",
              fileName: "logo.png",
              detectionPattern: "naming",
              originalLinkPaths: ["./guide_attachment_logo.png"],
            },
          ],
        },
      ]);
    });

    it("should merge naming pattern with URL-encoded link", async () => {
      await createTestFiles(tempDir, {
        "添付.md": "[file](%E6%B7%BB%E4%BB%98_attachment_file.pdf)",
        "添付_attachment_file.pdf": "fake-pdf",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "添付.md",
          growiPath: "/添付",
          attachments: [
            {
              localPath: "添付_attachment_file.pdf",
              fileName: "file.pdf",
              detectionPattern: "naming",
              originalLinkPaths: ["%E6%B7%BB%E4%BB%98_attachment_file.pdf"],
            },
          ],
        },
      ]);
    });

    it("should keep separate entries for different files", async () => {
      await createTestFiles(tempDir, {
        "guide.md": "![Logo](./images/logo.png)",
        "guide_attachment_other.png": "other-image",
        "images/logo.png": "logo-image",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toHaveLength(1);
      expect(results[0]!.attachments).toHaveLength(2);
      expect(results[0]!.attachments.map((a) => a.fileName).sort()).toEqual([
        "logo.png",
        "other.png",
      ]);
    });
  });

  describe("exclusion patterns", () => {
    it("should exclude _attachment_ markdown files from pages", async () => {
      await createTestFiles(tempDir, {
        "guide.md": "# Guide",
        "guide_attachment_example.md": "# Example",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "guide.md",
          growiPath: "/guide",
          attachments: [
            {
              localPath: "guide_attachment_example.md",
              fileName: "example.md",
              detectionPattern: "naming",
            },
          ],
        },
      ]);
    });

    it("should exclude .md files from link detection", async () => {
      await createTestFiles(tempDir, {
        "guide.md": "[Other Page](./other.md)",
        "other.md": "# Other",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "guide.md",
          growiPath: "/guide",
          attachments: [],
        },
        {
          localPath: "other.md",
          growiPath: "/other",
          attachments: [],
        },
      ]);
    });

    it("should exclude external URLs from link detection", async () => {
      await createTestFiles(tempDir, {
        "guide.md":
          "![External](https://example.com/image.png)\n[Link](http://example.com/page)",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "guide.md",
          growiPath: "/guide",
          attachments: [],
        },
      ]);
    });

    it("should treat absolute paths as relative to source directory", async () => {
      await createTestFiles(tempDir, {
        "docs/guide.md": "![Image](/images/photo.png)",
        "images/photo.png": "data",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "docs/guide.md",
          growiPath: "/docs/guide",
          attachments: [
            {
              localPath: "images/photo.png",
              fileName: "photo.png",
              detectionPattern: "link",
              originalLinkPaths: ["/images/photo.png"],
            },
          ],
        },
      ]);
    });

    it("should ignore links to non-existent files", async () => {
      await createTestFiles(tempDir, {
        "guide.md": "![Missing](./missing.png)\n![Exists](./exists.png)",
        "exists.png": "data",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "guide.md",
          growiPath: "/guide",
          attachments: [
            {
              localPath: "exists.png",
              fileName: "exists.png",
              detectionPattern: "link",
              originalLinkPaths: ["./exists.png"],
            },
          ],
        },
      ]);
    });
  });

  describe("edge cases", () => {
    it("should handle empty markdown file", async () => {
      await createTestFiles(tempDir, {
        "empty.md": "",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "empty.md",
          growiPath: "/empty",
          attachments: [],
        },
      ]);
    });

    it("should handle markdown with no valid links", async () => {
      await createTestFiles(tempDir, {
        "guide.md": "# Title\n\nSome text without links.",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "guide.md",
          growiPath: "/guide",
          attachments: [],
        },
      ]);
    });

    it("should handle multiple links to the same file", async () => {
      await createTestFiles(tempDir, {
        "guide.md": "![Logo1](./logo.png)\n![Logo2](./logo.png)",
        "logo.png": "image",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "guide.md",
          growiPath: "/guide",
          attachments: [
            {
              localPath: "logo.png",
              fileName: "logo.png",
              detectionPattern: "link",
              originalLinkPaths: ["./logo.png", "./logo.png"],
            },
          ],
        },
      ]);
    });

    it("should handle complex directory structure", async () => {
      await createTestFiles(tempDir, {
        "README.md": "# Root",
        "docs/guide.md": "# Guide",
        "docs/api/reference.md": "# Reference",
        "docs/guide_attachment_file.pdf": "pdf-data",
        "docs/api/reference_attachment_image.png": "image-data",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toHaveLength(3);
      expect(results[0]!.growiPath).toBe("/README");
      expect(results[0]!.attachments).toHaveLength(0);
      expect(results[1]!.growiPath).toBe("/docs/api/reference");
      expect(results[1]!.attachments).toHaveLength(1);
      expect(results[2]!.growiPath).toBe("/docs/guide");
      expect(results[2]!.attachments).toHaveLength(1);
    });
  });

  describe("page path normalization", () => {
    it("should normalize spaces around slashes to underscores", async () => {
      await createTestFiles(tempDir, {
        "a / b.md": "# Content",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "a / b.md",
          growiPath: "/a_/_b",
          attachments: [],
        },
      ]);
    });

    it("should replace + with -plus-", async () => {
      await createTestFiles(tempDir, {
        "C++.md": "# Content",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "C++.md",
          growiPath: "/C-plus--plus-",
          attachments: [],
        },
      ]);
    });

    it("should replace ? with -question-", async () => {
      await createTestFiles(tempDir, {
        "What?.md": "# Content",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "What?.md",
          growiPath: "/What-question-",
          attachments: [],
        },
      ]);
    });

    it("should replace * with -asterisk-", async () => {
      await createTestFiles(tempDir, {
        "star*.md": "# Content",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "star*.md",
          growiPath: "/star-asterisk-",
          attachments: [],
        },
      ]);
    });

    it("should replace $ with -dollar-", async () => {
      await createTestFiles(tempDir, {
        "price$100.md": "# Content",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "price$100.md",
          growiPath: "/price-dollar-100",
          attachments: [],
        },
      ]);
    });

    it("should replace ^ with -caret-", async () => {
      await createTestFiles(tempDir, {
        "x^2.md": "# Content",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "x^2.md",
          growiPath: "/x-caret-2",
          attachments: [],
        },
      ]);
    });

    it("should replace % with -percent-", async () => {
      await createTestFiles(tempDir, {
        "50%.md": "# Content",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "50%.md",
          growiPath: "/50-percent-",
          attachments: [],
        },
      ]);
    });

    it("should handle multiple special characters", async () => {
      await createTestFiles(tempDir, {
        "C++ / Python?.md": "# Content",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "C++ / Python?.md",
          growiPath: "/C-plus--plus-_/_Python-question-",
          attachments: [],
        },
      ]);
    });

    it("should not modify normal page paths", async () => {
      await createTestFiles(tempDir, {
        "docs/normal-page_name.md": "# Content",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "docs/normal-page_name.md",
          growiPath: "/docs/normal-page_name",
          attachments: [],
        },
      ]);
    });

    it("should apply normalization with basePath", async () => {
      await createTestFiles(tempDir, {
        "test?.md": "# Content",
      });

      const results = await scanMarkdownFiles(tempDir, "/imported");

      expect(results).toEqual([
        {
          localPath: "test?.md",
          growiPath: "/imported/test-question-",
          attachments: [],
        },
      ]);
    });

    it("should replace reserved page name 'edit' with 'edit_'", async () => {
      await createTestFiles(tempDir, {
        "edit.md": "# Content",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "edit.md",
          growiPath: "/edit_",
          attachments: [],
        },
      ]);
    });

    it("should replace 'edit' in subdirectory", async () => {
      await createTestFiles(tempDir, {
        "docs/edit.md": "# Content",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "docs/edit.md",
          growiPath: "/docs/edit_",
          attachments: [],
        },
      ]);
    });

    it("should not replace 'edit' in the middle of page name", async () => {
      await createTestFiles(tempDir, {
        "editor.md": "# Content",
        "my-edit-page.md": "# Content",
      });

      const results = await scanMarkdownFiles(tempDir);

      expect(results).toEqual([
        {
          localPath: "editor.md",
          growiPath: "/editor",
          attachments: [],
        },
        {
          localPath: "my-edit-page.md",
          growiPath: "/my-edit-page",
          attachments: [],
        },
      ]);
    });
  });
});
