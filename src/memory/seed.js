export function seedInitialMemory(store) {
  const steerings = [
    {
      kind: "research-discipline",
      note: "Use internet-first research for current technical decisions. Do not rely on outdated local files or pre-2026 assumptions when choosing architecture.",
      priority: 3
    },
    {
      kind: "system-boundary",
      note: "Keep operator/build memory separate from world runtime memory. They are different systems with different responsibilities.",
      priority: 3
    },
    {
      kind: "memory-policy",
      note: "Do not treat vector search as canon. Canon must live in a structured state/event system with review gates.",
      priority: 3
    },
    {
      kind: "workflow-hygiene",
      note: "Capture user feedback, failures, and corrections proactively so the project stays clean without manual babysitting.",
      priority: 3
    },
    {
      kind: "skills-policy",
      note: "Search for existing relevant skills and external systems first. Do not invent or repurpose unrelated skills casually.",
      priority: 2
    },
    {
      kind: "agents-first",
      note: "Use AGENTS.md as the primary repo contract. Keep README minimal and optimize the workspace for agents, not humans.",
      priority: 3
    },
    {
      kind: "review-gates",
      note: "Do not let substantial work count as done until research, code, and QA audits are recorded and passing.",
      priority: 3
    },
    {
      kind: "research-scope",
      note: "Do not use stale training associations to choose what to research. Start from current-year public sources and treat familiar older products as suspect until current evidence justifies them.",
      priority: 3
    },
    {
      kind: "language-discipline",
      note: "When speaking to the user, use plain English only. Avoid code names, file names, and programmer jargon unless explicitly asked.",
      priority: 3
    },
    {
      kind: "immediate-capture",
      note: "Record new user feedback, corrections, and 'never do that again' rules immediately when they appear instead of waiting until later.",
      priority: 3
    },
    {
      kind: "duplicate-hygiene",
      note: "Before adding or updating durable memory, check for exact and likely duplicate steerings or failures so memory stays clean instead of bloating with repeats.",
      priority: 3
    },
    {
      kind: "stale-memory-hygiene",
      note: "When a remembered problem or limit is no longer true, mark it resolved instead of leaving stale warnings active in the operator memory.",
      priority: 3
    },
    {
      kind: "recursive-review",
      note: "A failed review is not the end of the process. Work stays in the review loop until the latest full set of reviews comes back clean.",
      priority: 3
    },
    {
      kind: "separate-reviewer",
      note: "Use a separate reviewer instance for substantial work instead of relying only on self-review. Prefer lighter separate reviewers for low-risk passes when that saves time without lowering the bar.",
      priority: 2
    },
    {
      kind: "current-focus",
      note: "Do not start worldbuilding systems yet. First harden the operator-side memory, review flow, and project discipline so build work stays aligned and clean.",
      priority: 3
    },
    {
      kind: "visual-mission-control",
      note: "Use a visual mission-control layer when available so the user can audit state without reading local files directly. Prefer the Notion connection if it is actually available.",
      priority: 2
    }
  ];

  const failures = [
    {
      title: "Scoped research too narrowly",
      details: "Recent-2026 capability research was initially limited to narrow Codex app topics instead of broader OpenAI/model releases and external current systems.",
      cause: "Premature assumption about which product surface mattered most.",
      impact: "Architecture discussion started from incomplete current-state information."
    },
    {
      title: "Opened unrelated memory skills",
      details: "Relationship/persona memory skills were read even though they were not relevant references for this project.",
      cause: "Bad skill triage and weak boundary enforcement.",
      impact: "Context got polluted and trust took damage."
    },
    {
      title: "Used stale product associations in research framing",
      details: "Referenced products the user considers outdated before finishing a current-year internet-first comparison, which damaged confidence in the research process.",
      cause: "Started from familiar names instead of proving current relevance first.",
      impact: "The research process felt unreliable and mismatched to March 2026."
    },
    {
      title: "Delayed steering capture",
      details: "Several new user steerings were not written into durable operator memory immediately, which left a gap between conversation state and project memory.",
      cause: "Feedback capture was treated as something to do later instead of part of the immediate workflow.",
      impact: "Project memory temporarily lagged behind the actual steering."
    }
  ];

  for (const steering of steerings) {
    store.recordOperatorSteering(steering);
  }

  for (const failure of failures) {
    store.recordOperatorFailure(failure);
  }
}
