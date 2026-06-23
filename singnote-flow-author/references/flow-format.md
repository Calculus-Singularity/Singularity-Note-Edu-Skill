# SingNote Flow JSON v1

Use `singnote.flow.v1` to author SingNote course canvases for AI tools, scripts, and MCP import. This is an authoring format. It is not the database save payload.

## Contents

- Root object
- Common node fields
- Node classes
- Exercise object
- Programming problem object
- Asset objects
- Edge classes
- Authoring rules
- Minimal example

## Root Object

Design goal: describe a whole course canvas as stable ids, presentable blocks, and typed connections. The importer can then map it onto internal canvas nodes and edges.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `schema` | string | yes | Must be `singnote.flow.v1`. |
| `nodes` | object | yes | Map of node id to node object. Node ids must be stable, readable, and unique. |
| `edges` | array | yes | Typed connections between existing node ids. |

Node id rule: ids must start with an ASCII letter and contain only letters, digits, `_`, and `-`. Prefer semantic ids such as `intro_variables`, `quiz_assignment`, `split_read_then_code`.

## Common Node Fields

Design goal: keep every block addressable in the canvas and readable in creator/student surfaces.

| Field | Type | Required | Applies to | Notes |
| --- | --- | --- | --- | --- |
| `type` | string | yes | all nodes | One of the node classes below. |
| `title` | string | yes | all nodes | Short UI label. Do not leave as generic "New node". |
| `description` | string | no | all nodes | Short creator-facing note. Not a replacement for content. |
| `body` | Markdown string | type-dependent | markdown, material, exercise_set, peer_review | Main readable content. |
| `position` | `{ "x": number, "y": number }` | no | all nodes | Optional initial canvas placement. Importers may relayout. |
| `estimated_minutes` | integer >= 0 | no | presentable learning nodes | Student workload estimate. |

Markdown is allowed in `body`, exercise prompts, choices, explanations, programming problem prompts, feedback, and peer-review instructions.

## Node Classes

### `start`

Design goal: mark the root of the learning path. A valid canvas should have exactly one start node and it should have at least one outgoing learning edge.

Parameters:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `type` | `"start"` | yes | Fixed. |
| `title` | string | yes | Usually `开始`. |

Rules:

- Do not connect edges into `start`.
- Do not use `start` as a split-card slot child.

### `markdown`

Design goal: present lesson text, images already represented by Markdown links, explanations, or any ordinary rich-text lesson block.

Parameters:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `type` | `"markdown"` | yes | Fixed. |
| `title` | string | yes | Student-visible block title. |
| `body` | Markdown string | yes | Main lesson content. |

### `video`

Design goal: represent one uploaded or externally hosted video. Interactive inserts point to the video using `video_pause` edges.

Parameters:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `type` | `"video"` | yes | Fixed. |
| `title` | string | yes | Student-visible block title. |
| `body` | Markdown string | no | Optional notes shown around the video. |
| `video.url` | string | optional | External URL when already available. Prefer platform asset URLs when imported through MCP. |
| `video.asset_key` | string | optional | Returned by asset upload. Preferred for uploaded videos. |
| `video.duration_seconds` | integer >= 0 | optional | Metadata only. Do not use this to crop uploaded video. |
| `video.thumbnail_url` | string | optional | Existing thumbnail URL. |
| `video.thumbnail_asset_key` | string | optional | Uploaded thumbnail asset key. |

Rules:

- Put pause time on `video_pause.at`, not by cutting the video node.
- Do not create `video -> exercise` pause edges. Pause edges are always `exercise/exercise_set -> video`.

### `material`

Design goal: represent a readable resource card such as PDF, DOC, DOCX, slides, or a converted preview.

Parameters:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `type` | `"material"` | yes | Fixed. |
| `title` | string | yes | Resource title. |
| `body` | Markdown string | no | Optional instructions or summary. |
| `material.asset_key` | string | optional | Returned by asset upload. Preferred for local files. |
| `material.file_name` | string | optional | Original file name. |
| `material.mime_type` | string | optional | Example: `application/pdf`. |
| `material.original_url` | string | optional | External source URL. |
| `material.preview_url` | string | optional | Converted/preview URL if already available. |
| `material.conversion_status` | enum | optional | `none`, `pending`, `processing`, `ready`, or `failed`. |

Rules:

- Do not embed binary files or base64.
- Upload first through MCP when a file is local, then store the returned `asset_key`.

### `exercise`

