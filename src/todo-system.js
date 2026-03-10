import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ALLOWED_STATUSES = new Set(["now", "next", "later", "done", "dropped"]);
const ALLOWED_REVIEW_STATES = new Set(["draft", "needs_review", "clean"]);
const ALLOWED_TOP_LEVEL_KEYS = new Set(["version", "direction", "limits", "delivery", "items"]);
const ALLOWED_DIRECTION_KEYS = new Set(["current_focus", "why_now", "last_changed"]);
const ALLOWED_LIMITS_KEYS = new Set([
  "max_now",
  "max_total_items",
  "max_done_items",
  "max_dropped_items",
  "max_text_chars"
]);
const ALLOWED_DELIVERY_KEYS = new Set(["one_pr_per_item", "max_active_pr_items", "rule"]);
const ALLOWED_ITEM_KEYS = new Set([
  "id",
  "status",
  "title",
  "why",
  "done_when",
  "review_state",
  "changed_on",
  "reviewed_on"
]);
const STATUS_ORDER = new Map([
  ["now", 0],
  ["next", 1],
  ["later", 2],
  ["done", 3],
  ["dropped", 4]
]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "").trim());
}

export function readTodoBoard(cwd = process.cwd()) {
  const filePath = resolve(cwd, "todo.json");
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function inspectTodoBoard(cwd = process.cwd()) {
  const filePath = resolve(cwd, "todo.json");
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    return {
      ok: false,
      board: null,
      findings: [`Could not read todo.json: ${error.message ?? String(error)}`]
    };
  }

  let board;
  try {
    board = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      board: null,
      findings: [`todo.json is not valid JSON: ${error.message ?? String(error)}`]
    };
  }

  const findings = validateTodoBoard(board);
  return {
    ok: findings.length === 0,
    board,
    findings
  };
}

