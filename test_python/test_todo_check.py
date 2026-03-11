import json
import tempfile
import unittest
from pathlib import Path

from tools.todo_check import inspect_todo_board, read_todo_board, validate_todo_board


def valid_board():
    return {
        "direction": {
            "current_focus": "Keep the operating surface clean.",
            "why_now": "Planning drift creates slop.",
            "last_changed": "2026-03-10",
        },
        "limits": {
            "max_now": 3,
            "max_total_items": 9,
        },
        "delivery": {
            "active_item_ids": ["a"],
            "coupled_reason": "",
        },
        "items": [
            {
                "id": "a",
                "status": "now",
                "title": "Do the current thing.",
                "why": "It matters now.",
                "done_when": "It is clearly done.",
            },
            {
                "id": "b",
                "status": "next",
                "title": "Do the next thing.",
                "why": "It comes after.",
                "done_when": "It is ready.",
            },
            {
                "id": "c",
                "status": "later",
                "title": "Do the later thing.",
                "why": "It keeps the horizon visible.",
                "done_when": "It is still clearly defined.",
            },
        ],
    }


class TodoCheckTest(unittest.TestCase):
    def test_reader_loads_board(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            board = valid_board()
            Path(temp_dir, "todo.json").write_text(json.dumps(board), encoding="utf-8")
            self.assertEqual(read_todo_board(temp_dir), board)

    def test_inspection_reports_bad_json(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            Path(temp_dir, "todo.json").write_text("{ bad json", encoding="utf-8")
            result = inspect_todo_board(temp_dir)
            self.assertFalse(result["ok"])
            self.assertIn("not valid JSON", result["findings"][0])

    def test_validator_accepts_clean_board(self):
        self.assertEqual(validate_todo_board(valid_board()), [])

    def test_validator_rejects_duplicate_ids(self):
        board = valid_board()
        board["items"].append(
            {
                "id": "a",
                "status": "later",
                "title": "Different title.",
                "why": "Duplicate.",
                "done_when": "Never.",
            }
        )
        findings = validate_todo_board(board)
        self.assertTrue(any("Duplicate item id" in finding for finding in findings))

    def test_validator_rejects_too_many_now_items(self):
        board = valid_board()
        board["items"].extend(
            [
                {"id": "d", "status": "now", "title": "Third", "why": "x", "done_when": "x"},
                {"id": "e", "status": "now", "title": "Fourth", "why": "x", "done_when": "x"},
                {"id": "f", "status": "now", "title": "Fifth", "why": "x", "done_when": "x"},
            ]
        )
        findings = validate_todo_board(board)
        self.assertTrue(any("at most 3 now items" in finding for finding in findings))

    def test_validator_rejects_missing_horizon(self):
        board = valid_board()
        board["items"] = [item for item in board["items"] if item["status"] != "later"]
        findings = validate_todo_board(board)
        self.assertTrue(any("at least one later item" in finding for finding in findings))

    def test_validator_rejects_bad_date(self):
        board = valid_board()
        board["direction"]["last_changed"] = "2026-02-31"
        findings = validate_todo_board(board)
        self.assertTrue(any("real YYYY-MM-DD date" in finding for finding in findings))

    def test_validator_rejects_missing_limits_without_throwing(self):
        board = valid_board()
        del board["limits"]
        findings = validate_todo_board(board)
        self.assertTrue(any("must contain a limits object" in finding for finding in findings))

    def test_validator_rejects_unknown_active_items(self):
        board = valid_board()
        board["delivery"]["active_item_ids"] = ["missing"]
        findings = validate_todo_board(board)
        self.assertTrue(any("references unknown item 'missing'" in finding for finding in findings))

    def test_validator_requires_an_active_item(self):
        board = valid_board()
        board["delivery"]["active_item_ids"] = []
        findings = validate_todo_board(board)
        self.assertTrue(any("must contain at least one active item id" in finding for finding in findings))

    def test_validator_rejects_non_now_active_items(self):
        board = valid_board()
        board["delivery"]["active_item_ids"] = ["b"]
        findings = validate_todo_board(board)
        self.assertTrue(any("must be in now status" in finding for finding in findings))

    def test_validator_requires_all_now_items_to_be_active(self):
        board = valid_board()
        board["items"].append(
            {
                "id": "d",
                "status": "now",
                "title": "Second active item.",
                "why": "Still current work.",
                "done_when": "Done.",
            }
        )
        findings = validate_todo_board(board)
        self.assertTrue(any("Every now item must appear" in finding for finding in findings))

    def test_validator_requires_coupled_reason(self):
        board = valid_board()
        board["items"].append(
            {
                "id": "d",
                "status": "now",
                "title": "Second active item.",
                "why": "Coupled work.",
                "done_when": "Done.",
            }
        )
        board["delivery"]["active_item_ids"] = ["a", "d"]
        findings = validate_todo_board(board)
        self.assertTrue(any("coupled_reason is required" in finding for finding in findings))


if __name__ == "__main__":
    unittest.main()
