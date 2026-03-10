"""Minimal registry shim for vendored Hermes tools."""


class ToolRegistry:
    """Stores tool registrations without pulling in the full Hermes runtime."""

    def __init__(self):
        self._tools = {}

    def register(
        self,
        name,
        toolset,
        schema,
        handler,
        check_fn=None,
        requires_env=None,
        is_async=False,
        description="",
    ):
        self._tools[name] = {
            "name": name,
            "toolset": toolset,
            "schema": schema,
            "handler": handler,
            "check_fn": check_fn,
            "requires_env": requires_env or [],
            "is_async": is_async,
            "description": description or schema.get("description", ""),
        }


registry = ToolRegistry()
