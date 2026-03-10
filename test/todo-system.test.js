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
      max_total_items: 9
    },
    delivery: {
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
        done_when: "It is clearly done."
      },
      {
        id: "b",
        status: "next",
        title: "Do the next thing.",
        why: "It comes after.",
        done_when: "It is ready."
      },
      {
        id: "c",
        status: "later",
        title: "Do the later thing.",
        why: "It keeps the horizon visible.",
        done_when: "It is still clearly defined."
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

test("todo board inspection reports malformed JSON cleanly", () => {
  const cwd = createTempProject();
  writeFileSync(join(cwd, "todo.json"), "{ bad json");

  const result = inspectTodoBoard(cwd);

  assert.equal(result.ok, false);
  assert.ok(result.findings[0].includes("not valid JSON"));
});

test("todo board validator rejects duplicate ids", () => {
  const board = validBoard();
  board.items.push({
    id: "a",
    status: "later",
    title: "Different title.",
    why: "Duplicate.",
    done_when: "Never."
  });

  const findings = validateTodoBoard(board);

  assert.ok(findings.some((finding) => finding.includes("Duplicate item id")));
});

test("todo board validator rejects too many now items", () => {
  const board = validBoard();
  board.items.push(
    {
      id: "d",
      status: "now",
      title: "Third now thing.",
      why: "Still okay.",
      done_when: "Done."
    },
    {
      id: "e",
      status: "now",
      title: "Fourth now thing.",
      why: "Too much.",
      done_when: "Done."
    },
    {
      id: "f",
      status: "now",
      title: "Fifth now thing.",
      why: "Definitely too much.",
      done_when: "Done."
    }
  );

  const findings = validateTodoBoard(board);

  assert.ok(findings.some((finding) => finding.includes("at most 3 now items")));
});

test("todo board validator rejects missing planning horizon", () => {
  const board = validBoard();
  board.items = board.items.filter((item) => item.status !== "later");

  const findings = validateTodoBoard(board);

  assert.ok(findings.some((finding) => finding.includes("at least one later item")));
});

test("todo board validator rejects impossible calendar dates", () => {
  const board = validBoard();
  board.direction.last_changed = "2026-02-31";

  const findings = validateTodoBoard(board);

  assert.ok(findings.some((finding) => finding.includes("real YYYY-MM-DD date")));
});

test("todo board validator rejects missing limits without throwing", () => {
  const board = validBoard();
  delete board.limits;

  const findings = validateTodoBoard(board);

  assert.ok(findings.some((finding) => finding.includes("must contain a limits object")));
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

test("todo board validator requires coupled reason for two active ids", () => {
  const board = validBoard();
  board.items.push({
    id: "d",
    status: "now",
    title: "Second active item.",
    why: "Coupled work.",
    done_when: "Done."
  });
  board.delivery.active_item_ids = ["a", "d"];

  const findings = validateTodoBoard(board, {
    branchName: "codex/a-d"
  });

  assert.ok(findings.some((finding) => finding.includes("coupled_reason is required")));
});
