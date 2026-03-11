"""Minimal registry shim for adapted Hermes-derived tools."""


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

    def get(self, name):
        return self._tools.get(name)

    def list_tools(self):
        return list(self._tools.values())

    def invoke(self, name, args=None, **kwargs):
        tool = self.get(name)
        if tool is None:
            raise KeyError(f"Unknown tool '{name}'.")

        check_fn = tool.get("check_fn")
        if check_fn and not check_fn():
            raise RuntimeError(f"Tool '{name}' is not available in this environment.")

        handler = tool["handler"]
        return handler(args or {}, **kwargs)


registry = ToolRegistry()
