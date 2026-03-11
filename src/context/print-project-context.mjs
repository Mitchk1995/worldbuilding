import { buildProjectContextPrompt } from "./project-context.js";

const args = process.argv.slice(2);
const cwd = args.find((arg) => !arg.startsWith("--")) ?? process.cwd();
const stripRootSnapshot = args.includes("--strip-root-snapshot");

process.stdout.write(buildProjectContextPrompt(cwd, { stripRootSnapshot }));
