import { existsSync } from "node:fs";
import {
  createMemoryStore,
  DEFAULT_OPERATOR_DB_PATH,
  DEFAULT_WORLD_DB_PATH
} from "./memory/store.js";
import { seedInitialMemory } from "./memory/seed.js";
import {
  buildMissionControlBrief,
  buildMissionControlPageContent
} from "./mission-control.js";
import { searchWorkspaceText } from "./repo-search.js";
import { buildWorkspaceDirtyMessage, getGitHeadSha, getWorkspaceAudit } from "./workspace.js";

function printUsage() {
  console.log(`Usage:
  node src/cli.js init [dbPath]
  node src/cli.js seed [dbPath]
  node src/cli.js brief operator [dbPath]
  node src/cli.js brief entity <entityId> [dbPath]
  node src/cli.js brief mission-control [dbPath]
  node src/cli.js brief mission-control-page [dbPath]
  node src/cli.js steering <kind> <note> [dbPath]
  node src/cli.js steering list [status] [dbPath]
  node src/cli.js steering status <idOrKind> <status> [dbPath]
  node src/cli.js failure <title> <details> [dbPath]
  node src/cli.js failure list [status] [dbPath]
  node src/cli.js failure status <idOrTitle> <status> [dbPath]
  node src/cli.js work create <id> <title> [lane] [owner] [dbPath]
  node src/cli.js work status <id> <status> [dbPath]
  node src/cli.js work complete <id> [dbPath]
  node src/cli.js work list [dbPath]
  node src/cli.js work show <id> [dbPath]
  node src/cli.js reviewer register <agentId> <displayName> [dbPath]
  node src/cli.js reviewer list [status] [dbPath]
  node src/cli.js reviewer status <reviewerKeyOrAgentId> <status> [dbPath]
  node src/cli.js audit add <workId> <type> <verdict> <reviewer> <notes> [dbPath]
  node src/cli.js audit list [workId] [dbPath]
  node src/cli.js audit-memory [dbPath]
  node src/cli.js workspace audit
  node src/cli.js workspace search <query> [root...]
  node src/cli.js entity <id> <kind> <name> [dbPath]
  node src/cli.js event <type> <summary> [entityId] [dbPath]
  node src/cli.js memory <entityId|global> <scope> <type> <content> [dbPath]
  node src/cli.js review [dbPath]
  node src/cli.js search <query> [lane] [dbPath]
  node src/cli.js demo [dbPath]`);
}

function readDbPath(args, index) {
  return args[index] ?? DEFAULT_OPERATOR_DB_PATH;
}

function readWorldDbPath(args, index) {
  return args[index] ?? DEFAULT_WORLD_DB_PATH;
}

function looksLikeDbPath(value) {
  if (!value) {
    return false;
  }
  return /[\\/]/.test(value) || /\.(sqlite|sqlite3|db)$/i.test(value);
}

function readOptionalStatus(value, allowed) {
  if (!value) {
    return null;
  }
  if (allowed.includes(value)) {
    return value;
  }
  if (looksLikeDbPath(value) || existsSync(value)) {
    return null;
  }
  throw new Error(`Unknown status: ${value}. Allowed statuses: ${allowed.join(", ")}.`);
}

function readOptionalPositiveInteger(value, { nextValue = null } = {}) {
  if (!value) {
    return null;
  }

  if (nextValue === null && existsSync(value)) {
    return null;
  }

  if (/^\d+$/.test(value) && Number(value) > 0) {
    return Number(value);
  }

  return null;
}

