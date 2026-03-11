import { buildProjectContextPrompt } from "./project-context.js";

const cwd = process.argv[2] ?? process.cwd();
process.stdout.write(buildProjectContextPrompt(cwd));
