# growi-uploader

[![npm version](https://badge.fury.io/js/@onozaty%2Fgrowi-uploader.svg)](https://www.npmjs.com/package/@onozaty/growi-uploader)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A CLI tool to batch upload local Markdown files and attachments to [GROWI](https://growi.org/) Wiki.

## Features

- 📁 **Preserves directory structure** - Local folder hierarchy becomes GROWI page hierarchy
- 📝 **Markdown file upload** - Creates or updates GROWI pages from `.md` files
- 📎 **Automatic attachment detection** - Files matching `<page>_attachment_<file>` pattern are uploaded as attachments
- 🔗 **Link replacement** - Automatically converts local attachment links to GROWI format (`/attachment/{id}`)
- 🖼️ **Image embedding** - Supports image links (`![alt](image.png)`) with automatic conversion
- ⚙️ **Flexible configuration** - Control base path, update behavior, and more

## Quick Start

1. Create a configuration file `growi-uploader.json`:

```json
{
  "url": "https://your-growi-instance.com",
  "token": "your-api-token",
  "basePath": "/",
  "update": false
}
```

2. Run with npx (no installation required):

```bash
npx @onozaty/growi-uploader ./docs
```

That's it! Your local `./docs` directory will be uploaded to GROWI.

## Installation

### Using npx (Recommended)

No installation required. Just run:

```bash
npx @onozaty/growi-uploader <source-dir>
```

### Global Installation

For frequent use, you can install globally:

```bash
npm install -g @onozaty/growi-uploader
growi-uploader <source-dir>
```

## Usage

### Basic Command

```bash
growi-uploader <source-dir> [options]
```

**Arguments:**
- `<source-dir>`: Path to the directory containing Markdown files

**Options:**
- `-c, --config <path>`: Path to config file (default: `growi-uploader.json`)
- `-V, --version`: Output the version number
- `-h, --help`: Display help information

### Examples

```bash
# Upload with default config file
npx @onozaty/growi-uploader ./docs

# Upload with custom config file
npx @onozaty/growi-uploader ./docs -c my-config.json
```

## Directory Structure Example

### Local Directory

```
docs/
  guide.md
  guide_attachment_diagram.svg
  guide_attachment_sample.txt
  api/
    overview.md
    overview_attachment_example.json
    authentication.md
```

### Resulting GROWI Pages

```
/docs/guide                    (from guide.md)
  └─ diagram.svg               (attachment)
  └─ sample.txt                (attachment)
/docs/api/overview             (from api/overview.md)
  └─ example.json              (attachment)
/docs/api/authentication       (from api/authentication.md)
```

## Configuration File

Create a `growi-uploader.json` file in your project root:

```json
{
  "url": "https://your-growi-instance.com",
  "token": "your-api-token",
  "basePath": "/imported",
  "update": true
}
```

### Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `url` | string | ✅ | - | GROWI instance URL |
| `token` | string | ✅ | - | GROWI API access token |
| `basePath` | string | ❌ | `/` | Base path for imported pages |
| `update` | boolean | ❌ | `false` | Update existing pages if true, skip if false |

### Getting an API Token

1. Log in to your GROWI instance
2. Go to **User Settings** → **API Settings**
3. Click **Issue new token**
4. Copy the generated token to your config file

## Attachment Files

### Naming Convention

Attachment files must follow this naming pattern:

```
<page-name>_attachment_<filename>
```

**Example:**
```
guide.md                       → GROWI page: /guide
guide_attachment_image.png     → Attached to /guide
guide_attachment_document.pdf  → Attached to /guide
```

### Automatic Link Replacement

Markdown links to attachments are automatically converted to GROWI format.

**Local Markdown (before upload):**
```markdown
# User Guide

![Diagram](./guide_attachment_diagram.png)

Download the [documentation](guide_attachment_document.pdf).
```

**GROWI Page (after upload):**
```markdown
# User Guide

![Diagram](/attachment/68f3a41c794f665ad2c0d322)

Download the [documentation](/attachment/68f3a3fa794f665ad2c0d2b3).
```

### Supported Link Formats

Both formats are automatically detected and converted:

1. **Filename only**: `![alt](guide_attachment_image.png)`
2. **Relative path**: `![alt](./guide_attachment_image.png)`

## Advanced Usage

### Update Existing Pages

Set `update: true` in your config file to update existing pages:

```json
{
  "url": "https://your-growi-instance.com",
  "token": "your-api-token",
  "update": true
}
```

### Import to Specific Path

Use `basePath` to import all pages under a specific path:

```json
{
  "url": "https://your-growi-instance.com",
  "token": "your-api-token",
  "basePath": "/imported"
}
```

**Result:**
```
docs/guide.md  →  /imported/docs/guide
```

### Output Example

```
Found 5 Markdown file(s) and 3 attachment(s)

[SUCCESS] docs/guide.md → /docs/guide (created)
[SUCCESS] docs/guide_attachment_diagram.svg → /docs/guide (attachment)
[SUCCESS] docs/guide.md → /docs/guide (attachment links replaced)
[SUCCESS] docs/api/overview.md → /docs/api/overview (created)
[SKIP] docs/api/auth.md → /docs/api/auth (page already exists)

Completed:
- Pages created: 2
- Pages updated: 0
- Pages skipped: 1
- Page errors: 0
- Attachments uploaded: 2
- Attachments skipped: 0
- Attachment errors: 0
```

## Requirements

- Node.js 18 or later
- GROWI instance with REST API v3 support

## License

MIT

## Author

[onozaty](https://github.com/onozaty)