function runDemo(store) {
  store.upsertWorldEntity({
    id: "npc-lyra",
    kind: "npc",
    name: "Lyra Vale",
    profile: {
      role: "cartographer",
      temperament: "watchful"
    }
  });

  const event = store.appendWorldEvent({
    eventType: "omens",
    summary: "Lyra found a district map that now shifts whenever a storm front rolls over the old harbor.",
    importance: 0.9,
    entityLinks: [{ entityId: "npc-lyra", role: "discoverer" }]
  });

  store.recordWorldMemory({
    entityId: "npc-lyra",
    memoryScope: "private",
    memoryType: "goal",
    truthStatus: "belief",
    content: "Lyra believes the moving map can predict where the city will tear open next, and she wants to keep it secret until she understands the pattern.",
    tags: ["mystery", "storm", "harbor"],
    sourceEventId: event.id,
    importance: 0.92,
    confidence: 0.7
  });

  console.log(store.buildEntityBrief("npc-lyra").content);
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (command === "init") {
    const dbPath = readDbPath(args, 1);
    const store = createMemoryStore(dbPath);
    store.close();
    console.log(`Initialized memory store at ${dbPath}`);
    return;
  }

  if (command === "seed") {
    const dbPath = readDbPath(args, 1);
    const store = createMemoryStore(dbPath);
    seedInitialMemory(store);
    const brief = store.buildOperatorBrief().content;
    store.close();
    console.log(brief);
    return;
  }

  if (command === "brief") {
    const kind = args[1];
    if (kind === "operator") {
      const dbPath = readDbPath(args, 2);
      const store = createMemoryStore(dbPath);
      console.log(store.buildOperatorBrief().content);
      store.close();
      return;
    }

    if (kind === "entity") {
      const entityId = args[2];
      const dbPath = readWorldDbPath(args, 3);
      if (!entityId) {
        throw new Error("Entity brief requires an entity id.");
      }
      const store = createMemoryStore(dbPath);
      console.log(store.buildEntityBrief(entityId).content);
      store.close();
      return;
    }

    if (kind === "mission-control") {
      const dbPath = readDbPath(args, 2);
      const store = createMemoryStore(dbPath);
      console.log(buildMissionControlBrief(store).content);
      store.close();
      return;
    }

    if (kind === "mission-control-page") {
      const dbPath = readDbPath(args, 2);
      const store = createMemoryStore(dbPath);
      console.log(buildMissionControlPageContent(store));
      store.close();
      return;
    }
  }

  if (command === "search") {
    const query = args[1];
    const lane = args[2] ?? "operator";
    const dbPath = lane === "world" ? readWorldDbPath(args, 3) : readDbPath(args, 3);
    if (!query) {
      throw new Error("Search requires a query.");
    }
    const store = createMemoryStore(dbPath);
    console.log(JSON.stringify(store.search(query, { lane }), null, 2));
    store.close();
    return;
  }

  if (command === "steering") {
    if (args[1] === "list") {
      const maybeStatus = readOptionalStatus(args[2], ["open", "resolved"]);
      const dbPath = maybeStatus === null ? readDbPath(args, 2) : readDbPath(args, 3);
      const store = createMemoryStore(dbPath);
      console.log(JSON.stringify(store.listOperatorSteerings(maybeStatus), null, 2));
      store.close();
      return;
    }

    if (args[1] === "status") {
      const idOrKind = args[2];
      const status = args[3];
      const dbPath = readDbPath(args, 4);
      if (!idOrKind || !status) {
        throw new Error("Steering status requires <idOrKind> <status>.");
      }
      const store = createMemoryStore(dbPath);
      console.log(JSON.stringify(store.updateOperatorSteeringStatus(idOrKind, status), null, 2));
      store.close();
      return;
    }

    const kind = args[1];
    const note = args[2];
    const dbPath = readDbPath(args, 3);
    if (!kind || !note) {
      throw new Error("Steering requires <kind> and <note>.");
    }
    const store = createMemoryStore(dbPath);
    console.log(JSON.stringify(store.recordOperatorSteering({ kind, note }), null, 2));
    store.close();
    return;
  }

  if (command === "failure") {
    if (args[1] === "list") {
      const maybeStatus = readOptionalStatus(args[2], ["open", "resolved"]);
      const dbPath = maybeStatus === null ? readDbPath(args, 2) : readDbPath(args, 3);
      const store = createMemoryStore(dbPath);
      console.log(JSON.stringify(store.listOperatorFailures(maybeStatus), null, 2));
      store.close();
      return;
    }

    if (args[1] === "status") {
      const idOrTitle = args[2];
      const status = args[3];
      const dbPath = readDbPath(args, 4);
      if (!idOrTitle || !status) {
        throw new Error("Failure status requires <idOrTitle> <status>.");
      }
      const store = createMemoryStore(dbPath);
      console.log(JSON.stringify(store.updateOperatorFailureStatus(idOrTitle, status), null, 2));
      store.close();
      return;
    }

    const title = args[1];
    const details = args[2];
    const dbPath = readDbPath(args, 3);
    if (!title || !details) {
      throw new Error("Failure requires <title> and <details>.");
    }
    const store = createMemoryStore(dbPath);
    console.log(JSON.stringify(store.recordOperatorFailure({ title, details }), null, 2));
    store.close();
    return;
  }

  if (command === "work") {
    const action = args[1];
    if (action === "create") {
      const id = args[2];
      const title = args[3];
      const lane = args[4] && !looksLikeDbPath(args[4]) ? args[4] : "operator";
      const owner = args[5] && !looksLikeDbPath(args[5]) ? args[5] : "main-agent";
      const dbPath =
        looksLikeDbPath(args[4])
          ? readDbPath(args, 4)
          : looksLikeDbPath(args[5])
            ? readDbPath(args, 5)
            : readDbPath(args, 6);
      if (!id || !title) {
        throw new Error("Work create requires <id> <title>.");
      }
      const store = createMemoryStore(dbPath);
      console.log(
        JSON.stringify(store.upsertProjectWorkItem({ id, title, lane, owner }), null, 2)
      );
      store.close();
      return;
    }

    if (action === "status") {
      const id = args[2];
      const status = args[3];
      const dbPath = readDbPath(args, 4);
      if (!id || !status) {
        throw new Error("Work status requires <id> <status>.");
      }
      if (status === "in_progress") {
        const audit = getWorkspaceAudit();
        const warning = buildWorkspaceDirtyMessage(audit);
        if (warning) {
          throw new Error(warning);
        }
      }
      const store = createMemoryStore(dbPath);
      const updated = store.updateProjectWorkStatus(id, status);
      console.log(JSON.stringify(updated, null, 2));
      store.close();
      return;
    }

    if (action === "complete") {
      const id = args[2];
      const dbPath = readDbPath(args, 3);
      if (!id) {
        throw new Error("Work complete requires <id>.");
      }
      const audit = getWorkspaceAudit();
      const warning = buildWorkspaceDirtyMessage(audit);
      if (warning) {
        throw new Error(warning);
      }
      const store = createMemoryStore(dbPath);
      console.log(
        JSON.stringify(
          store.completeProjectWorkItem(id, {
            reviewedHeadSha: getGitHeadSha()
          }),
          null,
          2
        )
      );
      store.close();
      return;
    }

    if (action === "list") {
      const dbPath = readDbPath(args, 2);
      const store = createMemoryStore(dbPath);
      console.log(JSON.stringify(store.listProjectWorkItems(), null, 2));
      store.close();
      return;
    }

    if (action === "show") {
      const id = args[2];
      const dbPath = readDbPath(args, 3);
      if (!id) {
        throw new Error("Work show requires <id>.");
      }
      const store = createMemoryStore(dbPath);
      console.log(JSON.stringify(store.getProjectWorkItem(id), null, 2));
      store.close();
      return;
    }
  }

  if (command === "reviewer") {
    const action = args[1];
    if (action === "register") {
      const agentId = args[2];
      const displayName = args[3];
      const dbPath = readDbPath(args, 4);
      if (!agentId || !displayName) {
        throw new Error("Reviewer register requires <agentId> <displayName>.");
      }
      const store = createMemoryStore(dbPath);
      console.log(
        JSON.stringify(store.registerReviewerIdentity({ agentId, displayName }), null, 2)
      );
      store.close();
      return;
    }

    if (action === "list") {
      const maybeStatus = readOptionalStatus(args[2], ["active", "legacy", "revoked"]);
      const dbPath = maybeStatus === null ? readDbPath(args, 2) : readDbPath(args, 3);
      const store = createMemoryStore(dbPath);
      console.log(JSON.stringify(store.listReviewerIdentities(maybeStatus), null, 2));
      store.close();
      return;
    }

    if (action === "status") {
      const reviewerKeyOrAgentId = args[2];
      const status = args[3];
      const dbPath = readDbPath(args, 4);
      if (!reviewerKeyOrAgentId || !status) {
        throw new Error("Reviewer status requires <reviewerKeyOrAgentId> <status>.");
      }
      const store = createMemoryStore(dbPath);
      console.log(
        JSON.stringify(
          store.updateReviewerIdentityStatus(reviewerKeyOrAgentId, status),
          null,
          2
        )
      );
      store.close();
      return;
    }
  }

  if (command === "audit") {
    const action = args[1];
    if (action === "add") {
      const workItemId = args[2];
      const reviewType = args[3];
      const verdict = args[4];
      const reviewer = args[5];
      const notes = args[6];
      const dbPath = readDbPath(args, 7);
      if (!workItemId || !reviewType || !verdict || !reviewer || !notes) {
        throw new Error("Audit add requires <workId> <type> <verdict> <reviewer> <notes>.");
      }
      const audit = getWorkspaceAudit();
      const warning = buildWorkspaceDirtyMessage(audit);
      if (warning) {
        throw new Error(`Cannot record bound audit: ${warning}`);
      }
      const reviewedHeadSha = getGitHeadSha();
      if (!reviewedHeadSha) {
        throw new Error(
          "Cannot record bound audit because the current Git head could not be determined."
        );
      }
      const store = createMemoryStore(dbPath);
      console.log(
        JSON.stringify(
          store.recordProjectReview({
            workItemId,
            reviewType,
            verdict,
            reviewer,
            notes,
            reviewedHeadSha
          }),
          null,
          2
        )
      );
      store.close();
      return;
    }

    if (action === "list") {
      const workItemId = args[2] && !looksLikeDbPath(args[2]) ? args[2] : null;
      const dbPath =
        workItemId === null ? readDbPath(args, 2) : readDbPath(args, 3);
      const store = createMemoryStore(dbPath);
      console.log(JSON.stringify(store.listProjectReviews(workItemId), null, 2));
      store.close();
      return;
    }
  }

  if (command === "audit-memory") {
    const maybeStaleDays = readOptionalPositiveInteger(args[1], {
      nextValue: args[2] ?? null
    });
    const dbPath = maybeStaleDays === null ? readDbPath(args, 1) : readDbPath(args, 2);
    const store = createMemoryStore(dbPath);
    console.log(
      JSON.stringify(
        store.auditOperatorMemory(
          maybeStaleDays === null ? undefined : { staleDays: maybeStaleDays }
        ),
        null,
        2
      )
    );
    store.close();
    return;
  }

  if (command === "workspace") {
    if (args[1] === "audit") {
      console.log(JSON.stringify(getWorkspaceAudit(), null, 2));
      return;
    }

    if (args[1] === "search") {
      const query = args[2];
      const roots = args.slice(3);
      if (!query) {
        throw new Error("Workspace search requires <query>.");
      }
      console.log(
        JSON.stringify(
          searchWorkspaceText(query, {
            roots
          }),
          null,
          2
        )
      );
      return;
    }

    throw new Error("Workspace supports only the 'audit' and 'search' actions.");
  }

  if (command === "entity") {
    const id = args[1];
    const kind = args[2];
    const name = args[3];
    const dbPath = readWorldDbPath(args, 4);
    if (!id || !kind || !name) {
      throw new Error("Entity requires <id> <kind> <name>.");
    }
    const store = createMemoryStore(dbPath);
    console.log(JSON.stringify(store.upsertWorldEntity({ id, kind, name }), null, 2));
    store.close();
    return;
  }

  if (command === "event") {
    const eventType = args[1];
    const summary = args[2];
    const entityId = args[3] && !looksLikeDbPath(args[3]) ? args[3] : null;
    const dbPath =
      entityId === null ? readWorldDbPath(args, 3) : readWorldDbPath(args, 4);
    if (!eventType || !summary) {
      throw new Error("Event requires <type> <summary> [entityId].");
    }
    const store = createMemoryStore(dbPath);
    const entityLinks = entityId ? [{ entityId, role: "mentioned" }] : [];
    console.log(
      JSON.stringify(
        store.appendWorldEvent({ eventType, summary, entityLinks }),
        null,
        2
      )
    );
    store.close();
    return;
  }

  if (command === "memory") {
    const entityToken = args[1];
    const memoryScope = args[2];
    const memoryType = args[3];
    const content = args[4];
    const dbPath = readWorldDbPath(args, 5);
    if (!entityToken || !memoryScope || !memoryType || !content) {
      throw new Error(
        "Memory requires <entityId|global> <scope> <type> <content>."
      );
    }
    const store = createMemoryStore(dbPath);
    console.log(
      JSON.stringify(
        store.recordWorldMemory({
          entityId: entityToken === "global" ? null : entityToken,
          memoryScope,
          memoryType,
          content
        }),
        null,
        2
      )
    );
    store.close();
    return;
  }

  if (command === "review") {
    const dbPath = readWorldDbPath(args, 1);
    const store = createMemoryStore(dbPath);
    console.log(JSON.stringify(store.listReviewQueue(), null, 2));
    store.close();
    return;
  }

  if (command === "demo") {
    const dbPath = readWorldDbPath(args, 1);
    const store = createMemoryStore(dbPath);
    seedInitialMemory(store);
    runDemo(store);
    store.close();
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main();
