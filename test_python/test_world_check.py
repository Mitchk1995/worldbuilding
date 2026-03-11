import tempfile
import unittest
from pathlib import Path

from tools.world_check import inspect_world_directory


class WorldCheckTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.world_dir = Path(self.temp_dir.name) / "world"
        self.world_dir.mkdir()

    def tearDown(self):
        self.temp_dir.cleanup()

    def write_world_file(self, relative_path: str, content: str):
        path = self.world_dir / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def build_valid_foundation_tree(self):
        self.write_world_file(
            "INDEX.md",
            "# World Index\n\n## Current sections\n- `foundation/INDEX.md`: pre-canon world design\n",
        )
        self.write_world_file(
            "foundation/INDEX.md",
            "# Foundation Index\n\n## Files\n- `premise.md`: foundation note\n",
        )
        self.write_world_file("foundation/premise.md", "# Premise\n\nShort note.\n")

    def test_valid_world_tree_passes(self):
        self.build_valid_foundation_tree()

        self.assertEqual(inspect_world_directory(self.world_dir), [])

    def test_missing_nearest_index_listing_fails(self):
        self.build_valid_foundation_tree()
        self.write_world_file("foundation/extra.md", "# Extra\n\nUnlisted note.\n")

        findings = inspect_world_directory(self.world_dir)

        self.assertTrue(
            any("foundation/extra.md is not listed in its nearest index foundation/INDEX.md." == finding for finding in findings)
        )

    def test_missing_index_target_fails(self):
        self.write_world_file(
            "INDEX.md",
            "# World Index\n\n## Current sections\n- `foundation/INDEX.md`: pre-canon world design\n",
        )
        self.write_world_file(
            "foundation/INDEX.md",
            "# Foundation Index\n\n## Files\n- `missing.md`: missing file\n",
        )

        findings = inspect_world_directory(self.world_dir)

        self.assertTrue(any("points to a missing file: missing.md" in finding for finding in findings))

    def test_nested_directory_without_its_own_index_fails(self):
        self.write_world_file(
            "INDEX.md",
            "# World Index\n\n## Current sections\n- `foundation/INDEX.md`: pre-canon world design\n",
        )
        self.write_world_file(
            "foundation/INDEX.md",
            "# Foundation Index\n\n## Files\n- `regions/place.md`: nested file\n",
        )
        self.write_world_file("foundation/regions/place.md", "# Place\n\nNested note.\n")

        findings = inspect_world_directory(self.world_dir)

        self.assertTrue(any("foundation/regions/place.md lives in foundation/regions/, but that directory has no INDEX.md." in finding for finding in findings))

    def test_long_markdown_file_without_exception_fails(self):
        self.build_valid_foundation_tree()
        long_body = "\n".join(f"line {number}" for number in range(1, 103))
        self.write_world_file(
            "foundation/INDEX.md",
            "# Foundation Index\n\n## Files\n- `premise.md`: foundation note\n- `long.md`: long file\n",
        )
        self.write_world_file("foundation/long.md", long_body)

        findings = inspect_world_directory(self.world_dir)

        self.assertTrue(any("foundation/long.md has 102 lines, over the 100-line limit." in finding for finding in findings))

    def test_long_markdown_file_with_explicit_exception_passes(self):
        self.build_valid_foundation_tree()
        lines = ["<!-- world-check: max-lines=110 -->"] + [f"line {number}" for number in range(1, 106)]
        self.write_world_file(
            "foundation/INDEX.md",
            "# Foundation Index\n\n## Files\n- `premise.md`: foundation note\n- `long.md`: long file\n",
        )
        self.write_world_file("foundation/long.md", "\n".join(lines))

        self.assertEqual(inspect_world_directory(self.world_dir), [])

    def test_canon_directory_uses_general_checks_without_breaking(self):
        self.write_world_file(
            "INDEX.md",
            "# World Index\n\n## Current sections\n- `canon/INDEX.md`: approved world truth\n",
        )
        self.write_world_file(
            "canon/INDEX.md",
            "# Canon Index\n\n## Files\n- `places.md`: approved places\n",
        )
        self.write_world_file("canon/places.md", "# Places\n\nApproved place.\n")

        self.assertEqual(inspect_world_directory(self.world_dir), [])


if __name__ == "__main__":
    unittest.main()
