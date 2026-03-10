import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inspectTodoBoard, readTodoBoard, validateTodoBoard } from "../src/todo-system.js";

function createTempProject() {
  return mkdtempSync(join(tmpdir(), "todo-system-"));
}

function validBoard() {
  return {
    version: 1,
    direction: {
      current_focus: "Keep the rebuild clean.",
      why_now: "Planning drift creates slop.",
      last_changed: "2026-03-10"
    },
    limits: {
      max_now: 3,
      max_total_items: 9,
      max_done_items: 3,
      max_dropped_items: 3,
      max_text_chars: 220
    },
    delivery: {
      one_pr_per_item: true,
      max_active_pr_items: 1,
      active_item_ids: [],
      coupled_reason: "",
      rule: "One PR should close one item."
    },
    items: [
      {
        id: "a",
        status: "now",
        title: "Do the current thing.",
        why: "It matters now.",
        done_when: "It is clearly done.",
        review_state: "needs_review",
        changed_on: "2026-03-10"
      },
      {
        id: "b",
        status: "next",
        title: "Do the next thing.",
        why: "It comes after.",
        done_when: "It is ready.",
        review_state: "draft",
        changed_on: "2026-03-10"
      },
      {
        id: "c",
        status: "later",
        title: "Do the later thing.",
        why: "It keeps the horizon visible.",
        done_when: "It is still clearly defined.",
        review_state: "draft",
        changed_on: "2026-03-10"
      }
    ]
  };
}

test("todo board reader loads the canonical file", () => {
  const cwd = createTempProject();
  const board = validBoard();
  writeFileSync(join(cwd, "todo.json"), JSON.stringify(board, null, 2));

  const loaded = readTodoBoard(cwd);

  assert.deepEqual(loaded, board);
});

test("repo todo board stays valid", () => {
  const result = inspectTodoBoard(process.cwd(), { branchName: "main" });

  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
});

test("todo board validator accepts a clean board", () => {
  assert.deepEqual(validateTodoBoard(validBoard(), { branchName: "main" }), []);
});

test("todo board validator rejects duplicate ids and titles", () => {
  const board = validBoard();
  board.items.push({
    id: "a",
    status: "later",
    title: "Do the current thing.",
    why: "Duplicate.",
    done_when: "Never.",
    review_state: "draft",
    changed_on: "2026-03-10"
  });

  const findings = validateTodoBoard(board);

  assert.ok(findings.some((finding) => finding.includes("Duplicate item id")));
  assert.ok(findings.some((finding) => finding.includes("Duplicate item title")));
});

test("todo board validator rejects too many now items", () => {
  const board = validBoard();
  board.items.push(
    {
      id: "d",
      status: "now",
      title: "Third now thing.",
      why: "Still okay.",
      done_when: "Done.",
      review_state: "needs_review",
      changed_on: "2026-03-10"
    },
    {
      id: "e",
      status: "now",
      title: "Fourth now thing.",
      why: "Too much.",
      done_when: "Done.",
      review_state: "needs_review",
      changed_on: "2026-03-10"
    },
    {
      id: "f",
      status: "now",
      title: "Fifth now thing.",
      why: "Definitely too much.",
      done_when: "Done.",
      review_state: "needs_review",
      changed_on: "2026-03-10"
    }
  );

  const findings = validateTodoBoard(board);

  assert.ok(findings.some((finding) => finding.includes("at most 3 now items")));
});

test("todo board validator rejects unordered statuses and draft now items", () => {
  const board = validBoard();
  board.items = [
    {
      id: "b",
      status: "next",
      title: "Next item first.",
      why: "Wrong order.",
      done_when: "Done.",
      review_state: "draft",
      changed_on: "2026-03-10"
    },
    {
      id: "a",
      status: "now",
      title: "Now item second.",
      why: "Wrong order.",
      done_when: "Done.",
      review_state: "draft",
      changed_on: "2026-03-10"
    },
    {
      id: "c",
      status: "later",
      title: "Later item third.",
      why: "Still present.",
      done_when: "Done.",
      review_state: "draft",
      changed_on: "2026-03-10"
    }
  ];

  const findings = validateTodoBoard(board);

  assert.ok(findings.some((finding) => finding.includes("status order")));
  assert.ok(findings.some((finding) => finding.includes("cannot stay in draft")));
});

