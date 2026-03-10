import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ALLOWED_STATUSES = new Set(["now", "next", "later", "done", "dropped"]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isRealIsoDate(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return false;
  }

  const [yearText, monthText, dayText] = text.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

export function readTodoBoard(cwd = process.cwd()) {
  const filePath = resolve(cwd, "todo.json");
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function inspectTodoBoard(cwd = process.cwd(), { branchName = null } = {}) {
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

  const findings = validateTodoBoard(board, { branchName });
  return {
    ok: findings.length === 0,
    board,
    findings
  };
}

export function validateTodoBoard(board, { branchName = null } = {}) {
  const findings = [];

  if (!board || typeof board !== "object" || Array.isArray(board)) {
    return ["Todo board must be a JSON object."];
  }

  if (board.version !== 1) {
    findings.push("Todo board version must be 1.");
  }

  if (!board.direction || typeof board.direction !== "object" || Array.isArray(board.direction)) {
    findings.push("Todo board must contain a direction object.");
  } else {
    if (!isNonEmptyString(board.direction.current_focus)) {
      findings.push("Direction must include a non-empty current_focus.");
    }
    if (!isNonEmptyString(board.direction.why_now)) {
      findings.push("Direction must include a non-empty why_now.");
    }
    if (!isRealIsoDate(board.direction.last_changed)) {
      findings.push("Direction last_changed must use a real YYYY-MM-DD date.");
    }
  }

  if (!board.limits || typeof board.limits !== "object" || Array.isArray(board.limits)) {
    findings.push("Todo board must contain a limits object.");
  } else {
    if (!positiveInteger(board.limits.max_now)) {
      findings.push("Todo board limits.max_now must be a positive integer.");
    }
    if (!positiveInteger(board.limits.max_total_items)) {
      findings.push("Todo board limits.max_total_items must be a positive integer.");
    }
  }

  if (!board.delivery || typeof board.delivery !== "object" || Array.isArray(board.delivery)) {
    findings.push("Todo board must contain a delivery object.");
  } else {
    if (!Array.isArray(board.delivery.active_item_ids)) {
      findings.push("Todo board delivery.active_item_ids must be an array.");
    }
    if (typeof board.delivery.coupled_reason !== "string") {
      findings.push("Todo board delivery.coupled_reason must be a string.");
    }
    if (!isNonEmptyString(board.delivery.rule)) {
      findings.push("Todo board delivery.rule must be a non-empty string.");
    }
  }

  if (!Array.isArray(board.items) || board.items.length === 0) {
    findings.push("Todo board must contain at least one item.");
    return findings;
  }

  const maxNow = positiveInteger(board?.limits?.max_now) ? board.limits.max_now : null;
  const maxTotalItems = positiveInteger(board?.limits?.max_total_items)
    ? board.limits.max_total_items
    : null;

  const itemById = new Map();
  const seenIds = new Set();
  let nowCount = 0;
  let nextCount = 0;
  let laterCount = 0;

  for (const [index, item] of board.items.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      findings.push(`Item ${index + 1} must be an object.`);
      continue;
    }

    if (!isNonEmptyString(item.id)) {
      findings.push(`Item ${index + 1} must have a non-empty id.`);
    } else if (seenIds.has(item.id)) {
      findings.push(`Duplicate item id '${item.id}'.`);
    } else {
      seenIds.add(item.id);
      itemById.set(item.id, item);
    }

    if (!ALLOWED_STATUSES.has(item.status)) {
      findings.push(`Item '${item.id ?? index + 1}' has invalid status '${item.status}'.`);
    } else {
      if (item.status === "now") {
        nowCount += 1;
      }
      if (item.status === "next") {
        nextCount += 1;
      }
      if (item.status === "later") {
        laterCount += 1;
      }
    }

    if (!isNonEmptyString(item.title)) {
      findings.push(`Item '${item.id ?? index + 1}' must have a non-empty title.`);
    }
    if (!isNonEmptyString(item.why)) {
      findings.push(`Item '${item.id ?? index + 1}' must have a non-empty why.`);
    }
    if (!isNonEmptyString(item.done_when)) {
      findings.push(`Item '${item.id ?? index + 1}' must have a non-empty done_when.`);
    }
  }

  if (nowCount === 0) {
    findings.push("Todo board must contain at least one now item.");
  }
  if (nextCount === 0) {
    findings.push("Todo board must contain at least one next item.");
  }
  if (laterCount === 0) {
    findings.push("Todo board must contain at least one later item.");
  }

  if (maxNow !== null && nowCount > maxNow) {
    findings.push(`Todo board can have at most ${maxNow} now items, found ${nowCount}.`);
  }
  if (maxTotalItems !== null && board.items.length > maxTotalItems) {
    findings.push(`Todo board can have at most ${maxTotalItems} total items, found ${board.items.length}.`);
  }

  if (Array.isArray(board?.delivery?.active_item_ids)) {
    const activeIds = board.delivery.active_item_ids;
    const activeIdSet = new Set();

    for (const id of activeIds) {
      if (!isNonEmptyString(id)) {
        findings.push("Todo board delivery.active_item_ids cannot contain empty ids.");
        continue;
      }
      if (activeIdSet.has(id)) {
        findings.push(`Todo board delivery.active_item_ids contains duplicate id '${id}'.`);
        continue;
      }
      activeIdSet.add(id);

      const item = itemById.get(id);
      if (!item) {
        findings.push(`Todo board delivery.active_item_ids references unknown item '${id}'.`);
        continue;
      }
      if (item.status !== "now") {
        findings.push(`Active delivery item '${id}' must be in now status.`);
      }
    }

    if (activeIds.length > 2) {
      findings.push("Todo board delivery.active_item_ids can contain at most 2 items.");
    }

    if (activeIds.length > 1 && !isNonEmptyString(board.delivery.coupled_reason)) {
      findings.push("Todo board delivery.coupled_reason is required when more than one active item id is selected.");
    }

    if (activeIds.length <= 1 && isNonEmptyString(board.delivery.coupled_reason)) {
      findings.push("Todo board delivery.coupled_reason must be empty unless more than one active item id is selected.");
    }

    if (branchName && branchName !== "main") {
      if (activeIds.length === 0) {
        findings.push("Non-main branches must declare at least one active delivery item id.");
      }
      for (const id of activeIds) {
        if (!branchName.includes(id)) {
          findings.push(`Branch '${branchName}' must include active item id '${id}'.`);
        }
      }
    }

    if (branchName === "main" && activeIds.length > 0) {
      findings.push("Main branch must not keep active delivery item ids after work is merged.");
    }
  }

  return findings;
}
