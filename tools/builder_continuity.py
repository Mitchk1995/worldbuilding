"""Builder continuity utilities.

This keeps the adapted Hermes-derived memory module in sync with the repo root
AGENTS.md so new Codex chats inherit the same small builder-continuity snapshot.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Dict, Optional

from tools.memory_tool import MemoryStore


ROOT_DIR = Path(__file__).resolve().parent.parent
HERMES_HOME = Path(os.getenv("HERMES_HOME", Path.home() / ".hermes"))
UPSTREAM_SOURCE_FILE = HERMES_HOME / "UPSTREAM_SOURCE.txt"
AGENTS_FILE = ROOT_DIR / "AGENTS.md"
SNAPSHOT_START = "<!-- BEGIN AUTO-GENERATED BUILDER CONTINUITY -->"
SNAPSHOT_END = "<!-- END AUTO-GENERATED BUILDER CONTINUITY -->"


def resolve_upstream_source_path() -> Optional[Path]:
    """Return the recorded Hermes source path if one has been pinned locally."""
    if os.getenv("HERMES_SOURCE_DIR"):
        candidate = Path(os.environ["HERMES_SOURCE_DIR"]).expanduser()
        return candidate if candidate.exists() else None

    if not UPSTREAM_SOURCE_FILE.exists():
        return None

    try:
        raw = UPSTREAM_SOURCE_FILE.read_text(encoding="utf-8-sig").strip()
    except OSError:
        return None

    if not raw:
        return None

    candidate = Path(raw).expanduser()
    return candidate if candidate.exists() else None


def builder_continuity_status() -> Dict[str, object]:
    """Summarize whether the Hermes-to-AGENTS continuity pieces are wired."""
    store = MemoryStore()
    store.load_from_disk()
    memory_path = HERMES_HOME / "memories" / "MEMORY.md"
    user_path = HERMES_HOME / "memories" / "USER.md"
    upstream_path = resolve_upstream_source_path()
    expected_snapshot = build_agents_snapshot_section()
    current_snapshot = read_agents_snapshot_section()

    return {
        "hermes_home": str(HERMES_HOME),
        "memory_file": str(memory_path),
        "memory_file_exists": memory_path.exists(),
        "user_file": str(user_path),
        "user_file_exists": user_path.exists(),
        "memory_snapshot_loaded": bool(store.format_for_system_prompt("memory")),
        "user_snapshot_loaded": bool(store.format_for_system_prompt("user")),
        "upstream_source_file": str(UPSTREAM_SOURCE_FILE),
        "upstream_source_path": str(upstream_path) if upstream_path else None,
        "agents_file": str(AGENTS_FILE),
        "agents_snapshot_present": current_snapshot is not None,
        "agents_snapshot_synced": current_snapshot == expected_snapshot,
    }


def build_agents_snapshot_section() -> str:
    """Render the auto-generated AGENTS snapshot from Hermes memory only."""
    store = MemoryStore()
    store.load_from_disk()

    blocks = []
    memory_block = store._render_block("memory", store.memory_entries)
    if memory_block:
        blocks.append(memory_block)

    user_block = store._render_block("user", store.user_entries)
    if user_block:
        blocks.append(user_block)

    snapshot_body = "\n\n".join(blocks) if blocks else "(No Hermes memory snapshot is currently available.)"
    return (
        f"{SNAPSHOT_START}\n"
        "## Auto-Generated Builder Continuity Snapshot\n\n"
        "This section is auto-generated from Hermes MEMORY.md and USER.md so new Codex chats "
        "get the same small builder-continuity snapshot automatically. Treat it as builder "
        "continuity only, never as world canon. Do not edit it by hand.\n\n"
        f"{snapshot_body}\n"
        f"{SNAPSHOT_END}"
    )


def read_agents_snapshot_section() -> Optional[str]:
    """Return the existing auto-generated AGENTS snapshot block, if present."""
    if not AGENTS_FILE.exists():
        return None

    text = AGENTS_FILE.read_text(encoding="utf-8")
    start = text.find(SNAPSHOT_START)
    end = text.find(SNAPSHOT_END)
    if start == -1 or end == -1 or end < start:
        return None
    end += len(SNAPSHOT_END)
    return text[start:end].strip()


def sync_agents_snapshot() -> None:
    """Materialize the Hermes memory snapshot into AGENTS.md for Codex auto-load."""
    if not AGENTS_FILE.exists():
        raise FileNotFoundError(f"AGENTS file not found: {AGENTS_FILE}")

    text = AGENTS_FILE.read_text(encoding="utf-8").rstrip()
    snapshot = build_agents_snapshot_section()

    current = None
    start = text.find(SNAPSHOT_START)
    end = text.find(SNAPSHOT_END)
    if start != -1 and end != -1 and end >= start:
        end += len(SNAPSHOT_END)
        current = text[start:end].strip()

    if current is None:
        new_text = f"{text}\n\n{snapshot}\n" if text else f"{snapshot}\n"
    else:
        new_text = text.replace(current, snapshot).rstrip() + "\n"

    AGENTS_FILE.write_text(new_text, encoding="utf-8")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Builder continuity utilities.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("status", help="Print builder continuity wiring status as JSON.")
    subparsers.add_parser("sync-agents", help="Sync the Hermes memory snapshot into AGENTS.md.")

    return parser.parse_args()


def main() -> int:
    args = _parse_args()

    if args.command == "status":
        print(json.dumps(builder_continuity_status(), indent=2))
        return 0

    if args.command == "sync-agents":
        sync_agents_snapshot()
        print(f"Synced builder continuity snapshot into {AGENTS_FILE}")
        return 0

    raise AssertionError(f"Unhandled command: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
