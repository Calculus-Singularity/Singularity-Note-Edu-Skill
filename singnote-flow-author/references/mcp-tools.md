# SingNote Creator MCP

Use Creator MCP when the user provides a SingNote site URL and a `snmcp_...` token.

## Connection

- Endpoint: `<site>/api/mcp`
- Method: `POST`
- Header: `Authorization: Bearer snmcp_...`
- Header: `Content-Type: application/json`
- Protocol: JSON-RPC 2.0 MCP tools

Never store or print the token except when the user explicitly asks for the exact command they can run locally.

## Tool Order

1. `get_canvas_flow_schema`
2. `export_canvas_flow` when modifying an existing canvas
3. `upload_asset` for each binary resource
4. `validate_canvas_flow`
5. `import_canvas_flow_draft`

Do not call `import_canvas_flow_draft` while diagnostics exist.

## Tools

### get_canvas_flow_schema

Arguments: none.

Returns:

- `schema`: JSON Schema string.
- `format`: authoring guide string.

Use this before generating non-trivial course graphs because the live schema is the source of truth.

### validate_canvas_flow

Arguments:

```json
{ "flow": { "schema": "singnote.flow.v1", "nodes": {}, "edges": [] } }
```

Returns:

- `ok`
- `diagnostics`
- `summary`

Treat every diagnostic as blocking. Fix JSON, then revalidate.

### export_canvas_flow

Arguments: none.

Returns the current bound course-version canvas as Flow JSON. Use this before editing existing courses so unrelated nodes and edges are preserved.

### upload_asset

Arguments:

```json
{
  "file_name": "lesson.pdf",
  "mime_type": "application/pdf",
  "base64": "..."
}
```

Returns:

- `asset_key`
- `url`
- `thumbnail_url`
- `file_name`
- `mime_type`

Use returned `asset_key` in `video.asset_key` or `material.asset_key`. Do not embed base64 in Flow JSON nodes.

### import_canvas_flow_draft

Arguments:

```json
{ "flow": { "schema": "singnote.flow.v1", "nodes": {}, "edges": [] } }
```

Behavior:

- Revalidates Flow JSON.
- Replaces the token-bound draft canvas.
- Does not publish the course.
- Cannot write other course versions.

## JSON-RPC Example

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "validate_canvas_flow",
    "arguments": {
      "flow": {
        "schema": "singnote.flow.v1",
        "nodes": {
          "start": { "type": "start", "title": "开始" }
        },
        "edges": []
      }
    }
  }
}
```
