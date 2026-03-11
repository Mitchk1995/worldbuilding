import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tools import builder_continuity
from tools import memory_tool as memory_tool_module
from tools.memory_tool import MemoryStore


class BuilderContinuityTestCase(unittest.TestCase):
    def setUp(self):
        self.project_dir = tempfile.TemporaryDirectory()
        self.memory_dir = tempfile.TemporaryDirectory()
        self.project_path = Path(self.project_dir.name)
        self.memory_path = Path(self.memory_dir.name)
        self.agents_path = self.project_path / "AGENTS.md"
        self.memory_patcher = patch.object(memory_tool_module, "MEMORY_DIR", self.memory_path)
        self.memory_patcher.start()
        self.agents_patcher = patch.object(builder_continuity, "AGENTS_FILE", self.agents_path)
        self.agents_patcher.start()

    def tearDown(self):
        self.agents_patcher.stop()
        self.memory_patcher.stop()
        self.project_dir.cleanup()
        self.memory_dir.cleanup()

    def test_combined_prompt_includes_memory_user_and_context(self):
        (self.project_path / "AGENTS.md").write_text("Root instructions.", encoding="utf-8")
        (self.project_path / "SOUL.md").write_text("Be warm and direct.", encoding="utf-8")

        store = MemoryStore()
        store.load_from_disk()
        store.add("memory", "Builder continuity lives in Hermes memory.")
        store.add("user", "Prefers plain English.")

        prompt = builder_continuity.build_builder_continuity_prompt(cwd=str(self.project_path))

        self.assertIn("MEMORY (your personal notes)", prompt)
        self.assertIn("Builder continuity lives in Hermes memory.", prompt)
        self.assertIn("USER PROFILE (who the user is)", prompt)
        self.assertIn("Prefers plain English.", prompt)
        self.assertIn("# Project Context", prompt)
        self.assertIn("Root instructions.", prompt)
        self.assertIn("If SOUL.md is present, embody its persona and tone.", prompt)
        self.assertIn("Be warm and direct.", prompt)

    def test_sync_agents_materializes_memory_snapshot(self):
        self.agents_path.write_text("Base instructions.\n", encoding="utf-8")

        store = MemoryStore()
        store.load_from_disk()
        store.add("memory", "Persist the build continuity only.")
        store.add("user", "Prefers plain English.")

        builder_continuity.sync_agents_snapshot()
        agents_text = self.agents_path.read_text(encoding="utf-8")

        self.assertIn(builder_continuity.SNAPSHOT_START, agents_text)
        self.assertIn("Persist the build continuity only.", agents_text)
        self.assertIn("Prefers plain English.", agents_text)
        self.assertIn(builder_continuity.SNAPSHOT_END, agents_text)

    def test_sync_agents_replaces_legacy_snapshot(self):
        self.agents_path.write_text(
            "Base instructions.\n\n"
            "- After Hermes memory changes or continuity fixes, run `python -m tools.builder_continuity sync-agents` so new Codex chats get the fresh auto-loaded snapshot.\n\n"
            "## AUTO-GENERATED BUILDER CONTINUITY SNAPSHOT - START\nlegacy\n## AUTO-GENERATED BUILDER CONTINUITY SNAPSHOT - END\n",
            encoding="utf-8",
        )

        store = MemoryStore()
        store.load_from_disk()
        store.add("memory", "Fresh snapshot.")

        builder_continuity.sync_agents_snapshot()
        agents_text = self.agents_path.read_text(encoding="utf-8")

        self.assertNotIn("legacy", agents_text)
        self.assertNotIn("sync-agents", agents_text)
        self.assertIn("Fresh snapshot.", agents_text)

    def test_status_reports_synced_agents_snapshot(self):
        self.agents_path.write_text("Base instructions.\n", encoding="utf-8")

        store = MemoryStore()
        store.load_from_disk()
        store.add("memory", "Builder note.")

        builder_continuity.sync_agents_snapshot()
        status = builder_continuity.builder_continuity_status(cwd=str(self.project_path))

        self.assertTrue(status["agents_snapshot_present"])
        self.assertTrue(status["agents_snapshot_synced"])


if __name__ == "__main__":
    unittest.main()
