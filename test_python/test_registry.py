import unittest

from tools.registry import ToolRegistry


class RegistryTestCase(unittest.TestCase):
    def test_invoke_runs_registered_handler(self):
        registry = ToolRegistry()
        registry.register(
            name="echo",
            toolset="test",
            schema={"name": "echo", "description": "Echo args"},
            handler=lambda args, **kw: {"args": args, "meta": kw.get("meta")},
        )

        result = registry.invoke("echo", {"value": 3}, meta="ok")

        self.assertEqual(result, {"args": {"value": 3}, "meta": "ok"})

    def test_invoke_rejects_unknown_tool(self):
        registry = ToolRegistry()

        with self.assertRaises(KeyError):
            registry.invoke("missing")


if __name__ == "__main__":
    unittest.main()
