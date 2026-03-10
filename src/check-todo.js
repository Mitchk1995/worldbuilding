import { inspectTodoBoard } from "./todo-system.js";

const result = inspectTodoBoard(process.cwd());

if (!result.ok) {
  for (const finding of result.findings) {
    console.error(finding);
  }
  process.exitCode = 1;
} else {
  console.log("todo.json is clean");
}
