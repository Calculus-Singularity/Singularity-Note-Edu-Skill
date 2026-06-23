# SingNote Flow JSON v1

Use `singnote.flow.v1` to author SingNote course canvases for AI tools and scripts. It is an authoring format, not the database save payload.

## Minimal Shape

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

## Nodes

Node ids must start with an ASCII letter and contain only letters, digits, `_`, and `-`.

Supported node types:

- `start`
- `markdown`
- `video`
- `material`
- `exercise`
- `exercise_set`
- `programming_problem`
- `coding_workspace`
- `split_card`
- `peer_review`

Use Markdown in `body`, exercise prompts, choices, explanations, and programming problem prompts.

`exercise` nodes must include `exercise`. Supported exercise types:

- `single_choice`
- `multiple_choice`
- `true_false`
- `fill_blank`

`programming_problem` nodes must include `problem`. Use Python for v1 unless the live schema says otherwise.

`split_card` uses `slots.left` and `slots.right` to reference two ordinary child nodes. Do not nest split cards. Do not connect slot children with learning-path edges.

## Edges

Supported edge types:

- `required`: required learning path
- `recommended`: skippable learning path
- `membership`: exercise belongs to exercise set; must be `exercise -> exercise_set`
- `video_pause`: pause video for exercise or exercise set; must be `exercise/exercise_set -> video`
- `peer_review_reference`: review target; must be `exercise/programming_problem -> peer_review`

`video_pause.at` may be seconds or a timecode:

```json
{ "from": "quiz1", "to": "video1", "type": "video_pause", "at": "01:20" }
```

## Validation Checklist

- Every edge endpoint exists.
- Learning-path edges do not touch split-card slot children.
- Learning-path edges do not form cycles.
- Split-card slots are present, distinct, and one layer deep.
- Exercises have valid prompts and answers.
- Programming problems have starter code and test cases.
- Assets are referenced by `asset_key` after upload; binary payloads are not embedded.
