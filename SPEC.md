# GROWI Uploader 仕様書

## 1. プロジェクト概要

### 1.1 目的
ローカルファイルシステムのディレクトリ構造とMarkdownファイルを、GROWI Wikiのページ構造として一括アップロードするCLIツールです。

### 1.2 主要機能
- ローカルディレクトリ構造をGROWIのページ階層として保持
- Markdownファイルの内容をGROWIページとして作成
- 添付ファイルの自動検出とアップロード
- 既存ページの更新対応

## 2. 技術仕様

### 2.1 使用技術
- **言語**: TypeScript (ESNext, NodeNext module)
- **ランタイム**: Node.js
- **APIクライアント**: Axios (GROWI REST API v3 との通信)
- **API定義**: OpenAPI 3.0.1 (orval による型生成)
- **CLIフレームワーク**: commander.js

### 2.2 GROWI API利用
#### 使用するエンドポイント

1. **ページ作成**: `POST /_api/v3/page`
   - リクエストボディ:
     ```json
     {
       "body": "string (required) - Markdownコンテンツ",
       "path": "string (required) - ページパス (例: /AAA/BBB)"
     }
     ```
   - レスポンス:
     - 201: ページ作成成功 (page, tags, revision を含む)
     - 409: ページパスが既に存在

2. **ページ更新**: `PUT /_api/v3/page`
   - リクエストボディ:
     ```json
     {
       "body": "string (required) - Markdownコンテンツ",
       "pageId": "string (required) - ページID",
       "revisionId": "string (required) - リビジョンID"
     }
     ```

3. **ページ取得**: `GET /_api/v3/page`
   - クエリパラメータ:
     - `path`: ページパス
     - `pageId`: ページID
   - レスポンス: Page オブジェクト

4. **添付ファイルアップロード**: `POST /_api/v3/attachment`
   - リクエストボディ (multipart/form-data):
     ```
     page_id: string (required) - ページID
     file: binary (required) - ファイルデータ
     ```
   - レスポンス:
     - 200: 添付ファイル追加成功 (page, attachment, revision を含む)
     - 403: アクセス権限エラー
     - 500: サーバーエラー

### 2.3 認証方式
- **Bearer Token認証**: `Authorization: Bearer <access_token>` ヘッダー

## 3. 機能仕様

### 3.1 ディレクトリ構造からページへの変換

#### 3.1.1 基本ルール
```
ローカルファイルシステム          GROWI ページ
─────────────────────────────────────────────
AAA/BBB.md                  →   /AAA/BBB (ページ)
AAA/CCC/DDD.md              →   /AAA/CCC/DDD (ページ)
```

#### 3.1.2 ページパスの生成ルール
1. ディレクトリ名 → GROWIのページパスセグメント
2. Markdownファイル名 (拡張子 `.md` を除く) → ページ名
3. ルートからの相対パスを `/` 区切りのページパスに変換
4. GROWIのページパスは `/` で開始する
5. ページパスの正規化（APIエラー回避のため）:
   - スラッシュ前後のスペースをアンダースコアに置換
     - 例: `a / b` → `a_/_b`
   - 特殊文字を安全な文字列に置換:
     - `+` → `-plus-`
     - `?` → `-question-`
     - `*` → `-asterisk-`
     - `$` → `-dollar-`
     - `^` → `-caret-`
   - 例: `C++ / Python?.md` → `/C-plus--plus-_/_Python-question-`

#### 3.1.3 処理対象ファイル
- **Markdownファイル**: `*.md`
- **添付ファイル**: 後述の命名規則に従うファイル

### 3.2 Markdownファイルの処理

#### 3.2.1 読み込み
- UTF-8エンコーディングで読み込み

#### 3.2.2 ページ作成フロー
1. ページパスを生成
2. 既存ページの存在確認 (`GET /_api/v3/page?path=<page_path>`)
3. 存在しない場合:
   - `POST /_api/v3/page` でページ作成
4. 既存の場合 (更新モード有効時):
   - 現在のリビジョンIDを取得
   - `PUT /_api/v3/page` でページ更新

#### 3.2.3 エラーハンドリング
- 409 (ページ既存): 設定ファイルの`update`に応じて処理 (falseの場合はスキップ)
- 403 (権限エラー): ログ記録してスキップ
- 500 (サーバーエラー): ログ記録してスキップ

### 3.3 添付ファイルの処理

