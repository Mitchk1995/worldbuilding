import { execFileSync } from "node:child_process";
import { inspectTodoBoard } from "./todo-system.js";

function currentBranchName(cwd) {
  try {
    return execFileSync("git", ["branch", "--show-current"], {
      cwd,
      stdio: "pipe"
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

const cwd = process.cwd();
const result = inspectTodoBoard(cwd, {
  branchName: currentBranchName(cwd)
});

if (!result.ok) {
  for (const finding of result.findings) {
    console.error(finding);
  }
  process.exitCode = 1;
} else {
  console.log("todo.json is clean");
}
