import { describe, expect, it } from "vitest";
import type { AttachmentFile } from "./scanner";
import { replaceAttachmentLinks, replaceMarkdownExtension } from "./markdown";

describe("replaceAttachmentLinks", () => {
  describe("naming pattern", () => {
    it("should replace filename only link", () => {
      const markdown = "![image](guide_attachment_image.png)";
      const attachments: AttachmentFile[] = [
        {
          localPath: "guide_attachment_image.png",
          fileName: "image.png",
          attachmentId: "abc123",
          detectionPattern: "naming",
        },
      ];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe("![image](/attachment/abc123)");
      expect(result.replaced).toBe(true);
    });

    it("should replace relative path link with ./", () => {
      const markdown = "![image](./guide_attachment_image.png)";
      const attachments: AttachmentFile[] = [
        {
          localPath: "guide_attachment_image.png",
          fileName: "image.png",
          attachmentId: "abc123",
          detectionPattern: "naming",
        },
      ];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe("![image](/attachment/abc123)");
      expect(result.replaced).toBe(true);
    });

    it("should replace both image and link references", () => {
      const markdown =
        "![img](guide_attachment_file.pdf)\n[Download](guide_attachment_file.pdf)";
      const attachments: AttachmentFile[] = [
        {
          localPath: "guide_attachment_file.pdf",
          fileName: "file.pdf",
          attachmentId: "def456",
          detectionPattern: "naming",
        },
      ];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe(
        "![img](/attachment/def456)\n[Download](/attachment/def456)",
      );
      expect(result.replaced).toBe(true);
    });
  });

  describe("link pattern", () => {
    it("should replace link pattern with ./ prefix", () => {
      const markdown = "![logo](./images/logo.png)";
      const attachments: AttachmentFile[] = [
        {
          localPath: "images/logo.png",
          fileName: "logo.png",
          attachmentId: "ghi789",
          detectionPattern: "link",
          originalLinkPaths: ["./images/logo.png"],
        },
      ];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe("![logo](/attachment/ghi789)");
      expect(result.replaced).toBe(true);
    });

    it("should replace link pattern without ./ prefix", () => {
      const markdown = "![logo](images/logo.png)";
      const attachments: AttachmentFile[] = [
        {
          localPath: "images/logo.png",
          fileName: "logo.png",
          attachmentId: "ghi789",
          detectionPattern: "link",
          originalLinkPaths: ["./images/logo.png"],
        },
      ];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe("![logo](/attachment/ghi789)");
      expect(result.replaced).toBe(true);
    });

    it("should handle originalLinkPaths with both ./ and without", () => {
      const markdown = "![logo1](./images/logo.png)\n![logo2](images/logo.png)";
      const attachments: AttachmentFile[] = [
        {
          localPath: "images/logo.png",
          fileName: "logo.png",
          attachmentId: "ghi789",
          detectionPattern: "link",
          originalLinkPaths: ["./images/logo.png"],
        },
      ];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe(
        "![logo1](/attachment/ghi789)\n![logo2](/attachment/ghi789)",
      );
      expect(result.replaced).toBe(true);
    });
  });

  describe("mixed patterns", () => {
    it("should replace both naming and link patterns", () => {
      const markdown =
        "![diagram](guide_attachment_diagram.png)\n![logo](./images/logo.png)";
      const attachments: AttachmentFile[] = [
        {
          localPath: "guide_attachment_diagram.png",
          fileName: "diagram.png",
          attachmentId: "abc123",
          detectionPattern: "naming",
        },
        {
          localPath: "images/logo.png",
          fileName: "logo.png",
          attachmentId: "def456",
          detectionPattern: "link",
          originalLinkPaths: ["./images/logo.png"],
        },
      ];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe(
        "![diagram](/attachment/abc123)\n![logo](/attachment/def456)",
      );
      expect(result.replaced).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should not replace when attachment has no ID", () => {
      const markdown = "![image](guide_attachment_image.png)";
      const attachments: AttachmentFile[] = [
        {
          localPath: "guide_attachment_image.png",
          fileName: "image.png",
          detectionPattern: "naming",
        },
      ];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe(markdown);
      expect(result.replaced).toBe(false);
    });

    it("should return replaced: false when no match", () => {
      const markdown = "![other](other.png)";
      const attachments: AttachmentFile[] = [
        {
          localPath: "guide_attachment_image.png",
          fileName: "image.png",
          attachmentId: "abc123",
          detectionPattern: "naming",
        },
      ];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe(markdown);
      expect(result.replaced).toBe(false);
    });

    it("should handle special characters in filenames", () => {
      const markdown = "![special](guide_attachment_file(1).png)";
      const attachments: AttachmentFile[] = [
        {
          localPath: "guide_attachment_file(1).png",
          fileName: "file(1).png",
          attachmentId: "abc123",
          detectionPattern: "naming",
        },
      ];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe("![special](/attachment/abc123)");
      expect(result.replaced).toBe(true);
    });

    it("should replace multiple occurrences of the same link", () => {
      const markdown =
        "![img1](guide_attachment_image.png) and ![img2](guide_attachment_image.png)";
      const attachments: AttachmentFile[] = [
        {
          localPath: "guide_attachment_image.png",
          fileName: "image.png",
          attachmentId: "abc123",
          detectionPattern: "naming",
        },
      ];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe(
        "![img1](/attachment/abc123) and ![img2](/attachment/abc123)",
      );
      expect(result.replaced).toBe(true);
    });

    it("should handle empty markdown", () => {
      const markdown = "";
      const attachments: AttachmentFile[] = [
        {
          localPath: "guide_attachment_image.png",
          fileName: "image.png",
          attachmentId: "abc123",
          detectionPattern: "naming",
        },
      ];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe("");
      expect(result.replaced).toBe(false);
    });

    it("should handle empty attachments array", () => {
      const markdown = "![image](guide_attachment_image.png)";
      const attachments: AttachmentFile[] = [];
      const result = replaceAttachmentLinks(markdown, attachments, "guide");
      expect(result.content).toBe(markdown);
      expect(result.replaced).toBe(false);
    });
  });
});