#### 3.3.1 検出パターン

添付ファイルは以下の2つの方法で自動検出されます:

**パターン1: 命名規則ベース**
```
<ページ名>_attachment_<ファイル名>
```

**例:**
```
ローカルファイルシステム                     対応するGROWIページと添付先
────────────────────────────────────────────────────────────────
AAA/BBB.md                              →  /AAA/BBB ページ
AAA/BBB_attachment_image.png            →  /AAA/BBB に添付
AAA/BBB_attachment_document.pdf         →  /AAA/BBB に添付
AAA/CCC/DDD.md                          →  /AAA/CCC/DDD ページ
AAA/CCC/DDD_attachment_diagram.svg      →  /AAA/CCC/DDD に添付
```

**パターン2: リンクベース（新規）**

Markdown内のリンク（画像・ファイル）から自動検出します。

**例:**
```
ローカルファイルシステム                     Markdown内のリンク
────────────────────────────────────────────────────────────────
AAA/BBB.md
  内容: ![Logo](./images/logo.png)     →  images/logo.png を添付ファイルとして検出
AAA/images/logo.png                     →  /AAA/BBB に添付
```

#### 3.3.2 リンクベース検出の詳細

**対象となるリンク形式:**
```markdown
![alt](./path/to/file.png)       # 画像（相対パス）
![alt](path/to/file.png)         # 画像（相対パス、./なし）
![alt](/images/logo.png)         # 画像（絶対パス、source-dir起点）
[text](./path/to/file.pdf)       # リンク（相対パス）
[text](path/to/file.pdf)         # リンク（相対パス、./なし）
[text](/docs/manual.pdf)         # リンク（絶対パス、source-dir起点）

# HTMLのimgタグにも対応
<img src="./images/logo.png" alt="Logo">         # imgタグ（ダブルクォート）
<img src='./images/logo.png' alt='Logo'>         # imgタグ（シングルクォート）

# URLエンコード（パーセントエンコーディング）にも対応
![画像](./images/%E7%94%BB%E5%83%8F.png)          # 日本語ファイル名（URLエンコード済み）
[file](./docs/my%20file.pdf)                     # スペースを含むファイル名
[file](<./path/to/file (1).png>)                 # 特殊文字を含む（angle brackets使用）
![image](./path/to/file\\(1\\).png)              # 特殊文字を含む（エスケープ使用）
```

**パスの解決:**
- Markdownエスケープシーケンスを解除（`\(` → `(`）
- URLエンコード（パーセントエンコーディング）をデコード（`%20` → スペース、`%E7%94%BB%E5%83%8F` → `画像`）
- 相対パス（`./` または `../` で始まる、または何も付かない）: Markdownファイルのディレクトリからの相対パス
- 絶対パス（`/` で始まる）: 処理対象フォルダ（source-dir）を起点とした絶対パス
  - 例: `/images/logo.png` → `<source-dir>/images/logo.png`
- デコード後のパスでファイルの存在を確認

**除外されるリンク:**
- `.md` ファイルへのリンク（ページリンクとして扱う）
- 外部URL（`http://`, `https://`）

**ファイル存在チェック:**
- リンクされているファイルが実際に存在する場合のみ、添付ファイルとして検出
- 存在しないファイルへのリンクは無視（エラーなし）

#### 3.3.3 重複検出の処理

同じファイルが命名規則パターンとリンクパターンの両方で検出された場合:

1. **1つの添付ファイルとして扱う**（重複アップロードしない）
2. **両方のリンク形式を記録**（置換時に両方のパターンを使用）

**例:**
```
ファイル構成:
  guide.md
  guide_attachment_diagram.png

guide.md の内容:
  ![図](guide_attachment_diagram.png)   ← このリンクがある

検出結果:
  - 命名規則パターンで検出: guide_attachment_diagram.png
  - リンクパターンでも検出: guide_attachment_diagram.png
  → 1つの添付ファイルとしてマージされる
```

#### 3.3.4 処理フロー

1. **Markdownファイルごとに添付ファイルを検出**
   - 命名規則パターン: ディレクトリスキャンで `*_attachment_*` を検索
   - リンクパターン: Markdown内容を解析してリンクを抽出
2. **重複を除去してマージ**
   - 同じファイルパスを持つものは1つにまとめる
