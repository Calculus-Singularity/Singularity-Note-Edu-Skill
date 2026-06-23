#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const FLOW_SCHEMA_ID = "singnote.flow.v1";
const NODE_TYPES = new Set([
  "start",
  "markdown",
  "video",
  "material",
  "exercise",
  "exercise_set",
  "programming_problem",
  "coding_workspace",
  "split_card",
  "peer_review",
]);
const EDGE_TYPES = new Set([
  "required",
  "recommended",
  "membership",
  "video_pause",
  "peer_review_reference",
]);
const LEARNING_EDGE_TYPES = new Set(["required", "recommended"]);
const EXERCISE_TYPES = new Set([
  "single_choice",
  "multiple_choice",
  "true_false",
  "fill_blank",
]);
const TEST_VISIBILITIES = new Set(["sample", "hidden"]);
const CHECKERS = new Set(["exact", "whitespace", "float_tolerance"]);
const MATCH_MODES = new Set(["exact", "trim", "case_insensitive"]);
const CONVERSION_STATUSES = new Set([
  "none",
  "pending",
  "processing",
  "ready",
  "failed",
]);
const COMMON_NODE_FIELDS = new Set([
  "type",
  "title",
  "description",
  "body",
  "position",
  "estimated_minutes",
]);
const NODE_FIELDS = {
  start: new Set([...COMMON_NODE_FIELDS]),
  markdown: new Set([...COMMON_NODE_FIELDS]),
  video: new Set([...COMMON_NODE_FIELDS, "video"]),
  material: new Set([...COMMON_NODE_FIELDS, "material"]),
  exercise: new Set([...COMMON_NODE_FIELDS, "exercise"]),
  exercise_set: new Set([...COMMON_NODE_FIELDS]),
  programming_problem: new Set([...COMMON_NODE_FIELDS, "problem"]),
  coding_workspace: new Set([...COMMON_NODE_FIELDS, "workspace"]),
  split_card: new Set([...COMMON_NODE_FIELDS, "slots"]),
  peer_review: new Set([...COMMON_NODE_FIELDS]),
};

const file = process.argv[2];

if (!file || file === "-h" || file === "--help") {
  console.log("Usage: node scripts/check-flow.mjs <file.json>");
  process.exit(file ? 0 : 2);
}

const path = resolve(process.cwd(), file);
const text = await readFile(path, "utf8");
let document;

try {
  document = JSON.parse(text);
} catch (error) {
  printDiagnostics([
    diagnostic("$", "invalid_json", "Flow JSON 格式无效", error.message),
  ]);
  process.exit(1);
}

const diagnostics = validate(document);
if (diagnostics.length > 0) {
  printDiagnostics(diagnostics);
  process.exit(1);
}

const summary = summarize(document);
console.log("Canvas Flow JSON OK");
console.log(
  [
    `nodes=${summary.nodes}`,
    `edges=${summary.edges}`,
    `exercises=${summary.exercises}`,
    `exercise_sets=${summary.exercise_sets}`,
    `programming_problems=${summary.programming_problems}`,
    `video_pauses=${summary.video_pauses}`,
    `split_cards=${summary.split_cards}`,
  ].join(" "),
);

function validate(value) {
  const diagnostics = validateStructure(value);
  if (canValidateSemantics(value)) {
    diagnostics.push(...validateSemantics(value));
  }
  return diagnostics;
}

function canValidateSemantics(value) {
  return isObject(value) && isObject(value.nodes) && Array.isArray(value.edges);
}

function validateStructure(document) {
  const diagnostics = [];
  if (!isObject(document)) {
    return [
      diagnostic("$", "invalid_document", "Flow JSON 必须是对象", "提供 JSON object"),
    ];
  }

  reportUnknownFields(
    document,
    new Set(["schema", "nodes", "edges"]),
    "$",
    diagnostics,
  );

  if (document.schema !== FLOW_SCHEMA_ID) {
    diagnostics.push(
      diagnostic(
        "$.schema",
        "invalid_schema",
        "schema 必须是 singnote.flow.v1",
        '设置为 "singnote.flow.v1"',
      ),
    );
  }
  const nodesValid = isObject(document.nodes) && Object.keys(document.nodes).length > 0;
  const edgesValid = Array.isArray(document.edges);

  if (!nodesValid) {
    diagnostics.push(
      diagnostic(
        "$.nodes",
        "missing_nodes",
        "nodes 不能为空",
        "至少提供一个 start 节点和一个内容节点",
      ),
    );
  }
  if (!edgesValid) {
    diagnostics.push(
      diagnostic("$.edges", "invalid_edges", "edges 必须是数组", "提供 edges 数组"),
    );
  }
  if (!nodesValid || !edgesValid) return diagnostics;

  Object.entries(document.nodes).forEach(([nodeId, node]) => {
    const path = `$.nodes.${nodeId}`;
    if (!isValidFlowId(nodeId)) {
      diagnostics.push(
        diagnostic(
          path,
          "invalid_node_id",
          "节点 id 不合法",
          "使用英文字母开头，只包含字母、数字、_、-",
        ),
      );
    }
    if (!isObject(node)) {
      diagnostics.push(
        diagnostic(path, "invalid_node", "节点必须是对象", "提供节点 object"),
      );
      return;
    }
    if (!NODE_TYPES.has(node.type)) {
      diagnostics.push(
        diagnostic(
          `${path}.type`,
          "invalid_node_type",
          "节点类型不支持",
          `不支持 ${node.type}`,
        ),
      );
      return;
    }
    reportUnknownFields(node, NODE_FIELDS[node.type], path, diagnostics);
    validateCommonNodeFields(node, path, diagnostics);
    if (node.type === "start") validateStartNode(node, path, diagnostics);
    if (node.type === "markdown") validateMarkdownNode(node, path, diagnostics);
    if (node.type === "video") validateVideoNode(node, path, diagnostics);
    if (node.type === "material") validateMaterialNode(node, path, diagnostics);
    if (node.type === "exercise") validateExercise(node, path, diagnostics);
    if (node.type === "programming_problem") {
      validateProgrammingProblem(node, path, diagnostics);
    }
    if (node.type === "coding_workspace") {
      validateCodingWorkspace(node, path, diagnostics);
    }
    if (node.type === "split_card") validateSplitCard(node, path, diagnostics);
    if (node.type === "peer_review") validatePeerReview(node, path, diagnostics);
  });

  document.edges.forEach((edge, index) => {
    const path = `$.edges[${index}]`;
    validateEdgeStructure(edge, path, diagnostics, document);
  });

  return diagnostics;
}