Design goal: represent one auto-gradable non-code question as an independent canvas element. It may stand alone, appear in a learning path, belong to an exercise set, or be inserted into a video.

Parameters:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `type` | `"exercise"` | yes | Fixed. |
| `title` | string | yes | Short question label. |
| `exercise` | object | yes | See Exercise object. |

Rules:

- An exercise is not forced to belong to an exercise set.
- Use `membership` only when it should be grouped into a set.
- Use `video_pause` to insert it into a video.
- Do not model manual scoring or essay questions in v1.

### `exercise_set`

Design goal: group independent exercise nodes into a student-facing set while preserving each exercise as its own canvas element.

Parameters:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `type` | `"exercise_set"` | yes | Fixed. |
| `title` | string | yes | Set title. |
| `body` | Markdown string | no | Intro/instructions for the set. |

Rules:

- Add exercises with `membership` edges from `exercise -> exercise_set`.
- An exercise set can participate in learning-path edges.
- A set can be inserted into a video with `exercise_set -> video` `video_pause`.

### `programming_problem`

Design goal: represent one Python OJ-style programming problem. This is separate from `exercise` because it needs source code, tests, checker behavior, and runner limits.

Parameters:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `type` | `"programming_problem"` | yes | Fixed. |
| `title` | string | yes | Problem title. |
| `problem` | object | yes | See Programming problem object. |

Rules:

- Use Python in v1.
- Include at least one `sample` test and at least one `hidden` test.
- Hidden tests must not expose full expected output or full feedback to students.

### `coding_workspace`

Design goal: provide a cloud coding environment as a right-side tool or standalone practice surface, without OJ submission semantics.

Parameters:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `type` | `"coding_workspace"` | yes | Fixed. |
| `title` | string | yes | Workspace label. |
| `body` | Markdown string | no | Instructions or context. |
| `workspace.language` | `"python"` | optional | Fixed to Python in v1. |
| `workspace.entry_file` | string | optional | Default `main.py` if omitted. |
| `workspace.starter_code` | string | optional | Initial editor contents. |

Rules:

- Use `programming_problem` when the block requires tests and accepted/wrong-answer feedback.
- Use `coding_workspace` when the learner only needs an IDE-like scratchpad.

### `split_card`

Design goal: present exactly two ordinary child nodes in a two-column composition. This supports "left material/question/video, right coding workspace/problem" without making those children top-level path steps.

Parameters:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `type` | `"split_card"` | yes | Fixed. |
| `title` | string | yes | Composition title. |
| `slots.left` | node id | yes | Left child node id. |
| `slots.right` | node id | yes | Right child node id. |

Rules:

- Slot children must exist and be distinct.
- Slot children cannot be `start` or `split_card`.
- Slot children cannot participate in `required` or `recommended` learning-path edges.
- Slot children can still participate in non-path semantic edges where meaningful, such as an exercise inside a slot belonging to an exercise set.
- A child should not be used as a slot child in more than one split card.
- Connect the learning path to the `split_card` large block, not to the child nodes.

### `peer_review`

Design goal: represent peer-review instructions for an exercise or programming problem. It is a reference target, not a grading engine.

Parameters:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `type` | `"peer_review"` | yes | Fixed. |
| `title` | string | yes | Review activity title. |
| `body` | Markdown string | yes | Rubric/instructions. |

Rules:

- Link the reviewed item to the review node with `peer_review_reference`.
- Do not use peer review for manual scoring in v1.

## Exercise Object

Design goal: provide compact auto-gradable questions without answer JSON blobs or manual grading.

Supported `exercise.type` values:

- `single_choice`
- `multiple_choice`
- `true_false`
- `fill_blank`

Common parameters:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `type` | enum | yes | One supported type above. |
| `prompt` | Markdown string | yes | Question stem. |
| `explanation` | Markdown string | no | Shown after answering. |
| `sort_order` | integer >= 0 | optional | Ordering inside an exercise set when needed. |

Type-specific parameters:

| Type | Required fields | Answer shape | Notes |
| --- | --- | --- | --- |
| `single_choice` | `choices`, `answer` | string array with exactly one choice key | `choices` is an object like `{ "A": "..." }`. |
| `multiple_choice` | `choices`, `answer` | string array with one or more choice keys | Every answer key must exist in `choices`. |
| `true_false` | `answer` | boolean | Do not add choices. |
| `fill_blank` | `answers` | array of accepted blank answers | Use one object per blank. |