3. **該当ページのIDを取得**
4. **`POST /_api/v3/attachment` で添付ファイルをアップロード**
5. **multipart/form-data でバイナリデータを送信**

#### 3.3.5 エラーハンドリングと処理ルール

- **ページが作成または更新された場合**: 添付ファイルをアップロード
  - アップロード失敗: エラーログ、処理は継続
- **ページがスキップまたはエラーの場合**: 添付ファイルもスキップ
  - スキップログを出力
  - 重複チェックは行わず、GROWIのAPI側の処理に任せる

### 3.4 添付ファイルリンクの自動置換

#### 3.4.1 機能概要
Markdown内の添付ファイルへのリンクを自動的にGROWI形式に置換します。
これにより、ローカルでプレビューできるMarkdownがGROWI上でも正しく表示されます。

命名規則パターンとリンクパターンの両方に対応し、それぞれのリンク形式を適切に置換します。

#### 3.4.2 対応するリンク形式

**パターン1: 命名規則ベース**

ファイル名のみ、または相対パス形式:
```markdown
![画像](guide_attachment_image.png)
![画像](./guide_attachment_image.png)
[ファイル](guide_attachment_document.pdf)
[ファイル](./guide_attachment_document.pdf)
```

**パターン2: リンクベース**

Markdown内で実際にリンクされているパス形式:
```markdown
![Logo](./images/logo.png)
![Logo](images/logo.png)
[ドキュメント](./docs/manual.pdf)
[ドキュメント](docs/manual.pdf)
```

**パターン3: HTMLのimgタグ**

HTMLのimgタグ形式:
```markdown
<img src="./images/logo.png" alt="Logo">
<img src='./images/logo.png' alt='Logo'>
```

リンクベースおよびimgタグで検出された添付ファイルは、元のリンクパスがそのまま置換対象になります。

#### 3.4.3 置換後の形式

GROWI上では `/attachment/{attachment_id}` 形式に変換されます:

```markdown
![画像](/attachment/68f3a41c794f665ad2c0d322)
[ファイル](/attachment/68f3a3fa794f665ad2c0d2b3)
<img src="/attachment/68f3a41c794f665ad2c0d322" alt="Logo">
```

#### 3.4.4 処理フロー

1. **ページを作成/更新**（オリジナルのMarkdown）
   - ページIDとリビジョンIDを取得
2. **添付ファイルをアップロード**（ページIDを使用）
   - 各添付ファイルのAttachment IDを取得
3. **Markdown内のリンクを検索・置換**
   - `<ページ名>_attachment_<ファイル名>` パターンのリンクを検出
   - `/attachment/{attachment_id}` 形式に置換
4. **リンクが置換された場合のみ、ページを再度更新**
   - 置換後のMarkdownでページを更新
   - 新しいリビジョンを作成

#### 3.4.5 具体例

**例1: 命名規則パターン**

**ローカルファイル構成:**
```
sample/
  guide.md
  guide_attachment_diagram.png
  guide_attachment_document.pdf
```

**guide.md の内容（アップロード前）:**
```markdown
# User Guide

![図](./guide_attachment_diagram.png)
詳細は [資料](guide_attachment_document.pdf) を参照してください。
```

**GROWI上での結果（アップロード後）:**
```markdown
# User Guide

![図](/attachment/68f3a41c794f665ad2c0d322)
詳細は [資料](/attachment/68f3a3fa794f665ad2c0d2b3) を参照してください。
```

**例2: リンクパターン**

**ローカルファイル構成:**
```
sample/
  guide.md
  images/
    logo.png
    screenshot.png
```

**guide.md の内容（アップロード前）:**
```markdown
# User Guide

![Logo](./images/logo.png)
![Screenshot](images/screenshot.png)
```

**GROWI上での結果（アップロード後）:**
```markdown
# User Guide

![Logo](/attachment/68f3a41c794f665ad2c0d322)
![Screenshot](/attachment/68f3a3fa794f665ad2c0d2b3)
```

**例3: 混在パターン**

命名規則とリンクベースが混在している場合でも、すべて正しく置換されます:

```markdown
# アップロード前
![図1](guide_attachment_diagram.png)   # 命名規則パターン
![図2](./images/photo.jpg)             # リンクパターン

# アップロード後
![図1](/attachment/xxx)
![図2](/attachment/yyy)
```

#### 3.4.6 注意事項