function validateCommonNodeFields(node, path, diagnostics) {
  if (!nonEmptyString(node.title)) {
    diagnostics.push(
      diagnostic(`${path}.title`, "missing_title", "节点缺少标题", "填写 title"),
    );
  }
  if (node.description !== undefined && typeof node.description !== "string") {
    diagnostics.push(
      diagnostic(
        `${path}.description`,
        "invalid_description",
        "节点 description 必须是字符串",
        "删除 description 或填写字符串",
      ),
    );
  }
  if (node.body !== undefined && typeof node.body !== "string") {
    diagnostics.push(
      diagnostic(
        `${path}.body`,
        "invalid_body",
        "节点 body 必须是 Markdown 字符串",
        "删除 body 或填写字符串",
      ),
    );
  }
  if (
    node.estimated_minutes !== undefined &&
    (!Number.isInteger(node.estimated_minutes) || node.estimated_minutes < 0)
  ) {
    diagnostics.push(
      diagnostic(
        `${path}.estimated_minutes`,
        "invalid_estimated_minutes",
        "estimated_minutes 必须是非负整数",
        "填写 0 或正整数",
      ),
    );
  }
  if (node.position !== undefined) {
    validatePosition(node.position, `${path}.position`, diagnostics);
  }
}

function validateStartNode(node, path, diagnostics) {
  if (node.body !== undefined) {
    diagnostics.push(
      diagnostic(
        `${path}.body`,
        "start_has_body",
        "起点不应该包含正文",
        "删除 start.body",
      ),
    );
  }
}

function validateMarkdownNode(node, path, diagnostics) {
  if (!nonEmptyString(node.body)) {
    diagnostics.push(
      diagnostic(
        `${path}.body`,
        "missing_body",
        "图文节点缺少 Markdown 正文",
        "填写 body",
      ),
    );
  }
}

function validateVideoNode(node, path, diagnostics) {
  if (node.video === undefined) return;
  if (!isObject(node.video)) {
    diagnostics.push(
      diagnostic(`${path}.video`, "invalid_video", "video 必须是对象", "提供 video object"),
    );
    return;
  }
  reportUnknownFields(
    node.video,
    new Set([
      "url",
      "asset_key",
      "duration_seconds",
      "thumbnail_url",
      "thumbnail_asset_key",
    ]),
    `${path}.video`,
    diagnostics,
  );
  optionalString(node.video.url, `${path}.video.url`, diagnostics);
  optionalString(node.video.asset_key, `${path}.video.asset_key`, diagnostics);
  optionalString(
    node.video.thumbnail_url,
    `${path}.video.thumbnail_url`,
    diagnostics,
  );
  optionalString(
    node.video.thumbnail_asset_key,
    `${path}.video.thumbnail_asset_key`,
    diagnostics,
  );
  if (
    node.video.duration_seconds !== undefined &&
    (!Number.isInteger(node.video.duration_seconds) ||
      node.video.duration_seconds < 0)
  ) {
    diagnostics.push(
      diagnostic(
        `${path}.video.duration_seconds`,
        "invalid_video_duration",
        "视频时长必须是非负整数秒",
        "删除 duration_seconds 或填写整数秒",
      ),
    );
  }
}

function validateMaterialNode(node, path, diagnostics) {
  if (!isObject(node.material)) {
    diagnostics.push(
      diagnostic(
        `${path}.material`,
        "missing_material",
        "资料节点缺少 material",
        "填写 asset_key 或 URL 等资料元数据",
      ),
    );
    return;
  }
  const material = node.material;
  reportUnknownFields(
    material,
    new Set([
      "asset_key",
      "file_name",
      "mime_type",
      "original_url",
      "preview_url",
      "conversion_status",
    ]),
    `${path}.material`,
    diagnostics,
  );
  [
    "asset_key",
    "file_name",
    "mime_type",
    "original_url",
    "preview_url",
  ].forEach((field) => {
    optionalString(material[field], `${path}.material.${field}`, diagnostics);
  });
  if (
    material.conversion_status !== undefined &&
    !CONVERSION_STATUSES.has(material.conversion_status)
  ) {
    diagnostics.push(
      diagnostic(
        `${path}.material.conversion_status`,
        "invalid_conversion_status",
        "资料转换状态不支持",
        "使用 none、pending、processing、ready 或 failed",
      ),
    );
  }
  if (!hasAnyNonEmptyString(material, ["asset_key", "original_url", "preview_url"])) {
    diagnostics.push(
      diagnostic(
        `${path}.material`,
        "missing_material_location",
        "资料节点缺少资源位置",
        "填写 asset_key、original_url 或 preview_url",
      ),
    );
  }
}

