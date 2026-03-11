"""Small structural guardrails for the world/ tree."""

from __future__ import annotations

import argparse
import posixpath
import re
from dataclasses import dataclass
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
WORLD_DIR = ROOT_DIR / "world"
DEFAULT_MAX_LINES = 100
LONG_FILE_EXCEPTION_PATTERN = re.compile(r"world-check:\s*max-lines\s*=\s*(\d+)", re.IGNORECASE)
INDEX_REFERENCE_PATTERNS = (
    re.compile(r"^\s*(?:[-*+]|\d+\.)\s+`([^`]+(?:\.[A-Za-z0-9]+)+)`"),
    re.compile(r"^\s*(?:[-*+]|\d+\.)\s+\[[^\]]+\]\(([^)]+(?:\.[A-Za-z0-9]+)+)\)"),
)


@dataclass(frozen=True)
class IndexEntry:
    raw_path: str
    line_number: int


def normalize_relative_path(raw_path: str) -> str:
    """Normalize an index entry path into a stable POSIX-style relative path."""
    normalized = posixpath.normpath(raw_path.replace("\\", "/").strip())
    if normalized == ".":
        return ""
    return normalized


def parse_index_entries(index_path: Path) -> list[IndexEntry]:
    entries: list[IndexEntry] = []
    for line_number, line in enumerate(index_path.read_text(encoding="utf-8").splitlines(), start=1):
        for pattern in INDEX_REFERENCE_PATTERNS:
            match = pattern.search(line)
            if match:
                normalized = normalize_relative_path(match.group(1))
                if normalized:
                    entries.append(IndexEntry(raw_path=normalized, line_number=line_number))
    return entries


def find_parent_index(file_path: Path, world_dir: Path) -> Path | None:
    if file_path == world_dir / "INDEX.md":
        return None

    search_dir = file_path.parent.parent

    while True:
        candidate = search_dir / "INDEX.md"
        if candidate.exists():
            return candidate
        if search_dir == world_dir:
            return None
        if search_dir.parent == search_dir:
            return None
        search_dir = search_dir.parent


def resolve_index_target(index_path: Path, raw_path: str) -> Path:
    return (index_path.parent / raw_path).resolve()


def read_line_limit_override(file_path: Path) -> int | None:
    lines = file_path.read_text(encoding="utf-8").splitlines()
    for line in lines[:5]:
        match = LONG_FILE_EXCEPTION_PATTERN.search(line)
        if match:
            return int(match.group(1))
    return None


def inspect_world_directory(world_dir: Path = WORLD_DIR) -> list[str]:
    findings: list[str] = []
    world_root = world_dir.resolve()

    if not world_dir.exists():
        return [f"World directory is missing: {world_dir}"]

    files = sorted(path for path in world_dir.rglob("*") if path.is_file())
    resolved_targets_by_index: dict[Path, set[Path]] = {}

    for index_path in (path for path in files if path.name == "INDEX.md"):
        entries = parse_index_entries(index_path)
        resolved_targets: set[Path] = set()

        for entry in entries:
            target = resolve_index_target(index_path, entry.raw_path)
            resolved_targets.add(target)

            try:
                target.relative_to(world_root)
            except ValueError:
                findings.append(
                    f"{index_path.relative_to(world_dir).as_posix()} line {entry.line_number} points outside world/: {entry.raw_path}"
                )
                continue

            if not target.exists() or not target.is_file():
                findings.append(
                    f"{index_path.relative_to(world_dir).as_posix()} line {entry.line_number} points to a missing file: {entry.raw_path}"
                )

        resolved_targets_by_index[index_path] = resolved_targets

    for file_path in files:
        if file_path.suffix.lower() == ".md":
            line_count = len(file_path.read_text(encoding="utf-8").splitlines())
            allowed_lines = read_line_limit_override(file_path)
            limit = allowed_lines if allowed_lines is not None else DEFAULT_MAX_LINES

            if line_count > limit:
                relative_path = file_path.relative_to(world_dir).as_posix()
                if allowed_lines is None:
                    findings.append(
                        f"{relative_path} has {line_count} lines, over the {DEFAULT_MAX_LINES}-line limit. "
                        f"Add <!-- world-check: max-lines={line_count} --> near the top only if the extra length is truly necessary."
                    )
                else:
                    findings.append(
                        f"{relative_path} has {line_count} lines, over its explicit world-check limit of {allowed_lines}."
                    )

        if file_path == world_dir / "INDEX.md":
            continue

        if file_path.name == "INDEX.md":
            nearest_index = find_parent_index(file_path, world_dir)
        else:
            nearest_index = file_path.parent / "INDEX.md"
            if not nearest_index.exists():
                findings.append(
                    f"{file_path.relative_to(world_dir).as_posix()} lives in "
                    f"{file_path.parent.relative_to(world_dir).as_posix()}/, but that directory has no INDEX.md."
                )
                continue

        if nearest_index is None:
            continue

        listed_targets = resolved_targets_by_index.get(nearest_index, set())
        if file_path.resolve() not in listed_targets:
            findings.append(
                f"{file_path.relative_to(world_dir).as_posix()} is not listed in its nearest index "
                f"{nearest_index.relative_to(world_dir).as_posix()}."
            )

    if (world_dir / "canon").exists():
        findings.extend(inspect_canon_directory(world_dir / "canon"))
    return findings


def inspect_canon_directory(canon_dir: Path) -> list[str]:
    """Reserved hook for stricter canon rules later."""
    return []


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate world/ structure and guardrails.")
    parser.add_argument(
        "--world-dir",
        default=str(WORLD_DIR),
        help="Path to the world directory to validate.",
    )
    args = parser.parse_args()

    findings = inspect_world_directory(Path(args.world_dir))
    if findings:
        print("world check failed")
        for finding in findings:
            print(f"- {finding}")
        return 1

    print("world check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
