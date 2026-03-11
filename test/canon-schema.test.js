import test from "node:test";
import assert from "node:assert/strict";
import {
  canApplyCanonChange,
  createEmptyCanonDocument,
  inspectCanonChange,
  inspectCanonDocument
} from "../src/canon/canon-schema.js";

test("empty canon document starts with only supported canon collections", () => {
  const document = createEmptyCanonDocument();

  assert.equal(inspectCanonDocument(document).length, 0);
});

test("canon document rejects blocked non-canon collections", () => {
  const document = createEmptyCanonDocument();
  document.collections.runtime_beliefs = {};

  const findings = inspectCanonDocument(document);

  assert.ok(findings.some((finding) => finding.includes("explicitly non-canon")));
});

test("canon document rejects blank or padded stable ids", () => {
  const document = createEmptyCanonDocument();
  document.collections.entities["   "] = { name: "Nameless" };
  document.collections.locations[" location:larkfall "] = { name: "Larkfall" };

  const findings = inspectCanonDocument(document);

  assert.ok(findings.some((finding) => finding.includes("non-empty stable ids")));
  assert.ok(findings.some((finding) => finding.includes("leading or trailing whitespace")));
});

test("proposed canon change is valid shape but not yet applicable", () => {
  const change = {
    kind: "canon_change",
    summary: "Add the city of Larkfall.",
    reason: "The map now needs a named capital.",
    approval: {
      status: "proposed"
    },
    operations: [
      {
        op: "upsert",
        collection: "locations",
        id: "location:larkfall",
        value: {
          name: "Larkfall"
        }
      }
    ]
  };

  assert.equal(inspectCanonChange(change).length, 0);
  assert.equal(canApplyCanonChange(change), false);
});

test("approved canon change requires a decision record", () => {
  const change = {
    kind: "canon_change",
    summary: "Add the city of Larkfall.",
    reason: "The map now needs a named capital.",
    approval: {
      status: "approved"
    },
    operations: [
      {
        op: "upsert",
        collection: "locations",
        id: "location:larkfall",
        value: {
          name: "Larkfall"
        }
      }
    ]
  };

  const findings = inspectCanonChange(change);

  assert.ok(findings.some((finding) => finding.includes("who decided")));
  assert.equal(canApplyCanonChange(change), false);
});

test("canon change rejects builder memory as a target", () => {
  const change = {
    kind: "canon_change",
    summary: "Store a builder reminder.",
    reason: "This should never be canon.",
    approval: {
      status: "approved",
      decided_by: "human"
    },
    operations: [
      {
        op: "upsert",
        collection: "builder_memory",
        id: "note:1",
        value: {
          text: "Remember to check the repo."
        }
      }
    ]
  };

  const findings = inspectCanonChange(change);

  assert.ok(findings.some((finding) => finding.includes("non-canon")));
  assert.equal(canApplyCanonChange(change), false);
});

test("approved canon change becomes applicable once it stays inside canon", () => {
  const change = {
    kind: "canon_change",
    summary: "Add the city of Larkfall.",
    reason: "The map now needs a named capital.",
    approval: {
      status: "approved",
      decided_by: "human"
    },
    operations: [
      {
        op: "upsert",
        collection: "locations",
        id: "location:larkfall",
        value: {
          name: "Larkfall"
        }
      }
    ]
  };

  assert.equal(inspectCanonChange(change).length, 0);
  assert.equal(canApplyCanonChange(change), true);
});