function validateExercise(node, path, diagnostics) {
  if (!isObject(node.exercise)) {
    diagnostics.push(
      diagnostic(
        `${path}.exercise`,
        "missing_exercise",
        "习题节点缺少 exercise",
        "填写题型、题干和答案",
      ),
    );
    return;
  }
  const exercise = node.exercise;
  reportUnknownFields(
    exercise,
    new Set([
      "type",
      "prompt",
      "choices",
      "answer",
      "answers",
      "explanation",
      "sort_order",
    ]),
    `${path}.exercise`,
    diagnostics,
  );
  if (!EXERCISE_TYPES.has(exercise.type)) {
    diagnostics.push(
      diagnostic(
        `${path}.exercise.type`,
        "invalid_exercise_type",
        "题型不支持",
        `不支持 ${exercise.type}`,
      ),
    );
    return;
  }
  if (!nonEmptyString(exercise.prompt)) {
    diagnostics.push(
      diagnostic(
        `${path}.exercise.prompt`,
        "missing_prompt",
        "习题缺少题干",
        "填写 prompt",
      ),
    );
  }
  if (
    exercise.explanation !== undefined &&
    typeof exercise.explanation !== "string"
  ) {
    diagnostics.push(
      diagnostic(
        `${path}.exercise.explanation`,
        "invalid_explanation",
        "习题解析必须是 Markdown 字符串",
        "删除 explanation 或填写字符串",
      ),
    );
  }
  if (
    exercise.sort_order !== undefined &&
    (!Number.isInteger(exercise.sort_order) || exercise.sort_order < 0)
  ) {
    diagnostics.push(
      diagnostic(
        `${path}.exercise.sort_order`,
        "invalid_sort_order",
        "sort_order 必须是非负整数",
        "删除 sort_order 或填写 0 或正整数",
      ),
    );
  }

  if (exercise.type === "single_choice") {
    validateChoices(exercise, path, diagnostics);
    validateChoiceAnswer(exercise, path, diagnostics, { exactCount: 1 });
    disallowField(exercise, "answers", `${path}.exercise`, diagnostics);
  }
  if (exercise.type === "multiple_choice") {
    validateChoices(exercise, path, diagnostics);
    validateChoiceAnswer(exercise, path, diagnostics, { minCount: 1 });
    disallowField(exercise, "answers", `${path}.exercise`, diagnostics);
  }
  if (exercise.type === "true_false") {
    if (typeof exercise.answer !== "boolean") {
      diagnostics.push(
        diagnostic(
          `${path}.exercise.answer`,
          "invalid_true_false_answer",
          "判断题答案必须是布尔值",
          "填写 true 或 false",
        ),
      );
    }
    disallowField(exercise, "choices", `${path}.exercise`, diagnostics);
    disallowField(exercise, "answers", `${path}.exercise`, diagnostics);
  }
  if (exercise.type === "fill_blank") {
    validateFillBlankAnswers(exercise, path, diagnostics);
    disallowField(exercise, "choices", `${path}.exercise`, diagnostics);
    disallowField(exercise, "answer", `${path}.exercise`, diagnostics);
  }
}

function validateChoices(exercise, path, diagnostics) {
  if (!isObject(exercise.choices) || Object.keys(exercise.choices).length < 2) {
    diagnostics.push(
      diagnostic(
        `${path}.exercise.choices`,
        "missing_choices",
        "选择题至少需要两个选项",
        "填写 choices，例如 { \"A\": \"...\", \"B\": \"...\" }",
      ),
    );
    return;
  }
  Object.entries(exercise.choices).forEach(([key, value]) => {
    if (!isValidChoiceKey(key)) {
      diagnostics.push(
        diagnostic(
          `${path}.exercise.choices.${key}`,
          "invalid_choice_key",
          "选项 key 不合法",
          "使用 A、B、C 或 opt_1 这类稳定短 key",
        ),
      );
    }
    if (!nonEmptyString(value)) {
      diagnostics.push(
        diagnostic(
          `${path}.exercise.choices.${key}`,
          "invalid_choice_text",
          "选项内容不能为空",
          "填写 Markdown 字符串",
        ),
      );
    }
  });
}

function validateChoiceAnswer(exercise, path, diagnostics, options) {
  if (!Array.isArray(exercise.answer)) {
    diagnostics.push(
      diagnostic(
        `${path}.exercise.answer`,
        "invalid_choice_answer",
        "选择题答案必须是选项 key 数组",
        '例如 ["A"] 或 ["A", "C"]',
      ),
    );
    return;
  }
  const answer = exercise.answer;
  if (options.exactCount !== undefined && answer.length !== options.exactCount) {
    diagnostics.push(
      diagnostic(
        `${path}.exercise.answer`,
        "invalid_choice_answer_count",
        "单选题必须恰好有一个正确选项",
        "只保留一个选项 key",
      ),
    );
  }
  if (options.minCount !== undefined && answer.length < options.minCount) {
    diagnostics.push(
      diagnostic(
        `${path}.exercise.answer`,
        "missing_choice_answer",
        "选择题至少需要一个正确选项",
        "填写至少一个选项 key",
      ),
    );
  }
  const seen = new Set();
  answer.forEach((key, index) => {
    const itemPath = `${path}.exercise.answer[${index}]`;
    if (typeof key !== "string") {
      diagnostics.push(
        diagnostic(itemPath, "invalid_answer_key", "答案 key 必须是字符串", "填写选项 key"),
      );
      return;
    }
    if (seen.has(key)) {
      diagnostics.push(
        diagnostic(itemPath, "duplicate_answer_key", "答案 key 重复", "删除重复 key"),
      );
    }
    seen.add(key);
    if (isObject(exercise.choices) && !Object.hasOwn(exercise.choices, key)) {
      diagnostics.push(
        diagnostic(
          itemPath,
          "unknown_answer_choice",
          "答案 key 不存在于 choices",
          `choices 中找不到 ${key}`,
        ),
      );
    }
  });
}

