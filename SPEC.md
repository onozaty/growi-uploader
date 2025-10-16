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
       "path": "string (required) - ページパス (例: /AAA/BBB)",
       "grant": "number (optional) - アクセス権限",
       "grantUserGroupIds": "array (optional) - ユーザーグループID",
       "pageTags": "array (optional) - ページタグ"
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
       "revisionId": "string (required) - リビジョンID",
       "grant": "number (optional) - アクセス権限"
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

#### 3.3.1 命名規則
添付ファイルは以下の命名規則で配置:
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

#### 3.3.2 処理フロー
1. ディレクトリをスキャンし、`*_attachment_*` パターンのファイルを検出
2. ファイル名から対応するページ名を抽出
3. 該当ページのIDを取得
4. `POST /_api/v3/attachment` で添付ファイルをアップロード
5. multipart/form-data でバイナリデータを送信

#### 3.3.3 エラーハンドリング
- ページが存在しない場合: エラーログ、スキップ
- アップロード失敗: エラーログ、スキップ

## 4. コマンドラインインターフェース

### 4.1 基本コマンド
```bash
growi-uploader <source-dir> [options]
```

### 4.2 必須パラメータ
- `<source-dir>`: アップロード元のローカルディレクトリパス

### 4.3 オプション

- `--config <path>`, `-c <path>`: 設定ファイルのパス (デフォルト: カレントディレクトリの `growi-uploader.json`)

### 4.4 設定ファイル (必須)
`growi-uploader.json` (JSON形式)
```json
{
  "url": "https://wiki.example.com",
  "token": "your-access-token",
  "basePath": "/",
  "update": false
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

設定ファイルが見つからない場合はエラーで終了します。

## 5. 実装の考慮事項

### 5.1 ページの重複チェック

#### 5.1.1 チェック方法
1. アップロード前にページパスでGET APIを呼び出し
2. 404エラー: ページ未存在 → 新規作成
3. 200レスポンス: ページ存在 → 設定ファイルの`update`に応じて処理

#### 5.1.2 更新判定
- `update: true` の場合:
  - 既存ページの内容と新しい内容を比較
  - 差分がある場合のみ更新 (不要な更新を避ける)
  - リビジョンIDを含めてPUT APIを呼び出し
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
[SUCCESS] docs/guide.md → /docs/guide
[SUCCESS] docs/api/overview.md → /docs/api/overview
[SKIP] docs/api/auth.md → /docs/api/auth (page already exists)
[ERROR] docs/bad.md → /docs/bad (403 Forbidden)
[SUCCESS] docs/api/overview_attachment_diagram.png → /docs/api/overview (attachment)
```

#### 5.3.2 処理サマリー
処理終了時に統計情報を表示:
```
Completed:
- Pages created: 50
- Pages updated: 10
- Attachments uploaded: 25
- Skipped: 3
- Errors: 2
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