- 検出された添付ファイルへのリンクのみが置換対象
- 外部URL（`http://`, `https://`）は置換されません
- リンク置換に失敗してもエラーとはせず、警告ログを出力して処理を継続
- リンクが1つも置換されなかった場合は、ページの再更新は行われません

### 3.5 ページリンクの自動補正

#### 3.5.1 機能概要
Markdown内の他のページへのリンク（`.md` 拡張子付き）を自動的にGROWI形式に補正します。
これにより、ローカルでプレビューできるMarkdownがGROWI上でも正しくページ遷移します。

#### 3.5.2 対応するリンク形式

以下のパターンに対応:

**パターン1: 相対パス（拡張子あり）**
```markdown
[ユーザーガイド](./guide.md)
[API概要](../api/overview.md)
```

**パターン2: ファイル名のみ（拡張子あり）**
```markdown
[ガイド](guide.md)
```

**パターン3: アンカー付きリンク**
```markdown
[概要セクション](./guide.md#overview)
[認証について](../api/overview.md#authentication)
```

#### 3.5.3 置換後の形式

GROWI上では `.md` 拡張子が除去されます:

```markdown
# 置換前（ローカル）
[ユーザーガイド](./guide.md)
[API概要](../api/overview.md#authentication)

# 置換後（GROWI）
[ユーザーガイド](./guide)
[API概要](../api/overview#authentication)
```

GROWIは相対パスリンクをサポートしているため、相対パス部分（`./`、`../`）はそのまま保持されます。

#### 3.5.4 除外されるパターン

外部URLへのリンクは置換対象外です:

```markdown
# 置換されない（外部URL）
[GitHub](https://github.com/user/repo/README.md)
[ドキュメント](https://example.com/doc/guide.md)
```

#### 3.5.5 処理フロー

1. **添付ファイルリンクの置換後**、最新のMarkdownコンテンツを取得
2. **`.md` 拡張子を含むリンクを検索**
   - 外部URL（`http://`, `https://`）は除外
3. **拡張子を除去して置換**
   - アンカー部分（`#section`）は保持
4. **リンクが置換された場合のみ、ページを再度更新**

#### 3.5.6 具体例

**ローカルファイル構成:**
```
docs/
  guide.md
  api/
    overview.md
    authentication.md
```

**guide.md の内容（アップロード前）:**
```markdown
# ユーザーガイド

詳細は [API概要](./api/overview.md) を参照してください。

認証方法については [認証ガイド](./api/authentication.md#setup) をご覧ください。
```

**GROWI上での結果（アップロード後）:**
```markdown
# ユーザーガイド

詳細は [API概要](./api/overview) を参照してください。

認証方法については [認証ガイド](./api/authentication#setup) をご覧ください。
```

#### 3.5.7 注意事項

- ページリンクの補正は、添付ファイルリンクの置換の後に実行されます
- リンク先のページが存在するかどうかのチェックは行いません
- リンクが1つも置換されなかった場合は、ページの再更新は行われません
- 外部URLへのリンク（`http://`, `https://` で始まる）は変更されません

## 4. コマンドラインインターフェース

### 4.1 基本コマンド
```bash
growi-uploader <source-dir> [options]
```

### 4.2 必須パラメータ
- `<source-dir>`: アップロード元のローカルディレクトリパス

### 4.3 オプション

- `--config <path>`, `-c <path>`: 設定ファイルのパス (デフォルト: カレントディレクトリの `growi-uploader.json`)
- `--verbose`, `-v`: 詳細なエラー出力を有効化 (スタックトレース、レスポンス内容などを表示)

### 4.4 設定ファイル (必須)
`growi-uploader.json` (JSON形式)
```json
{
  "url": "https://wiki.example.com",
  "token": "your-access-token",
  "basePath": "/",
  "update": false,
  "verbose": false
}
```

**必須項目:**
- `url`: GROWI インスタンスのURL
- `token`: GROWI APIアクセストークン

**オプション項目:**
- `basePath`: GROWIでのベースパス (デフォルト: `/`)
  - 例: `"/imported"` → すべてのページが `/imported` 配下に作成される
- `update`: 既存ページを更新するかどうか (デフォルト: `false`)
  - `true`: 既存ページを更新
  - `false`: 既存ページをスキップ