function validateFillBlankAnswers(exercise, path, diagnostics) {
  if (!Array.isArray(exercise.answers) || exercise.answers.length === 0) {
    diagnostics.push(
      diagnostic(
        `${path}.exercise.answers`,
        "missing_blank_answers",
        "填空题至少需要一个答案",
        "填写 answers 数组",
      ),
    );
    return;
  }
  const blankKeys = new Set();
  exercise.answers.forEach((answer, index) => {
    const answerPath = `${path}.exercise.answers[${index}]`;
    if (!isObject(answer)) {
      diagnostics.push(
        diagnostic(answerPath, "invalid_blank_answer", "填空答案必须是对象", "提供 answer object"),
      );
      return;
    }
    reportUnknownFields(
      answer,
      new Set(["blank_key", "accepted_answer", "match_mode"]),
      answerPath,
      diagnostics,
    );
    if (
      answer.blank_key !== undefined &&
      (!nonEmptyString(answer.blank_key) || !isValidFlowId(answer.blank_key))
    ) {
      diagnostics.push(
        diagnostic(
          `${answerPath}.blank_key`,
          "invalid_blank_key",
          "填空 blank_key 不合法",
          "使用英文字母开头，只包含字母、数字、_、-",
        ),
      );
    }
    if (answer.blank_key !== undefined) {
      if (blankKeys.has(answer.blank_key)) {
        diagnostics.push(
          diagnostic(
            `${answerPath}.blank_key`,
            "duplicate_blank_key",
            "填空 blank_key 重复",
            "每个 blank_key 只能出现一次",
          ),
        );
      }
      blankKeys.add(answer.blank_key);
    }
    if (!nonEmptyString(answer.accepted_answer)) {
      diagnostics.push(
        diagnostic(
          `${answerPath}.accepted_answer`,
          "missing_accepted_answer",
          "填空答案不能为空",
          "填写 accepted_answer",
        ),
      );
    }
    if (answer.match_mode !== undefined && !MATCH_MODES.has(answer.match_mode)) {
      diagnostics.push(
        diagnostic(
          `${answerPath}.match_mode`,
          "invalid_match_mode",
          "填空匹配模式不支持",
          "使用 exact、trim 或 case_insensitive",
        ),
      );
    }
  });
}

function validateProgrammingProblem(node, path, diagnostics) {
  if (!isObject(node.problem)) {
    diagnostics.push(
      diagnostic(
        `${path}.problem`,
        "missing_problem",
        "编程题节点缺少 problem",
        "填写题干、初始代码和测试用例",
      ),
    );
    return;
  }
  const problem = node.problem;
  reportUnknownFields(
    problem,
    new Set([
      "prompt",
      "language",
      "entry_file",
      "starter_code",
      "checker",
      "float_tolerance",
      "time_limit_ms",
      "memory_limit_mb",
      "explanation",
      "sort_order",
      "tests",
    ]),
    `${path}.problem`,
    diagnostics,
  );
  if (!nonEmptyString(problem.prompt)) {
    diagnostics.push(
      diagnostic(
        `${path}.problem.prompt`,
        "missing_prompt",
        "编程题缺少题干",
        "填写 prompt",
      ),
    );
  }
  if (problem.language !== "python") {
    diagnostics.push(
      diagnostic(
        `${path}.problem.language`,
        "invalid_problem_language",
        "v1 编程题只支持 Python",
        '设置为 "python"',
      ),
    );
  }
  if (!nonEmptyString(problem.entry_file)) {
    diagnostics.push(
      diagnostic(
        `${path}.problem.entry_file`,
        "missing_entry_file",
        "编程题缺少入口文件",
        '填写 "main.py"',
      ),
    );
  }
  if (!nonEmptyString(problem.starter_code)) {
    diagnostics.push(
      diagnostic(
        `${path}.problem.starter_code`,
        "missing_starter_code",
        "编程题缺少初始代码",
        "填写 starter_code",
      ),
    );
  }
  if (problem.checker !== undefined && !CHECKERS.has(problem.checker)) {
    diagnostics.push(
      diagnostic(
        `${path}.problem.checker`,
        "invalid_checker",
        "编程题 checker 不支持",
        "使用 exact、whitespace 或 float_tolerance",
      ),
    );
  }
  if (problem.checker === "float_tolerance") {
    if (
      typeof problem.float_tolerance !== "number" ||
      !Number.isFinite(problem.float_tolerance) ||
      problem.float_tolerance <= 0
    ) {
      diagnostics.push(
        diagnostic(
          `${path}.problem.float_tolerance`,
          "missing_float_tolerance",
          "float_tolerance checker 需要正数容差",
          "填写大于 0 的 float_tolerance",
        ),
      );
    }
  } else if (problem.float_tolerance !== undefined) {
    diagnostics.push(
      diagnostic(
        `${path}.problem.float_tolerance`,
        "unused_float_tolerance",
        "只有 float_tolerance checker 可以设置容差",
        "删除 float_tolerance 或把 checker 改为 float_tolerance",
      ),
    );
  }
  validatePositiveInteger(
    problem.time_limit_ms,
    `${path}.problem.time_limit_ms`,
    "time_limit_ms",
    diagnostics,
  );
  validatePositiveInteger(
    problem.memory_limit_mb,
    `${path}.problem.memory_limit_mb`,
    "memory_limit_mb",
    diagnostics,
  );
  if (problem.explanation !== undefined && typeof problem.explanation !== "string") {
    diagnostics.push(
      diagnostic(
        `${path}.problem.explanation`,
        "invalid_explanation",
        "编程题解析必须是 Markdown 字符串",
        "删除 explanation 或填写字符串",
      ),
    );
  }
  if (
    problem.sort_order !== undefined &&
    (!Number.isInteger(problem.sort_order) || problem.sort_order < 0)
  ) {
    diagnostics.push(
      diagnostic(
        `${path}.problem.sort_order`,
        "invalid_sort_order",
        "sort_order 必须是非负整数",
        "删除 sort_order 或填写 0 或正整数",
      ),
    );
  }
  if (!Array.isArray(problem.tests) || problem.tests.length === 0) {
    diagnostics.push(
      diagnostic(
        `${path}.problem.tests`,
        "missing_tests",
        "编程题至少需要一个测试用例",
        "填写 tests",
      ),
    );
    return;
  }
  let sampleCount = 0;
  let hiddenCount = 0;
  problem.tests.forEach((test, index) => {
    const testPath = `${path}.problem.tests[${index}]`;
    if (!isObject(test)) {
      diagnostics.push(
        diagnostic(testPath, "invalid_test", "测试用例必须是对象", "提供 test object"),
      );
      return;
    }
    reportUnknownFields(
      test,
      new Set(["visibility", "input", "output", "feedback", "full_feedback"]),
      testPath,
      diagnostics,
    );
    if (!TEST_VISIBILITIES.has(test.visibility)) {
      diagnostics.push(
        diagnostic(
          `${testPath}.visibility`,
          "invalid_test_visibility",
          "测试可见性不支持",
          "使用 sample 或 hidden",
        ),
      );
    } else if (test.visibility === "sample") {
      sampleCount += 1;
    } else {
      hiddenCount += 1;
    }
    if (typeof test.input !== "string" || typeof test.output !== "string") {
      diagnostics.push(
        diagnostic(
          testPath,
          "invalid_test_io",
          "测试用例需要字符串 input 和 output",
          "填写 input/output",
        ),
      );
    }
    if (test.feedback !== undefined && typeof test.feedback !== "string") {
      diagnostics.push(
        diagnostic(
          `${testPath}.feedback`,
          "invalid_test_feedback",
          "测试反馈必须是 Markdown 字符串",
          "删除 feedback 或填写字符串",
        ),
      );
    }
    if (test.full_feedback !== undefined && typeof test.full_feedback !== "boolean") {
      diagnostics.push(
        diagnostic(
          `${testPath}.full_feedback`,
          "invalid_full_feedback",
          "full_feedback 必须是布尔值",
          "填写 true 或 false",
        ),
      );
    }
    if (test.visibility === "hidden" && test.full_feedback === true) {
      diagnostics.push(
        diagnostic(
          `${testPath}.full_feedback`,
          "hidden_full_feedback",
          "隐藏用例不能显示完整反馈",
          "删除 full_feedback 或设为 false",
        ),
      );
    }
  });
  if (sampleCount === 0) {
    diagnostics.push(
      diagnostic(
        `${path}.problem.tests`,
        "missing_sample_test",
        "编程题至少需要一个公开样例",
        "添加 visibility 为 sample 的测试",
      ),
    );
  }
  if (hiddenCount === 0) {
    diagnostics.push(
      diagnostic(
        `${path}.problem.tests`,
        "missing_hidden_test",
        "编程题至少需要一个隐藏用例",
        "添加 visibility 为 hidden 的测试",
      ),
    );
  }
}

