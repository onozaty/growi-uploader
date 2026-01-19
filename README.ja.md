# growi-uploader

[![Test](https://github.com/onozaty/growi-uploader/actions/workflows/test.yaml/badge.svg)](https://github.com/onozaty/growi-uploader/actions/workflows/test.yaml)
[![codecov](https://codecov.io/gh/onozaty/growi-uploader/graph/badge.svg?token=X0YN1OP5PB)](https://codecov.io/gh/onozaty/growi-uploader)
[![npm version](https://badge.fury.io/js/@onozaty%2Fgrowi-uploader.svg)](https://www.npmjs.com/package/@onozaty/growi-uploader)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](README.md) | 日本語

ローカルのMarkdownファイルと添付ファイルを[GROWI](https://growi.org/) Wikiに一括アップロードするCLIツールです。

## 機能

- 📁 **ディレクトリ構造の維持** - ローカルのフォルダ階層がGROWIのページ階層になります
- 📝 **Markdownファイルのアップロード** - `.md`ファイルからGROWIページを作成・更新
- 📎 **添付ファイルの自動検出** - `<ページ名>_attachment_<ファイル名>`パターンのファイルを自動的に添付ファイルとしてアップロード
- 🔗 **リンクの自動置換** - ローカルの添付ファイルへのリンクをGROWI形式(`/attachment/{id}`)に自動変換
- 🖼️ **画像の埋め込み** - 画像リンク(`![alt](image.png)`)を自動変換
- ⚙️ **柔軟な設定** - ベースパス、更新動作などを制御可能

## クイックスタート

1. 設定ファイル`growi-uploader.json`を作成:

```json
{
  "url": "https://your-growi-instance.com",
  "token": "your-api-token",
  "basePath": "/",
  "update": false
}
```

2. npxで実行(インストール不要):

```bash
npx @onozaty/growi-uploader ./docs
```

これだけです！ローカルの`./docs`ディレクトリがGROWIにアップロードされます。

## インストール

### npxを使用(推奨)

インストール不要で実行できます:

```bash
npx @onozaty/growi-uploader <source-dir>
```

### グローバルインストール

頻繁に使用する場合は、グローバルインストールできます:

```bash
npm install -g @onozaty/growi-uploader
growi-uploader <source-dir>
```

## 使い方

### 基本コマンド

```bash
growi-uploader <source-dir> [options]
```

**引数:**
- `<source-dir>`: Markdownファイルを含むディレクトリのパス

**オプション:**
- `-c, --config <path>`: 設定ファイルのパス(デフォルト: `growi-uploader.json`)
- `-v, --verbose`: 詳細なエラー出力を有効化
- `-V, --version`: バージョン番号を表示
- `-h, --help`: ヘルプ情報を表示

### 実行例

```bash
# Upload with default config file
npx @onozaty/growi-uploader ./docs

# Upload with custom config file
npx @onozaty/growi-uploader ./docs -c my-config.json

# Upload with verbose error output
npx @onozaty/growi-uploader ./docs --verbose
```

## ディレクトリ構造の例

### ローカルディレクトリ

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

### アップロード後のGROWIページ

```
/docs/guide                    (from guide.md)
  └─ diagram.svg               (attachment)
  └─ sample.txt                (attachment)
/docs/api/overview             (from api/overview.md)
  └─ example.json              (attachment)
/docs/api/authentication       (from api/authentication.md)
```

## ページ名の正規化

APIエラーを防ぐため、ページ名は以下のルールで自動的に正規化されます:

### 正規化ルール

1. **スラッシュ前後のスペース** → アンダースコアに置換
   - `a / b.md` → `/a_/_b`

2. **特殊文字** → 安全な文字列に置換:
   - `+` → `-plus-`
   - `?` → `-question-`
   - `*` → `-asterisk-`
   - `$` → `-dollar-`
   - `^` → `-caret-`
   - `%` → `-percent-`

3. **予約済みページ名** → アンダースコアを末尾に追加:
   - `edit` → `edit_` (パスの最後のセグメントの場合のみ)

### 例

```
Local file                     GROWI page path
──────────────────────────────────────────────────
C++.md                      →  /C-plus--plus-
What?.md                    →  /What-question-
C++ / Python?.md            →  /C-plus--plus-_/_Python-question-
edit.md                     →  /edit_
docs/edit.md                →  /docs/edit_
docs/normal-page.md         →  /docs/normal-page (no change)
```

この正規化により、GROWIのページ名要件との互換性を確保しつつ、ファイル名の可読性を維持します。

## 設定ファイル

プロジェクトルートに`growi-uploader.json`ファイルを作成:

```json
{
  "url": "https://your-growi-instance.com",
  "token": "your-api-token",
  "basePath": "/imported",
  "update": true,
  "verbose": false
}
```

### 設定オプション

| オプション | 型 | 必須 | デフォルト | 説明 |
|--------|------|----------|---------|-------------|
| `url` | string | ✅ | - | GROWIインスタンスのURL |
| `token` | string | ✅ | - | GROWI APIアクセストークン |
| `basePath` | string | ❌ | `/` | インポートされるページのベースパス |
| `update` | boolean | ❌ | `false` | trueの場合は既存ページを更新、falseの場合はスキップ |
| `verbose` | boolean | ❌ | `false` | 詳細なエラー出力を有効化 |

### APIトークンの取得方法

1. GROWIインスタンスにログイン
2. **ユーザー設定** → **API設定** に移動
3. **新しいトークンを発行** をクリック
4. 生成されたトークンを設定ファイルにコピー

## 添付ファイル

添付ファイルは2つの方法で自動検出されます:

### 方法1: 命名規則

以下の命名パターンに従うファイルが添付ファイルとして検出されます:

```
<ページ名>_attachment_<ファイル名>
```

**例:**
```
guide.md                       → GROWI page: /guide
guide_attachment_image.png     → Attached to /guide
guide_attachment_document.pdf  → Attached to /guide
```

### 方法2: リンクベースの検出

Markdownリンクで参照されているファイルが自動的に添付ファイルとして検出されます:

**ローカルディレクトリ:**
```
guide.md
assets/
  banner.png
images/
  logo.png
  screenshot.png
```

**guide.mdの内容:**
```markdown
![Logo](./images/logo.png)
![Screenshot](images/screenshot.png)
![Banner](/assets/banner.png)
```

参照されているすべてのファイル(`logo.png`、`screenshot.png`、`banner.png`)は、`_attachment_`命名規則に従っていなくても、`/guide`ページに添付ファイルとしてアップロードされます。

**パスの解決:**
- Markdownエスケープシーケンスは解除されます(`\(` → `(`)
- URLエンコーディング(パーセントエンコーディング)はデコードされます(`%20` → スペース、`%E7%94%BB%E5%83%8F` → `画像`)
- 相対パス(`./`、`../`、またはプレフィックスなし): Markdownファイルのディレクトリからの相対パス
- 絶対パス(`/`で始まる): ソースディレクトリのルートからの絶対パス
  - 例: `/assets/banner.png` → `<source-dir>/assets/banner.png`

**サポートされるリンク形式:**
```markdown
![Logo](./images/logo.png)                # Standard relative path
![Logo](images/logo.png)                  # Relative path without ./
![Image](./images/%E7%94%BB%E5%83%8F.png) # URL-encoded Japanese filename
[File](./docs/my%20file.pdf)              # URL-encoded space
[File](<./path/file (1).png>)             # Special chars with angle brackets
![Image](./path/file\\(1\\).png)          # Special chars with escaping
<img src="./images/logo.png" alt="Logo">  # HTML img tag (double quotes)
<img src='./images/logo.png' alt='Logo'>  # HTML img tag (single quotes)
```

**検出から除外されるもの:**
- `.md`ファイル(ページリンクとして扱われます)
- 外部URL(`http://`、`https://`)
- 存在しないファイル

### リンクの自動置換

添付ファイルへのMarkdownリンクは自動的にGROWI形式(`/attachment/{id}`)に変換されます。

**例(命名規則):**

```markdown
# Before upload
![Diagram](./guide_attachment_diagram.png)
Download the [documentation](guide_attachment_document.pdf).

# After upload (on GROWI)
![Diagram](/attachment/68f3a41c794f665ad2c0d322)
Download the [documentation](/attachment/68f3a3fa794f665ad2c0d2b3).
```

**例(リンクベース):**

```markdown
# Before upload
![Logo](./images/logo.png)

# After upload (on GROWI)
![Logo](/attachment/68f3a41c794f665ad2c0d322)
```

両方の検出方法で、複数のリンク形式(`./`あり・なし)がサポートされています。

## 高度な使い方

### 既存ページの更新

設定ファイルで`update: true`を設定すると、既存ページを更新できます:

```json
{
  "url": "https://your-growi-instance.com",
  "token": "your-api-token",
  "update": true
}
```

### 特定のパスへのインポート

`basePath`を使用して、すべてのページを特定のパス配下にインポートできます:

```json
{
  "url": "https://your-growi-instance.com",
  "token": "your-api-token",
  "basePath": "/imported"
}
```

**結果:**
```
docs/guide.md  →  /imported/docs/guide
```

### 出力例

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
- Link replacement errors: 0
```

## 必要環境

- Node.js 18以降
- REST API v3をサポートするGROWIインスタンス

## ライセンス

MIT

## 作者

[onozaty](https://github.com/onozaty)
