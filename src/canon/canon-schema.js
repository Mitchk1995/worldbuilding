const CANON_COLLECTIONS = Object.freeze([
  "entities",
  "locations",
  "factions",
  "timelines",
  "reality_rules",
  "events"
]);

const BLOCKED_CANON_COLLECTIONS = Object.freeze([
  "builder_memory",
  "project_context",
  "runtime_beliefs",
  "scene_state",
  "transcripts"
]);

const CANON_CHANGE_STATUSES = Object.freeze(["proposed", "approved", "rejected"]);
const CANON_CHANGE_OPERATIONS = Object.freeze(["upsert", "remove"]);

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function inspectCanonCollectionName(name) {
  if (BLOCKED_CANON_COLLECTIONS.includes(name)) {
    return `'${name}' is explicitly non-canon and cannot live in the canon engine.`;
  }
  if (!CANON_COLLECTIONS.includes(name)) {
    return `'${name}' is not a supported canon collection.`;
  }
  return null;
}

export { CANON_COLLECTIONS, BLOCKED_CANON_COLLECTIONS, CANON_CHANGE_STATUSES };

export function createEmptyCanonDocument() {
  return {
    kind: "canon_document",
    version: 1,
    collections: Object.fromEntries(CANON_COLLECTIONS.map((name) => [name, {}]))
  };
}

export function inspectCanonDocument(document) {
  if (!isPlainObject(document)) {
    return ["Canon document must be an object."];
  }

  const findings = [];

  if (document.kind !== "canon_document") {
    findings.push("Canon document kind must be 'canon_document'.");
  }

  if (document.version !== 1) {
    findings.push("Canon document version must be 1.");
  }

  if (!isPlainObject(document.collections)) {
    findings.push("Canon document must contain a collections object.");
    return findings;
  }

  for (const name of CANON_COLLECTIONS) {
    if (!(name in document.collections)) {
      findings.push(`Canon document is missing the '${name}' collection.`);
    }
  }

  for (const [name, value] of Object.entries(document.collections)) {
    const collectionFinding = inspectCanonCollectionName(name);
    if (collectionFinding) {
      findings.push(collectionFinding);
    }
    if (!isPlainObject(value)) {
      findings.push(`Canon collection '${name}' must be an object keyed by stable id.`);
    }
  }

  return findings;
}

export function inspectCanonChange(change) {
  if (!isPlainObject(change)) {
    return ["Canon change must be an object."];
  }

  const findings = [];

  if (change.kind !== "canon_change") {
    findings.push("Canon change kind must be 'canon_change'.");
  }

  if (!isNonEmptyString(change.summary)) {
    findings.push("Canon change must include a non-empty summary.");
  }

  if (!isNonEmptyString(change.reason)) {
    findings.push("Canon change must include a non-empty reason.");
  }

  if (!isPlainObject(change.approval)) {
    findings.push("Canon change must include an approval object.");
  } else {
    const status = change.approval.status;
    if (!CANON_CHANGE_STATUSES.includes(status)) {
      findings.push(
        `Canon change approval.status must be one of: ${CANON_CHANGE_STATUSES.join(", ")}.`
      );
    }
    if (status !== "proposed" && !isNonEmptyString(change.approval.decided_by)) {
      findings.push("Approved or rejected canon changes must record who decided them.");
    }
  }

  if (!Array.isArray(change.operations) || change.operations.length === 0) {
    findings.push("Canon change must include at least one operation.");
    return findings;
  }

  for (const [index, operation] of change.operations.entries()) {
    const label = `Operation ${index + 1}`;

    if (!isPlainObject(operation)) {
      findings.push(`${label} must be an object.`);
      continue;
    }

    if (!CANON_CHANGE_OPERATIONS.includes(operation.op)) {
      findings.push(
        `${label} op must be one of: ${CANON_CHANGE_OPERATIONS.join(", ")}.`
      );
    }

    if (!isNonEmptyString(operation.collection)) {
      findings.push(`${label} must include a collection.`);
    } else {
      const collectionFinding = inspectCanonCollectionName(operation.collection);
      if (collectionFinding) {
        findings.push(`${label}: ${collectionFinding}`);
      }
    }

    if (!isNonEmptyString(operation.id)) {
      findings.push(`${label} must include a stable id.`);
    }

    if (operation.op === "upsert" && !isPlainObject(operation.value)) {
      findings.push(`${label} upsert must include an object value.`);
    }
  }

  return findings;
}

export function canApplyCanonChange(change) {
  return inspectCanonChange(change).length === 0 && change.approval.status === "approved";
}
