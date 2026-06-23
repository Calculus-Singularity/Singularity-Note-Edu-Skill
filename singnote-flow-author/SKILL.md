---
name: singnote-flow-author
description: Create, validate, export, and import SingNote education course canvas flows using singnote.flow.v1 JSON and the Creator MCP endpoint. Use when asked to generate a SingNote course graph, write or edit Flow JSON, upload assets for a SingNote canvas, validate course flow diagrams, or import generated content through SingNote Creator MCP.
---

# SingNote Flow Author

## Workflow

Use this sequence when an MCP endpoint and `snmcp_...` bearer token are available:

1. Read `references/mcp-tools.md`.
2. Call `get_canvas_flow_schema` before generating or editing non-trivial flows.
3. Create or update a `singnote.flow.v1` JSON document.
4. Call `validate_canvas_flow` and treat diagnostics as blocking.
5. Upload binary resources with `upload_asset`, then reference returned `asset_key` in the Flow JSON.
6. Call `import_canvas_flow_draft` only after validation succeeds.

Use this sequence when working offline:

1. Read `references/flow-format.md`.
2. Check details against `references/canvas-flow-v1.schema.json`.
3. Use `examples/python-intro.json` as the shape reference.
4. Run `node scripts/check-flow.mjs <flow.json>` before handing off the JSON.

## Rules

- Always set `"schema": "singnote.flow.v1"`.
- Do not publish courses; MCP import only replaces the bound draft canvas.
- Do not inline large files or base64 payloads in nodes. Upload assets first and store `asset_key`.
- Keep split-card slots one layer deep. Slot children must not participate in learning-path edges.
- Use `membership` only as `exercise -> exercise_set`.
- Use `video_pause` only as `exercise/exercise_set -> video`, with `at` as seconds or `mm:ss`.
- Use `required` and `recommended` only for learning-path edges between presentable top-level nodes.
- Preserve Markdown in course body, exercise prompts, choices, explanations, and programming problem prompts.

## References

- `references/flow-format.md`: compact authoring format and semantic rules.
- `references/mcp-tools.md`: MCP connection and tool contract.
- `references/canvas-flow-v1.schema.json`: bundled JSON Schema.
- `examples/python-intro.json`: valid example course flow.
- `scripts/check-flow.mjs`: offline validation helper.