function validateCodingWorkspace(node, path, diagnostics) {
  if (node.workspace === undefined) return;
  if (!isObject(node.workspace)) {
    diagnostics.push(
      diagnostic(
        `${path}.workspace`,
        "invalid_workspace",
        "workspace 必须是对象",
        "提供 workspace object",
      ),
    );
    return;
  }
  const workspace = node.workspace;
  reportUnknownFields(
    workspace,
    new Set(["language", "entry_file", "starter_code"]),
    `${path}.workspace`,
    diagnostics,
  );
  if (workspace.language !== undefined && workspace.language !== "python") {
    diagnostics.push(
      diagnostic(
        `${path}.workspace.language`,
        "invalid_workspace_language",
        "v1 编程环境只支持 Python",
        '设置为 "python"',
      ),
    );
  }
  optionalString(workspace.entry_file, `${path}.workspace.entry_file`, diagnostics);
  optionalString(
    workspace.starter_code,
    `${path}.workspace.starter_code`,
    diagnostics,
  );
}

function validateSplitCard(node, path, diagnostics) {
  if (!isObject(node.slots)) {
    diagnostics.push(
      diagnostic(
        `${path}.slots`,
        "missing_slots",
        "双栏缺少左右槽",
        "填写 slots.left 和 slots.right",
      ),
    );
    return;
  }
  reportUnknownFields(
    node.slots,
    new Set(["left", "right"]),
    `${path}.slots`,
    diagnostics,
  );
  if (!nonEmptyString(node.slots.left)) {
    diagnostics.push(
      diagnostic(
        `${path}.slots.left`,
        "missing_left_slot",
        "双栏缺少左槽节点",
        "填写左槽节点 id",
      ),
    );
  }
  if (!nonEmptyString(node.slots.right)) {
    diagnostics.push(
      diagnostic(
        `${path}.slots.right`,
        "missing_right_slot",
        "双栏缺少右槽节点",
        "填写右槽节点 id",
      ),
    );
  }
  if (node.slots.left === node.slots.right) {
    diagnostics.push(
      diagnostic(
        `${path}.slots`,
        "duplicate_slots",
        "双栏左右槽不能是同一个节点",
        "为 left 和 right 指定两个不同节点",
      ),
    );
  }
}

function validatePeerReview(node, path, diagnostics) {
  if (!nonEmptyString(node.body)) {
    diagnostics.push(
      diagnostic(
        `${path}.body`,
        "missing_peer_review_body",
        "互评节点缺少说明",
        "填写 Markdown body 作为互评说明",
      ),
    );
  }
}