export function validateTodoBoard(board) {
  const findings = [];

  if (!board || typeof board !== "object" || Array.isArray(board)) {
    return ["Todo board must be a JSON object."];
  }

  Object.keys(board).forEach((key) => {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      findings.push(`Unknown top-level key '${key}' in todo board.`);
    }
  });

  if (board.version !== 1) {
    findings.push("Todo board version must be 1.");
  }

  if (!board.direction || typeof board.direction !== "object" || Array.isArray(board.direction)) {
    findings.push("Todo board must contain a direction object.");
  } else {
    Object.keys(board.direction).forEach((key) => {
      if (!ALLOWED_DIRECTION_KEYS.has(key)) {
        findings.push(`Unknown direction key '${key}' in todo board.`);
      }
    });
    if (!isNonEmptyString(board.direction.current_focus)) {
      findings.push("Direction must include a non-empty current_focus.");
    }
    if (!isNonEmptyString(board.direction.why_now)) {
      findings.push("Direction must include a non-empty why_now.");
    }
    if (!isNonEmptyString(board.direction.last_changed)) {
      findings.push("Direction must include a non-empty last_changed.");
    } else if (!isIsoDate(board.direction.last_changed)) {
      findings.push("Direction last_changed must use YYYY-MM-DD format.");
    }
  }

  if (!board.limits || typeof board.limits !== "object" || Array.isArray(board.limits)) {
    findings.push("Todo board must contain a limits object.");
  } else {
    Object.keys(board.limits).forEach((key) => {
      if (!ALLOWED_LIMITS_KEYS.has(key)) {
        findings.push(`Unknown limits key '${key}' in todo board.`);
      }
    });
    if (!Number.isInteger(board.limits.max_now) || board.limits.max_now < 1) {
      findings.push("Todo board limits.max_now must be a positive integer.");
    }
    if (!Number.isInteger(board.limits.max_total_items) || board.limits.max_total_items < 1) {
      findings.push("Todo board limits.max_total_items must be a positive integer.");
    }
    if (!Number.isInteger(board.limits.max_done_items) || board.limits.max_done_items < 0) {
      findings.push("Todo board limits.max_done_items must be a non-negative integer.");
    }
    if (!Number.isInteger(board.limits.max_dropped_items) || board.limits.max_dropped_items < 0) {
      findings.push("Todo board limits.max_dropped_items must be a non-negative integer.");
    }
    if (!Number.isInteger(board.limits.max_text_chars) || board.limits.max_text_chars < 40) {
      findings.push("Todo board limits.max_text_chars must be an integer of at least 40.");
    }
  }

  if (!board.delivery || typeof board.delivery !== "object" || Array.isArray(board.delivery)) {
    findings.push("Todo board must contain a delivery object.");
  } else {
    Object.keys(board.delivery).forEach((key) => {
      if (!ALLOWED_DELIVERY_KEYS.has(key)) {
        findings.push(`Unknown delivery key '${key}' in todo board.`);
      }
    });
    if (board.delivery.one_pr_per_item !== true) {
      findings.push("Todo board delivery.one_pr_per_item must be true.");
    }
    if (
      !Number.isInteger(board.delivery.max_active_pr_items) ||
      board.delivery.max_active_pr_items < 1
    ) {
      findings.push("Todo board delivery.max_active_pr_items must be a positive integer.");
    }
    if (!isNonEmptyString(board.delivery.rule)) {
      findings.push("Todo board delivery.rule must be a non-empty string.");
    }
  }

  if (!Array.isArray(board.items) || board.items.length === 0) {
    findings.push("Todo board must contain at least one item.");
    return findings;
  }

  const seenIds = new Set();
  const seenTitles = new Set();
  let nowCount = 0;
  let doneCount = 0;
  let droppedCount = 0;
  let lastStatusOrder = -1;

  board.items.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      findings.push(`Item ${index + 1} must be an object.`);
      return;
    }

    Object.keys(item).forEach((key) => {
      if (!ALLOWED_ITEM_KEYS.has(key)) {
        findings.push(`Item '${item.id ?? index + 1}' has unknown key '${key}'.`);
      }
    });

    if (!isNonEmptyString(item.id)) {
      findings.push(`Item ${index + 1} must have a non-empty id.`);
    } else {
      const normalizedId = normalize(item.id);
      if (seenIds.has(normalizedId)) {
        findings.push(`Duplicate item id '${item.id}'.`);
      }
      seenIds.add(normalizedId);
    }

    if (!ALLOWED_STATUSES.has(item.status)) {
      findings.push(`Item '${item.id ?? index + 1}' has invalid status '${item.status}'.`);
    } else {
      const currentOrder = STATUS_ORDER.get(item.status);
      if (currentOrder < lastStatusOrder) {
        findings.push("Items must stay grouped in status order: now, next, later, done, dropped.");
      }
      lastStatusOrder = currentOrder;
      if (item.status === "now") {
        nowCount += 1;
      }
      if (item.status === "done") {
        doneCount += 1;
      }
      if (item.status === "dropped") {
        droppedCount += 1;
      }
    }

    if (!ALLOWED_REVIEW_STATES.has(item.review_state)) {
      findings.push(`Item '${item.id ?? index + 1}' has invalid review_state '${item.review_state}'.`);
    }

    if (!isNonEmptyString(item.title)) {
      findings.push(`Item '${item.id ?? index + 1}' must have a non-empty title.`);
    } else {
      const normalizedTitle = normalize(item.title);
      if (seenTitles.has(normalizedTitle)) {
        findings.push(`Duplicate item title '${item.title}'.`);
      }
      seenTitles.add(normalizedTitle);
      if (item.title.length > board.limits.max_text_chars) {
        findings.push(`Item '${item.id}' title exceeds max_text_chars.`);
      }
    }

    if (!isNonEmptyString(item.why)) {
      findings.push(`Item '${item.id ?? index + 1}' must have a non-empty why.`);
    } else if (item.why.length > board.limits.max_text_chars) {
      findings.push(`Item '${item.id}' why exceeds max_text_chars.`);
    }

    if (!isNonEmptyString(item.done_when)) {
      findings.push(`Item '${item.id ?? index + 1}' must have a non-empty done_when.`);
    } else if (item.done_when.length > board.limits.max_text_chars) {
      findings.push(`Item '${item.id}' done_when exceeds max_text_chars.`);
    }

    if (!isIsoDate(item.changed_on)) {
      findings.push(`Item '${item.id ?? index + 1}' must have changed_on in YYYY-MM-DD format.`);
    }

    if (item.status === "now" && item.review_state === "draft") {
      findings.push(`Now item '${item.id}' cannot stay in draft review state.`);
    }

    if (item.reviewed_on != null && item.reviewed_on !== "" && !isIsoDate(item.reviewed_on)) {
      findings.push(`Item '${item.id}' reviewed_on must use YYYY-MM-DD format when present.`);
    }

    if (item.review_state === "clean") {
      if (!isIsoDate(item.reviewed_on)) {
        findings.push(`Clean item '${item.id}' must have reviewed_on in YYYY-MM-DD format.`);
      } else if (item.reviewed_on < item.changed_on) {
        findings.push(`Clean item '${item.id}' cannot have reviewed_on older than changed_on.`);
      }
    }
  });

  if (nowCount > board.limits.max_now) {
    findings.push(`Todo board can have at most ${board.limits.max_now} now items, found ${nowCount}.`);
  }

  if (board.items.length > board.limits.max_total_items) {
    findings.push(
      `Todo board can have at most ${board.limits.max_total_items} total items, found ${board.items.length}.`
    );
  }

  if (doneCount > board.limits.max_done_items) {
    findings.push(
      `Todo board can have at most ${board.limits.max_done_items} done items, found ${doneCount}.`
    );
  }

  if (droppedCount > board.limits.max_dropped_items) {
    findings.push(
      `Todo board can have at most ${board.limits.max_dropped_items} dropped items, found ${droppedCount}.`
    );
  }

  return findings;
}