`answers[]` for fill blank:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `blank_key` | string | optional | Stable blank id when there are multiple blanks. |
| `accepted_answer` | string | yes | Accepted answer text. |
| `match_mode` | enum | optional | `exact`, `trim`, or `case_insensitive`. Default importer behavior may vary; prefer explicit. |

## Programming Problem Object

Design goal: define Python OJ metadata precisely enough for an agent to generate runnable tests and for the platform to hide hidden-case details.

Parameters:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `prompt` | Markdown string | yes | Problem statement. Include input/output requirements. |
| `language` | `"python"` | yes | Fixed in v1. |
| `entry_file` | string | yes | Usually `main.py`. |
| `starter_code` | string | yes | Initial code. Use real newlines, not escaped text outside JSON encoding. |
| `checker` | enum | optional | `exact`, `whitespace`, or `float_tolerance`. Defaults may vary; prefer explicit. |
| `float_tolerance` | number > 0 | required when checker is `float_tolerance` | Absolute tolerance. |
| `time_limit_ms` | integer > 0 | optional | Runner time limit. |
| `memory_limit_mb` | integer > 0 | optional | Runner memory limit. |
| `explanation` | Markdown string | optional | Solution explanation. |
| `sort_order` | integer >= 0 | optional | Ordering when grouped. |
| `tests` | array | yes | At least one `sample` and one `hidden`. |

Test case parameters:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `visibility` | enum | yes | `sample` or `hidden`. |
| `input` | string | yes | Stdin payload. |
| `output` | string | yes | Expected stdout. |
| `feedback` | Markdown string | optional | Safe feedback. For hidden tests this must not reveal answer details. |
| `full_feedback` | boolean | optional | Must not be `true` for hidden tests. |

## Asset Objects

Design goal: keep binary resources out of JSON while preserving enough metadata for import and preview.

Use `asset_key` fields for files uploaded through MCP. Use URL fields only for already-hosted resources. Never put base64, file bytes, or large inline HTML in Flow JSON.

## Edge Classes

All edges use:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `from` | node id | yes | Source node id. |
| `to` | node id | yes | Target node id. |
| `type` | enum | yes | One edge class below. |

### `required`

Design goal: define the normal must-complete learning path.

Parameters: only common edge fields.

Rules:

- `from` and `to` must be presentable top-level nodes.
- Do not point into slot children.
- Do not create cycles.
- Branching is allowed.

### `recommended`

Design goal: define an optional/skippable learning path connection.

Parameters: only common edge fields.

Rules:

- Same topology rules as `required`.
- Use when the student can jump or skip without completing the source block.

### `membership`

Design goal: group an exercise into an exercise set without making the exercise set own the exercise object.

Parameters: only common edge fields.

Rules:

- Must be `exercise -> exercise_set`.
- The same exercise should not belong to multiple sets.
- This edge is not a learning path edge.

### `video_pause`

Design goal: insert an exercise or exercise set at a specific playback point in a video.

Parameters:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `at` | integer seconds or timecode string | yes | Accepts seconds, `mm:ss`, or `h:mm:ss`. In timecodes, seconds must be two digits and below 60; minutes in `h:mm:ss` must also be two digits and below 60. |

Rules:

- Must be `exercise/exercise_set -> video`.
- Never reverse it to `video -> exercise`.
- This edge is not a learning path edge.

### `peer_review_reference`

Design goal: attach peer-review instructions to something being reviewed.

Parameters: only common edge fields.

Rules:

- Must be `exercise/programming_problem -> peer_review`.
- This edge is not a learning path edge.

## Authoring Rules

- Exactly one `start` node is expected.
- Every non-slot presentable node should either be reachable from `start` through learning-path edges or be intentionally used by a semantic edge such as `membership`, `video_pause`, or `peer_review_reference`.
- Learning-path edges must not touch split-card slot children.
- A chain that flows into a split-card child is invalid because the child has no standalone presentation. Example invalid shape: `start -> B -> C` while `C` is `split_card.slots.left`.
- Keep split-card slots one layer deep.
- Keep answers structured. Do not put answer JSON strings inside Markdown.
- Validate with `scripts/check-flow.mjs` before importing.

## Minimal Example

```json
{
  "schema": "singnote.flow.v1",
  "nodes": {
    "start": { "type": "start", "title": "开始" },
    "intro": {
      "type": "markdown",
      "title": "变量是什么",
      "body": "## 变量\n变量是给值起名字。"
    }
  },
  "edges": [{ "from": "start", "to": "intro", "type": "required" }]
}
```