- `verbose`: 詳細なエラー出力を有効化するかどうか (デフォルト: `false`)
  - `true`: エラー発生時にHTTPステータス、レスポンス内容、スタックトレースなどの詳細情報を出力
  - `false`: 簡潔なエラーメッセージのみ表示
  - コマンドラインオプション `--verbose` で設定ファイルの値を上書き可能

設定ファイルが見つからない場合はエラーで終了します。

## 5. 実装の考慮事項

### 5.1 ページの重複チェック

#### 5.1.1 チェック方法
1. アップロード前にページパスでGET APIを呼び出し
2. 404エラー: ページ未存在 → 新規作成
3. 200レスポンス: ページ存在 → 設定ファイルの`update`に応じて処理

#### 5.1.2 更新判定
- `update: true` の場合:
  - リビジョンIDを含めてPUT APIを呼び出し、ページを更新
- `update: false` の場合:
  - 既存ページをスキップし、ログを出力

### 5.2 バッチ処理とエラーハンドリング

#### 5.2.1 処理順序
1. **ディレクトリスキャン**
   - すべてのMarkdownファイルをリストアップ
   - 各Markdownファイルに対応する添付ファイルを検出

2. **ページ処理**
   - Markdownファイルを階層順に処理 (親ページ → 子ページ)
   - 各Markdownファイルごとに:
     1. ページを作成/更新
     2. そのページの添付ファイルを順次アップロード

#### 5.2.2 エラーハンドリング
- 各ページ/ファイルの処理結果を記録
- エラー発生時も処理を継続 (fail-fast しない)
- 基本的にリトライは行わない
- エラーはログに記録し、次のページに進む

### 5.3 ログ出力

#### 5.3.1 処理ログ
各ファイルの処理結果を1行ずつ標準出力に表示します。

**ログ形式:**
```
[<STATUS>] <ローカルパス> → <GROWIページパス>
```

**ステータスの種類:**
- `SUCCESS`: ページ作成/更新成功
- `SKIP`: 既存ページで`update: false`の場合
- `ERROR`: エラー発生時 (エラー内容も表示)

**出力例:**
```
[SUCCESS] docs/guide.md → /docs/guide (created)
[SUCCESS] docs/api/overview.md → /docs/api/overview (updated)
[SKIP] docs/api/auth.md → /docs/api/auth (page already exists)
[SKIP] docs/api/auth_attachment_flow.svg → /docs/api/auth (attachment skipped)
[ERROR] docs/bad.md → /docs/bad (403 Forbidden)
[SKIP] docs/bad_attachment_file.txt → /docs/bad (attachment skipped)
[SUCCESS] docs/api/overview_attachment_diagram.png → /docs/api/overview (attachment)
[ERROR] docs/api/overview_attachment_large.png → /docs/api/overview (413 File too large)
```

#### 5.3.2 処理サマリー
処理終了時に統計情報を表示:
```
Completed:
- Pages created: 50
- Pages updated: 10
- Pages skipped: 3
- Page errors: 1
- Attachments uploaded: 25
- Attachments skipped: 5
- Attachment errors: 2
- Link replacement errors: 0
```

## 6. ファイル命名規則とマッピング

### 6.1 ページパスとファイルパスのマッピング

#### 6.1.1 通常のファイル
```
ローカルパス                      GROWIページパス
───────────────────────────────────────────────────
docs/guide.md                 →  /docs/guide
docs/api/overview.md          →  /docs/api/overview
```

#### 6.1.2 ベースパス指定時
設定ファイルで `"basePath": "/imported"` を指定した場合:
```
ローカルパス                      GROWIページパス
─────────────────────────────────────────────────────────
docs/guide.md                 →  /imported/docs/guide
docs/api/overview.md          →  /imported/docs/api/overview
```

### 6.2 添付ファイルの識別

#### 6.2.1 命名パターン
```
<ページ名>_attachment_<ファイル名>
```

#### 6.2.2 複雑な例
```
ディレクトリ構造:
docs/
  api/
    overview.md
    overview_attachment_diagram.png
    overview_attachment_sample.json
    authentication.md
    authentication_attachment_flow.svg

結果:
- /docs/api/overview ページに diagram.png と sample.json が添付
- /docs/api/authentication ページに flow.svg が添付
```

## 7. 参考資料

- GROWI REST API v3: https://docs.growi.org/en/api/rest-v3.html
- GROWI公式ドキュメント: https://docs.growi.org/
- OpenAPI定義: `growi-openapi.json` (プロジェクト内)
