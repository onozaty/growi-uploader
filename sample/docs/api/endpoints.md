# API Endpoints

Overview of GROWI REST API endpoints used by the uploader.

## Page Creation

```
POST /_api/v3/page
```

Creates a new page with the specified path and content.

### Request Body

```json
{
  "path": "/example/page",
  "body": "Page content in Markdown"
}
```

## Response

Returns the created page object with metadata.
