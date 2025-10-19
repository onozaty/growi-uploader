# User Guide

This is a sample guide page for GROWI uploader testing.

## Overview

This page demonstrates how the uploader works with a simple Markdown file.

## Diagram

Below is a sample diagram image:

![Sample Diagram](guide_attachment_diagram.svg)

You can also use relative path:

![Sample Diagram](./guide_attachment_diagram.svg)

## Attachments

Below are examples of attachment links in different formats:

### Pattern 1: Filename only
Download the sample file: [sample.txt](guide_attachment_sample.txt)

### Pattern 2: Relative path with ./
You can also access it with relative path: [sample.txt](./guide_attachment_sample.txt)

## Link-based Attachments

Images and files in subdirectories are automatically detected and uploaded as attachments:

![Logo](./images/logo.svg)

You can also use paths without `./`:

![Screenshot](images/screenshot.svg)

These files will be uploaded as attachments even though they don't follow the `_attachment_` naming convention. The links will be automatically converted to GROWI's `/attachment/{id}` format.

## Page Links

You can link to other pages using relative paths. The `.md` extension will be automatically removed on GROWI:

- [Getting Started Guide](./getting-started.md)
- [Getting Started (filename only)](getting-started.md)

You can also use anchor links:

- [Getting Started - Installation](./getting-started.md#installation)

External URLs with `.md` extension are NOT converted (they remain unchanged):

- [GitHub README](https://github.com/onozaty/growi-uploader/blob/main/README.md)
- [External Documentation](http://example.com/docs/guide.md)

## Features

- Easy to use
- Supports hierarchical structure
- Markdown formatting
- Attachment link replacement (supports multiple path formats)
- Image embedding with automatic link conversion
- Page link conversion (`.md` extension auto-removal)