test("todo board validator rejects unknown keys", () => {
  const board = validBoard();
  board.extra = true;
  board.direction.extra = true;
  board.limits.extra = 1;
  board.delivery.extra = true;
  board.items[0].extra = true;

  const findings = validateTodoBoard(board);

  assert.ok(findings.some((finding) => finding.includes("Unknown top-level key")));
  assert.ok(findings.some((finding) => finding.includes("Unknown direction key")));
  assert.ok(findings.some((finding) => finding.includes("Unknown limits key")));
  assert.ok(findings.some((finding) => finding.includes("Unknown delivery key")));
  assert.ok(findings.some((finding) => finding.includes("unknown key 'extra'")));
});

test("todo board inspection reports malformed JSON cleanly", () => {
  const cwd = createTempProject();
  writeFileSync(join(cwd, "todo.json"), "{ bad json");

  const result = inspectTodoBoard(cwd);

  assert.equal(result.ok, false);
  assert.ok(result.findings[0].includes("not valid JSON"));
});

test("todo board validator rejects stale clean reviews and oversized history", () => {
  const board = validBoard();
  board.items[0].review_state = "clean";
  board.items[0].reviewed_on = "2026-03-09";
  board.items[0].changed_on = "2026-03-10";
  board.items.push(
    {
      id: "d",
      status: "done",
      title: "Done one.",
      why: "History.",
      done_when: "Done.",
      review_state: "draft",
      changed_on: "2026-03-10"
    },
    {
      id: "e",
      status: "done",
      title: "Done two.",
      why: "History.",
      done_when: "Done.",
      review_state: "draft",
      changed_on: "2026-03-10"
    },
    {
      id: "f",
      status: "done",
      title: "Done three.",
      why: "History.",
      done_when: "Done.",
      review_state: "draft",
      changed_on: "2026-03-10"
    },
    {
      id: "g",
      status: "done",
      title: "Done four.",
      why: "History.",
      done_when: "Done.",
      review_state: "draft",
      changed_on: "2026-03-10"
    }
  );

  const findings = validateTodoBoard(board);

  assert.ok(findings.some((finding) => finding.includes("reviewed_on older than changed_on")));
  assert.ok(findings.some((finding) => finding.includes("at most 3 done items")));
});

test("todo board validator rejects missing limits without throwing", () => {
  const board = validBoard();
  delete board.limits;

  const findings = validateTodoBoard(board);

  assert.ok(findings.some((finding) => finding.includes("must contain a limits object")));
});

test("todo board validator rejects impossible calendar dates", () => {
  const board = validBoard();
  board.direction.last_changed = "2026-02-31";
  board.items[0].changed_on = "2026-02-30";

  const findings = validateTodoBoard(board);

  assert.ok(findings.some((finding) => finding.includes("Direction last_changed must use a real YYYY-MM-DD date.")));
  assert.ok(findings.some((finding) => finding.includes("changed_on in real YYYY-MM-DD format")));
});

test("todo board validator rejects missing planning horizon", () => {
  const board = validBoard();
  board.items = board.items.filter((item) => item.status !== "later");

  const findings = validateTodoBoard(board);

  assert.ok(findings.some((finding) => finding.includes("at least one later item")));
});

test("todo board validator enforces active branch mapping", () => {
  const board = validBoard();
  board.delivery.active_item_ids = ["a"];

  const findings = validateTodoBoard(board, {
    branchName: "codex/other-thing"
  });

  assert.ok(findings.some((finding) => finding.includes("must include active item id 'a'")));
});

test("todo board validator rejects active item ids on main", () => {
  const board = validBoard();
  board.delivery.active_item_ids = ["a"];

  const findings = validateTodoBoard(board, {
    branchName: "main"
  });

  assert.ok(findings.some((finding) => finding.includes("Main branch must not keep active delivery item ids")));
});