describe("replaceMarkdownExtension", () => {
  describe("basic replacement", () => {
    it("should remove .md extension from relative path with ./", () => {
      const markdown = "[Guide](./guide.md)";
      const result = replaceMarkdownExtension(markdown);
      expect(result.content).toBe("[Guide](./guide)");
      expect(result.replaced).toBe(true);
    });

    it("should remove .md extension from filename only", () => {
      const markdown = "[Guide](guide.md)";
      const result = replaceMarkdownExtension(markdown);
      expect(result.content).toBe("[Guide](guide)");
      expect(result.replaced).toBe(true);
    });

    it("should preserve anchors", () => {
      const markdown = "[Section](./guide.md#intro)";
      const result = replaceMarkdownExtension(markdown);
      expect(result.content).toBe("[Section](./guide#intro)");
      expect(result.replaced).toBe(true);
    });

    it("should handle relative paths with ../", () => {
      const markdown = "[Parent](../parent.md)";
      const result = replaceMarkdownExtension(markdown);
      expect(result.content).toBe("[Parent](../parent)");
      expect(result.replaced).toBe(true);
    });
  });

  describe("external URLs", () => {
    it("should not replace external URLs with http://", () => {
      const markdown = "[External](http://example.com/guide.md)";
      const result = replaceMarkdownExtension(markdown);
      expect(result.content).toBe(markdown);
      expect(result.replaced).toBe(false);
    });

    it("should not replace external URLs with https://", () => {
      const markdown = "[GitHub](https://github.com/user/repo/README.md)";
      const result = replaceMarkdownExtension(markdown);
      expect(result.content).toBe(markdown);
      expect(result.replaced).toBe(false);
    });
  });

  describe("multiple links", () => {
    it("should handle multiple links", () => {
      const markdown = "[A](./a.md) and [B](b.md)";
      const result = replaceMarkdownExtension(markdown);
      expect(result.content).toBe("[A](./a) and [B](b)");
      expect(result.replaced).toBe(true);
    });

    it("should replace only internal links in mixed content", () => {
      const markdown =
        "[A](./a.md) and [B](b.md) but not [C](https://example.com/c.md)";
      const result = replaceMarkdownExtension(markdown);
      expect(result.content).toBe(
        "[A](./a) and [B](b) but not [C](https://example.com/c.md)",
      );
      expect(result.replaced).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should return replaced: false when no .md links", () => {
      const markdown = "[Guide](./guide)";
      const result = replaceMarkdownExtension(markdown);
      expect(result.content).toBe(markdown);
      expect(result.replaced).toBe(false);
    });

    it("should handle empty markdown", () => {
      const markdown = "";
      const result = replaceMarkdownExtension(markdown);
      expect(result.content).toBe("");
      expect(result.replaced).toBe(false);
    });

    it("should handle markdown with no links", () => {
      const markdown = "# Title\n\nSome text without links.";
      const result = replaceMarkdownExtension(markdown);
      expect(result.content).toBe(markdown);
      expect(result.replaced).toBe(false);
    });

    it("should handle complex anchors", () => {
      const markdown = "[Complex](./guide.md#section-with-dashes)";
      const result = replaceMarkdownExtension(markdown);
      expect(result.content).toBe("[Complex](./guide#section-with-dashes)");
      expect(result.replaced).toBe(true);
    });
  });
});