function validateEdgeStructure(edge, path, diagnostics, document) {
  if (!isObject(edge)) {
    diagnostics.push(
      diagnostic(path, "invalid_edge", "线条必须是对象", "提供 edge object"),
    );
    return;
  }
  reportUnknownFields(edge, new Set(["from", "to", "type", "at"]), path, diagnostics);
  if (!Object.hasOwn(document.nodes, edge.from)) {
    diagnostics.push(
      diagnostic(
        `${path}.from`,
        "unknown_source",
        "线条起点不存在",
        `找不到节点 ${edge.from}`,
      ),
    );
  }
  if (!Object.hasOwn(document.nodes, edge.to)) {
    diagnostics.push(
      diagnostic(
        `${path}.to`,
        "unknown_target",
        "线条终点不存在",
        `找不到节点 ${edge.to}`,
      ),
    );
  }
  if (!EDGE_TYPES.has(edge.type)) {
    diagnostics.push(
      diagnostic(
        `${path}.type`,
        "invalid_edge_type",
        "线条类型不支持",
        `不支持 ${edge.type}`,
      ),
    );
    return;
  }
  if (edge.from === edge.to) {
    diagnostics.push(
      diagnostic(path, "self_edge", "线条不能连接节点自身", "删除自环线"),
    );
  }
  if (edge.type === "video_pause") {
    if (parsePauseSeconds(edge.at) === null) {
      diagnostics.push(
        diagnostic(
          `${path}.at`,
          "invalid_pause_time",
          "视频暂停线缺少合法时间点",
          '填写秒数或 mm:ss，例如 "01:20"',
        ),
      );
    }
  } else if (edge.at !== undefined) {
    diagnostics.push(
      diagnostic(
        `${path}.at`,
        "unexpected_edge_time",
        "只有 video_pause 可以设置 at",
        "删除 at 或改为 video_pause",
      ),
    );
  }
}

function validateSemantics(document) {
  const diagnostics = [];
  const slotUse = collectSlotUse(document, diagnostics);
  const slotChildren = new Set(slotUse.keys());
  const learningGraph = buildLearningGraph(document);

  validateStartSemantics(document, learningGraph, slotChildren, diagnostics);
  validateDuplicateEdges(document, diagnostics);

  document.edges.forEach((edge, index) => {
    const path = `$.edges[${index}]`;
    if (!isObject(edge)) return;
    const source = document.nodes[edge.from];
    const target = document.nodes[edge.to];

    if (!isObject(source) || !isObject(target) || !EDGE_TYPES.has(edge.type)) return;

    if (LEARNING_EDGE_TYPES.has(edge.type)) {
      if (slotChildren.has(edge.from) || slotChildren.has(edge.to)) {
        diagnostics.push(
          diagnostic(
            path,
            "slot_child_has_learning_path",
            "双栏槽位节点不能参与学习路径",
            "把学习路径连到双栏大块，不要连到槽位子节点",
          ),
        );
      }
      if (!isPresentableLearningNode(source) || !isPresentableLearningNode(target)) {
        diagnostics.push(
          diagnostic(
            path,
            "invalid_learning_endpoint",
            "学习路径只能连接可呈现顶层节点",
            "不要把学习路径连到互评引用、槽位子节点或内部资源",
          ),
        );
      }
      return;
    }
    if (edge.type === "membership") {
      if (source.type !== "exercise" || target.type !== "exercise_set") {
        diagnostics.push(
          diagnostic(
            path,
            "invalid_membership",
            "习题归集线方向不对",
            "membership 必须是 exercise -> exercise_set",
          ),
        );
      }
      return;
    }
    if (edge.type === "video_pause") {
      if (
        !["exercise", "exercise_set"].includes(source.type) ||
        target.type !== "video"
      ) {
        diagnostics.push(
          diagnostic(
            path,
            "invalid_video_pause",
            "视频暂停线方向不对",
            "video_pause 必须是 exercise/exercise_set -> video",
          ),
        );
      }
      return;
    }
    if (edge.type === "peer_review_reference") {
      if (
        !["exercise", "programming_problem"].includes(source.type) ||
        target.type !== "peer_review"
      ) {
        diagnostics.push(
          diagnostic(
            path,
            "invalid_peer_review_reference",
            "互评引用线方向不对",
            "peer_review_reference 必须是 exercise/programming_problem -> peer_review",
          ),
        );
      }
    }
  });

  validateSlotSemantics(document, slotUse, diagnostics);
  validateMembershipCardinality(document, diagnostics);
  validateLearningReachability(document, learningGraph, slotChildren, diagnostics);

  const cycle = findLearningPathCycle(document);
  if (cycle) {
    diagnostics.push(
      diagnostic(
        "$.edges",
        "learning_path_cycle",
        "学习路径不能成环",
        `删除 required/recommended 环路中的一条线：${cycle.join(" -> ")}`,
      ),
    );
  }

  return diagnostics;
}

function collectSlotUse(document, diagnostics) {
  const slotUse = new Map();
  Object.entries(document.nodes).forEach(([nodeId, node]) => {
    if (!isObject(node)) return;
    if (node.type !== "split_card" || !isObject(node.slots)) return;
    [
      ["left", node.slots.left],
      ["right", node.slots.right],
    ].forEach(([slotName, childId]) => {
      if (slotName === "right" && node.slots.left === node.slots.right) return;
      const path = `$.nodes.${nodeId}.slots.${slotName}`;
      const child = document.nodes[childId];
      if (!child) {
        diagnostics.push(
          diagnostic(
            path,
            "unknown_slot_node",
            "双栏槽位节点不存在",
            `找不到节点 ${childId}`,
          ),
        );
        return;
      }
      if (child.type === "split_card") {
        diagnostics.push(
          diagnostic(
            path,
            "nested_split_card",
            "双栏不能嵌套双栏",
            "双栏槽位只能装一层普通节点",
          ),
        );
      }
      if (child.type === "start") {
        diagnostics.push(
          diagnostic(
            path,
            "start_as_slot_child",
            "起点不能作为双栏槽位",
            "把普通内容节点放入槽位",
          ),
        );
      }
      if (!slotUse.has(childId)) slotUse.set(childId, []);
      slotUse.get(childId).push({ parentId: nodeId, slotName, path });
    });
  });
  return slotUse;
}

