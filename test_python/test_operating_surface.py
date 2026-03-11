import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


class OperatingSurfaceFreshnessTest(unittest.TestCase):
    def test_architecture_doc_replaces_old_path(self):
        self.assertTrue((ROOT / "docs" / "architecture.md").exists())
        self.assertFalse((ROOT / "docs" / "redesign.md").exists())
        self.assertFalse((ROOT / "src" / "context" / "project-context.js").exists())
        self.assertFalse((ROOT / "src" / "context" / "print-project-context.mjs").exists())

    def test_core_operating_files_do_not_slip_back_to_transition_language(self):
        stale_terms = [
            "worldbuilding rebuild",
            "rebuild contract",
            "being rebuilt from first principles",
            "what survives the rebuild",
            "what does not survive the rebuild",
            "docs/redesign.md",
            "first-principles redesign",
            "project context loading",
            "project context loader",
            "print-project-context",
        ]
        files = [
            ROOT / "AGENTS.md",
            ROOT / "README.md",
            ROOT / "progress.md",
            ROOT / "docs" / "architecture.md",
        ]

        for file_path in files:
            text = file_path.read_text(encoding="utf-8").lower()
            for term in stale_terms:
                self.assertNotIn(term, text, f"{file_path} still contains stale term: {term}")

    def test_operating_contract_points_to_current_architecture_doc(self):
        agents_text = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        self.assertIn("docs/architecture.md", agents_text)


if __name__ == "__main__":
    unittest.main()
