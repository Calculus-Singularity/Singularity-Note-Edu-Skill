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
  if (diagnostics.length === 0) {
    diagnostics.push(...validateSemantics(value));
  }
  return diagnostics;
}

function validateStructure(document) {
  const diagnostics = [];
  if (!isObject(document)) {
    return [
      diagnostic("$", "invalid_document", "Flow JSON 必须是对象", "提供 JSON object"),
    ];
  }
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
  if (!isObject(document.nodes) || Object.keys(document.nodes).length === 0) {
    diagnostics.push(
      diagnostic(
        "$.nodes",
        "missing_nodes",
        "nodes 不能为空",
        "至少提供一个 start 节点和一个内容节点",
      ),
    );
  }
  if (!Array.isArray(document.edges)) {
    diagnostics.push(
      diagnostic("$.edges", "invalid_edges", "edges 必须是数组", "提供 edges 数组"),
    );
  }
  if (diagnostics.length > 0) return diagnostics;

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
    }
    if (!nonEmptyString(node.title)) {
      diagnostics.push(
        diagnostic(`${path}.title`, "missing_title", "节点缺少标题", "填写 title"),
      );
    }
    if (node.type === "exercise") validateExercise(node, path, diagnostics);
    if (node.type === "programming_problem") {
      validateProgrammingProblem(node, path, diagnostics);
    }
    if (node.type === "split_card") validateSplitCard(node, path, diagnostics);
  });

  document.edges.forEach((edge, index) => {
    const path = `$.edges[${index}]`;
    if (!isObject(edge)) {
      diagnostics.push(
        diagnostic(path, "invalid_edge", "线条必须是对象", "提供 edge object"),
      );
      return;
    }
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
    }
  });

  return diagnostics;
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
  if (!EXERCISE_TYPES.has(exercise.type)) {
    diagnostics.push(
      diagnostic(
        `${path}.exercise.type`,
        "invalid_exercise_type",
        "题型不支持",
        `不支持 ${exercise.type}`,
      ),
    );
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
    ["single_choice", "multiple_choice"].includes(exercise.type) &&
    (!isObject(exercise.choices) || Object.keys(exercise.choices).length < 2)
  ) {
    diagnostics.push(
      diagnostic(
        `${path}.exercise.choices`,
        "missing_choices",
        "选择题至少需要两个选项",
        "填写 choices",
      ),
    );
  }
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
  problem.tests.forEach((test, index) => {
    const testPath = `${path}.problem.tests[${index}]`;
    if (!isObject(test)) {
      diagnostics.push(
        diagnostic(testPath, "invalid_test", "测试用例必须是对象", "提供 test object"),
      );
      return;
    }
    if (test.visibility && !TEST_VISIBILITIES.has(test.visibility)) {
      diagnostics.push(
        diagnostic(
          `${testPath}.visibility`,
          "invalid_test_visibility",
          "测试可见性不支持",
          "使用 sample 或 hidden",
        ),
      );
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
  });
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

function validateSemantics(document) {
  const diagnostics = [];
  const slotChildren = new Set();

  Object.entries(document.nodes).forEach(([nodeId, node]) => {
    if (node.type !== "split_card" || !isObject(node.slots)) return;
    [
      ["left", node.slots.left],
      ["right", node.slots.right],
    ].forEach(([slotName, childId]) => {
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
      slotChildren.add(childId);
    });
  });

  document.edges.forEach((edge, index) => {
    const path = `$.edges[${index}]`;
    const source = document.nodes[edge.from];
    const target = document.nodes[edge.to];

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

  if (learningPathHasCycle(document)) {
    diagnostics.push(
      diagnostic(
        "$.edges",
        "learning_path_cycle",
        "学习路径不能成环",
        "删除 required/recommended 环路中的一条线",
      ),
    );
  }

  return diagnostics;
}

function learningPathHasCycle(document) {
  const outgoing = new Map();
  const incomingCount = new Map();
  Object.keys(document.nodes).forEach((nodeId) => {
    outgoing.set(nodeId, []);
    incomingCount.set(nodeId, 0);
  });

  document.edges.forEach((edge) => {
    if (!LEARNING_EDGE_TYPES.has(edge.type)) return;
    outgoing.get(edge.from).push(edge.to);
    incomingCount.set(edge.to, (incomingCount.get(edge.to) ?? 0) + 1);
  });

  const queue = [...incomingCount.entries()]
    .filter(([, count]) => count === 0)
    .map(([nodeId]) => nodeId);
  let visited = 0;

  while (queue.length > 0) {
    const nodeId = queue.shift();
    visited += 1;
    outgoing.get(nodeId).forEach((target) => {
      incomingCount.set(target, incomingCount.get(target) - 1);
      if (incomingCount.get(target) === 0) queue.push(target);
    });
  }

  return visited !== Object.keys(document.nodes).length;
}

function summarize(document) {
  const nodeValues = Object.values(document.nodes);
  return {
    nodes: nodeValues.length,
    edges: document.edges.length,
    exercises: nodeValues.filter((node) => node.type === "exercise").length,
    exercise_sets: nodeValues.filter((node) => node.type === "exercise_set")
      .length,
    programming_problems: nodeValues.filter(
      (node) => node.type === "programming_problem",
    ).length,
    video_pauses: document.edges.filter((edge) => edge.type === "video_pause")
      .length,
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
  const parts = trimmed.split(":").map((part) => Number(part));
  if (parts.length === 2 && parts.every(Number.isInteger)) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3 && parts.every(Number.isInteger)) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return null;
}

function isValidFlowId(value) {
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