function validateStartSemantics(document, learningGraph, slotChildren, diagnostics) {
  const startIds = Object.entries(document.nodes)
    .filter(([, node]) => isObject(node) && node.type === "start")
    .map(([nodeId]) => nodeId);
  if (startIds.length !== 1) {
    diagnostics.push(
      diagnostic(
        "$.nodes",
        "invalid_start_count",
        "画布必须有且只有一个起点",
        `当前有 ${startIds.length} 个 start 节点`,
      ),
    );
    return;
  }
  const startId = startIds[0];
  if (slotChildren.has(startId)) return;
  const outgoing = learningGraph.outgoing.get(startId) ?? [];
  const incoming = learningGraph.incoming.get(startId) ?? [];
  if (incoming.length > 0) {
    diagnostics.push(
      diagnostic(
        `$.nodes.${startId}`,
        "start_has_incoming_learning_edge",
        "起点不应该有学习路径入线",
        "删除指向 start 的 required/recommended 线",
      ),
    );
  }
  if (outgoing.length === 0 && Object.keys(document.nodes).length > 1) {
    diagnostics.push(
      diagnostic(
        `$.nodes.${startId}`,
        "start_has_no_learning_edge",
        "起点没有指向课程内容",
        "从 start 连一条 required 或 recommended 到第一个块",
      ),
    );
  }
}

function validateDuplicateEdges(document, diagnostics) {
  const seen = new Map();
  document.edges.forEach((edge, index) => {
    if (!isObject(edge)) return;
    const key = `${edge.type}:${edge.from}->${edge.to}:${edge.at ?? ""}`;
    if (seen.has(key)) {
      diagnostics.push(
        diagnostic(
          `$.edges[${index}]`,
          "duplicate_edge",
          "重复线条",
          `和 $.edges[${seen.get(key)}] 重复`,
        ),
      );
    } else {
      seen.set(key, index);
    }
  });
}

function validateSlotSemantics(document, slotUse, diagnostics) {
  slotUse.forEach((uses, childId) => {
    const child = document.nodes[childId];
    if (uses.length > 1) {
      uses.slice(1).forEach((use) => {
        diagnostics.push(
          diagnostic(
            use.path,
            "slot_child_reused",
            "同一个节点不能放进多个双栏槽位",
            `${childId} 已经被另一个双栏使用`,
          ),
        );
      });
    }
    if (child?.type === "peer_review") {
      uses.forEach((use) => {
        diagnostics.push(
          diagnostic(
            use.path,
            "peer_review_as_slot_child",
            "互评节点不应作为双栏槽位内容",
            "互评节点应该通过 peer_review_reference 引用",
          ),
        );
      });
    }
  });
}

function validateMembershipCardinality(document, diagnostics) {
  const membershipByExercise = new Map();
  document.edges.forEach((edge, index) => {
    if (!isObject(edge) || edge.type !== "membership") return;
    if (!membershipByExercise.has(edge.from)) membershipByExercise.set(edge.from, []);
    membershipByExercise.get(edge.from).push(index);
  });
  membershipByExercise.forEach((indexes, exerciseId) => {
    if (indexes.length <= 1) return;
    indexes.slice(1).forEach((index) => {
      diagnostics.push(
        diagnostic(
          `$.edges[${index}]`,
          "exercise_in_multiple_sets",
          "同一道习题不应该归属多个习题集",
          `${exerciseId} 已经有一个 membership`,
        ),
      );
    });
  });
}

function validateLearningReachability(
  document,
  learningGraph,
  slotChildren,
  diagnostics,
) {
  const startId = Object.entries(document.nodes).find(
    ([, node]) => isObject(node) && node.type === "start",
  )?.[0];
  if (!startId) return;

  const reachable = collectReachable(startId, learningGraph.outgoing);
  const semanticallyUsed = collectSemanticNodes(document);

  Object.entries(document.nodes).forEach(([nodeId, node]) => {
    if (!isObject(node)) return;
    if (node.type === "start") return;
    if (slotChildren.has(nodeId)) return;
    if (node.type === "peer_review") {
      if (!semanticallyUsed.has(nodeId)) {
        diagnostics.push(
          diagnostic(
            `$.nodes.${nodeId}`,
            "unreferenced_peer_review",
            "互评节点没有被引用",
            "用 peer_review_reference 从被评对象连到它，或删除该节点",
          ),
        );
      }
      return;
    }
    if (!reachable.has(nodeId) && !semanticallyUsed.has(nodeId)) {
      diagnostics.push(
        diagnostic(
          `$.nodes.${nodeId}`,
          "unreachable_node",
          "节点无法在学生路径中呈现",
          "把它接入 required/recommended 学习路径，或用 membership/video_pause 等语义线引用",
        ),
      );
    }
  });
}

function collectSemanticNodes(document) {
  const nodes = new Set();
  document.edges.forEach((edge) => {
    if (!isObject(edge) || LEARNING_EDGE_TYPES.has(edge.type)) return;
    if (!EDGE_TYPES.has(edge.type)) return;
    nodes.add(edge.from);
    nodes.add(edge.to);
  });
  return nodes;
}

function buildLearningGraph(document) {
  const outgoing = new Map();
  const incoming = new Map();
  Object.keys(document.nodes).forEach((nodeId) => {
    outgoing.set(nodeId, []);
    incoming.set(nodeId, []);
  });

  document.edges.forEach((edge, index) => {
    if (!isObject(edge)) return;
    if (!LEARNING_EDGE_TYPES.has(edge.type)) return;
    if (!outgoing.has(edge.from) || !incoming.has(edge.to)) return;
    outgoing.get(edge.from).push({ to: edge.to, index });
    incoming.get(edge.to).push({ from: edge.from, index });
  });

  return { outgoing, incoming };
}

