#!/usr/bin/env python3

import json
import sys
from datetime import date
from pathlib import Path

ALLOWED_STATUSES = {"now", "next", "later", "done", "dropped"}


def is_non_empty_string(value):
    return isinstance(value, str) and bool(value.strip())


def is_real_iso_date(value):
    text = str(value or "").strip()
    if len(text) != 10:
        return False
    try:
        year_text, month_text, day_text = text.split("-")
        parsed = date(int(year_text), int(month_text), int(day_text))
        return parsed.isoformat() == text
    except Exception:
        return False


def positive_integer(value):
    return isinstance(value, int) and value > 0


def read_todo_board(cwd="."):
    return json.loads((Path(cwd) / "todo.json").read_text(encoding="utf-8"))


def validate_todo_board(board):
    findings = []

    if not isinstance(board, dict):
        return ["Todo board must be a JSON object."]

    direction = board.get("direction")
    if not isinstance(direction, dict):
        findings.append("Todo board must contain a direction object.")
    else:
        if not is_non_empty_string(direction.get("current_focus")):
            findings.append("Direction must include a non-empty current_focus.")
        if not is_non_empty_string(direction.get("why_now")):
            findings.append("Direction must include a non-empty why_now.")
        if not is_real_iso_date(direction.get("last_changed")):
            findings.append("Direction last_changed must use a real YYYY-MM-DD date.")

    limits = board.get("limits")
    if not isinstance(limits, dict):
        findings.append("Todo board must contain a limits object.")
        max_now = None
        max_total_items = None
    else:
        max_now = limits.get("max_now")
        max_total_items = limits.get("max_total_items")
        if not positive_integer(max_now):
            findings.append("Todo board limits.max_now must be a positive integer.")
            max_now = None
        if not positive_integer(max_total_items):
            findings.append("Todo board limits.max_total_items must be a positive integer.")
            max_total_items = None

    delivery = board.get("delivery")
    if not isinstance(delivery, dict):
        findings.append("Todo board must contain a delivery object.")
        active_ids = None
        coupled_reason = ""
    else:
        active_ids = delivery.get("active_item_ids")
        coupled_reason = delivery.get("coupled_reason", "")
        if not isinstance(active_ids, list):
            findings.append("Todo board delivery.active_item_ids must be an array.")
            active_ids = None
        if not isinstance(coupled_reason, str):
            findings.append("Todo board delivery.coupled_reason must be a string.")
            coupled_reason = ""

    items = board.get("items")
    if not isinstance(items, list) or not items:
        findings.append("Todo board must contain at least one item.")
        return findings

    seen_ids = set()
    item_by_id = {}
    now_count = 0
    next_count = 0
    later_count = 0

    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            findings.append(f"Item {index} must be an object.")
            continue

        item_id = item.get("id")
        if not is_non_empty_string(item_id):
            findings.append(f"Item {index} must have a non-empty id.")
        elif item_id in seen_ids:
            findings.append(f"Duplicate item id '{item_id}'.")
        else:
            seen_ids.add(item_id)
            item_by_id[item_id] = item

        status = item.get("status")
        if status not in ALLOWED_STATUSES:
            findings.append(f"Item '{item_id or index}' has invalid status '{status}'.")
        elif status == "now":
            now_count += 1
        elif status == "next":
            next_count += 1
        elif status == "later":
            later_count += 1

        if not is_non_empty_string(item.get("title")):
            findings.append(f"Item '{item_id or index}' must have a non-empty title.")
        if not is_non_empty_string(item.get("why")):
            findings.append(f"Item '{item_id or index}' must have a non-empty why.")
        if not is_non_empty_string(item.get("done_when")):
            findings.append(f"Item '{item_id or index}' must have a non-empty done_when.")

    now_item_ids = {
        item_id
        for item_id, item in item_by_id.items()
        if item.get("status") == "now"
    }

    if now_count == 0:
        findings.append("Todo board must contain at least one now item.")
    if next_count == 0:
        findings.append("Todo board must contain at least one next item.")
    if later_count == 0:
        findings.append("Todo board must contain at least one later item.")

    if max_now is not None and now_count > max_now:
        findings.append(f"Todo board can have at most {max_now} now items, found {now_count}.")
    if max_total_items is not None and len(items) > max_total_items:
        findings.append(
            f"Todo board can have at most {max_total_items} total items, found {len(items)}."
        )

    if active_ids is not None:
        if len(active_ids) == 0:
            findings.append(
                "Todo board delivery.active_item_ids must contain at least one active item id."
            )
        active_id_set = set()
        for item_id in active_ids:
            if not is_non_empty_string(item_id):
                findings.append("Todo board delivery.active_item_ids cannot contain empty ids.")
                continue
            if item_id in active_id_set:
                findings.append(
                    f"Todo board delivery.active_item_ids contains duplicate id '{item_id}'."
                )
                continue
            active_id_set.add(item_id)

            item = item_by_id.get(item_id)
            if item is None:
                findings.append(
                    f"Todo board delivery.active_item_ids references unknown item '{item_id}'."
                )
                continue
            if item.get("status") != "now":
                findings.append(f"Active delivery item '{item_id}' must be in now status.")

        if len(active_ids) > 2:
            findings.append("Todo board delivery.active_item_ids can contain at most 2 items.")
        if len(active_ids) > 1 and not is_non_empty_string(coupled_reason):
            findings.append(
                "Todo board delivery.coupled_reason is required when more than one active item id is selected."
            )
        if len(active_ids) <= 1 and is_non_empty_string(coupled_reason):
            findings.append(
                "Todo board delivery.coupled_reason must be empty unless more than one active item id is selected."
            )
        if active_id_set != now_item_ids:
            missing_active = sorted(now_item_ids - active_id_set)
            extra_active = sorted(active_id_set - now_item_ids)
            if missing_active:
                findings.append(
                    "Every now item must appear in delivery.active_item_ids: "
                    + ", ".join(missing_active)
                )
            if extra_active:
                findings.append(
                    "delivery.active_item_ids cannot include items that are not in now status: "
                    + ", ".join(extra_active)
                )

    return findings


def inspect_todo_board(cwd="."):
    todo_path = Path(cwd) / "todo.json"
    try:
        raw = todo_path.read_text(encoding="utf-8")
    except Exception as error:
        return {"ok": False, "board": None, "findings": [f"Could not read todo.json: {error}"]}

    try:
        board = json.loads(raw)
    except Exception as error:
        return {"ok": False, "board": None, "findings": [f"todo.json is not valid JSON: {error}"]}

    findings = validate_todo_board(board)
    return {"ok": not findings, "board": board, "findings": findings}


def main():
    result = inspect_todo_board(Path.cwd())
    if result["ok"]:
        print("todo.json is clean")
        return 0

    for finding in result["findings"]:
        print(finding, file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
