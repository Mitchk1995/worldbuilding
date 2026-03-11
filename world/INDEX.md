# World Index

This is the root entry point for world knowledge.

## Rules

- World knowledge lives here, not in Hermes memory.
- Keep files small and single-purpose.
- Crossing 100 lines should be rare and should need a clear reason.
- If a Markdown file truly needs to run long, add `<!-- world-check: max-lines=NNN -->` near the top and keep the exception tight.
- Every world directory that holds files needs its own `INDEX.md`. Parent indexes should point to child indexes, not reach down into deeper leaf files.
- Add or update the nearest index whenever a world file changes.
- Keep planning files and future gameplay files separate from world knowledge.

## Current sections

- `foundation/INDEX.md`: pre-canon world design that is still being shaped

## Reserved future sections

- `canon/`: approved world truth only
- `runtime/`: future living-world state, if and when it exists
- `player/`: future player-facing continuity, if and when it exists