function collectReachable(startId, outgoing) {
  const seen = new Set();
  const queue = [startId];
  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);
    (outgoing.get(nodeId) ?? []).forEach((edge) => {
      if (!seen.has(edge.to)) queue.push(edge.to);
    });
  }
  return seen;
}

function findLearningPathCycle(document) {
  const state = new Map();
  const stack = [];
  const stackIndex = new Map();
  const outgoing = new Map();
  Object.keys(document.nodes).forEach((nodeId) => outgoing.set(nodeId, []));
  document.edges.forEach((edge) => {
    if (!isObject(edge)) return;
    if (!LEARNING_EDGE_TYPES.has(edge.type)) return;
    if (!outgoing.has(edge.from)) return;
    outgoing.get(edge.from).push(edge.to);
  });

  for (const nodeId of Object.keys(document.nodes)) {
    const cycle = visit(nodeId);
    if (cycle) return cycle;
  }
  return null;

  function visit(nodeId) {
    if (state.get(nodeId) === "done") return null;
    if (state.get(nodeId) === "visiting") {
      const start = stackIndex.get(nodeId) ?? 0;
      return [...stack.slice(start), nodeId];
    }
    state.set(nodeId, "visiting");
    stackIndex.set(nodeId, stack.length);
    stack.push(nodeId);
    for (const next of outgoing.get(nodeId) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    stackIndex.delete(nodeId);
    state.set(nodeId, "done");
    return null;
  }
}

function summarize(document) {
  const nodeValues = Object.values(document.nodes).filter(isObject);
  return {
    nodes: nodeValues.length,
    edges: document.edges.length,
    exercises: nodeValues.filter((node) => node.type === "exercise").length,
    exercise_sets: nodeValues.filter((node) => node.type === "exercise_set")
      .length,
    programming_problems: nodeValues.filter(
      (node) => node.type === "programming_problem",
    ).length,
    video_pauses: document.edges.filter(
      (edge) => isObject(edge) && edge.type === "video_pause",
    ).length,
    split_cards: nodeValues.filter((node) => node.type === "split_card").length,
  };
}

function parsePauseSeconds(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const parts = trimmed.split(":");
  if (parts.length !== 2 && parts.length !== 3) return null;
  if (!/^\d+$/.test(parts[0])) return null;
  if (!/^\d{2}$/.test(parts[parts.length - 1])) return null;
  if (parts.length === 3 && !/^\d{2}$/.test(parts[1])) return null;
  const numbers = parts.map((part) => Number(part));
  if (parts.length === 2) {
    const [minutes, seconds] = numbers;
    if (seconds > 59) return null;
    return minutes * 60 + seconds;
  }
  const [hours, minutes, seconds] = numbers;
  if (minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function validatePosition(value, path, diagnostics) {
  if (!isObject(value)) {
    diagnostics.push(
      diagnostic(path, "invalid_position", "position 必须是对象", "填写 { x, y }"),
    );
    return;
  }
  reportUnknownFields(value, new Set(["x", "y"]), path, diagnostics);
  if (typeof value.x !== "number" || !Number.isFinite(value.x)) {
    diagnostics.push(
      diagnostic(`${path}.x`, "invalid_position_x", "position.x 必须是数字", "填写数字"),
    );
  }
  if (typeof value.y !== "number" || !Number.isFinite(value.y)) {
    diagnostics.push(
      diagnostic(`${path}.y`, "invalid_position_y", "position.y 必须是数字", "填写数字"),
    );
  }
}

function validatePositiveInteger(value, path, label, diagnostics) {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value <= 0) {
    diagnostics.push(
      diagnostic(
        path,
        `invalid_${label}`,
        `${label} 必须是正整数`,
        "删除该字段或填写正整数",
      ),
    );
  }
}

function reportUnknownFields(value, allowedFields, path, diagnostics) {
  Object.keys(value).forEach((field) => {
    if (!allowedFields.has(field)) {
      diagnostics.push(
        diagnostic(
          `${path}.${field}`,
          "unknown_field",
          "字段不属于 Flow JSON v1",
          "删除该字段或更新 schema 后再使用",
        ),
      );
    }
  });
}

function disallowField(value, field, path, diagnostics) {
  if (value[field] === undefined) return;
  diagnostics.push(
    diagnostic(
      `${path}.${field}`,
      "unexpected_field_for_type",
      "当前题型不应该包含这个字段",
      `删除 ${field}`,
    ),
  );
}

function optionalString(value, path, diagnostics) {
  if (value === undefined) return;
  if (typeof value !== "string") {
    diagnostics.push(
      diagnostic(path, "invalid_string", "字段必须是字符串", "删除该字段或填写字符串"),
    );
  }
}

function hasAnyNonEmptyString(value, fields) {
  return fields.some((field) => nonEmptyString(value[field]));
}

function isPresentableLearningNode(node) {
  return [
    "start",
    "markdown",
    "video",
    "material",
    "exercise",
    "exercise_set",
    "programming_problem",
    "coding_workspace",
    "split_card",
  ].includes(node.type);
}

function isValidFlowId(value) {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_-]*$/.test(value);
}

function isValidChoiceKey(value) {
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function diagnostic(path, code, title, message) {
  return { path, code, title, message };
}

function printDiagnostics(diagnostics) {
  console.error("Canvas Flow JSON has errors:");
  diagnostics.forEach((item) => {
    console.error(
      `- ${item.path} [${item.code}] ${item.title}: ${item.message}`,
    );
  });
}
