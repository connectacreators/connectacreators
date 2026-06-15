import { describe, it, expect } from "vitest";
import { buildAgenda } from "@/lib/triage/buildAgenda";
import type { TriageClient, TriageRowsByClient } from "@/lib/triage/types";

const NOW = new Date("2026-06-10T12:00:00Z");
function at(n: number): string {
  return new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000).toISOString();
}
const clients: TriageClient[] = [
  { id: "c1", name: "Dr Calvin's Clinic", user_id: "u-c1" },
  { id: "c2", name: "Master Construction", user_id: "u-c2" },
];

function lane(agenda: ReturnType<typeof buildAgenda>, key: string) {
  return agenda.find((l) => l.key === key);
}

describe("buildAgenda", () => {
  it("returns no lanes for empty input", () => {
    expect(buildAgenda([], {}, NOW)).toEqual([]);
  });

  it("buckets an overdue editing deadline into the overdue lane", () => {
    const rows: TriageRowsByClient = {
      c2: [{ type: "pipeline", milestone: "editing_due", at: at(-2) }],
    };
    const agenda = buildAgenda(clients, rows, NOW);
    const overdue = lane(agenda, "overdue");
    expect(overdue?.items[0].verb).toBe("Lock the edit");
    expect(overdue?.items[0].clientName).toBe("Master Construction");
  });

  it("folds a matching scripts_review count into the script_due item", () => {
    const rows: TriageRowsByClient = {
      c1: [
        { type: "pipeline", milestone: "script_due", at: at(3) },
        { type: "scripts_review", count: 3, sampleNames: [], oldestPendingAt: at(-1) },
      ],
    };
    const agenda = buildAgenda(clients, rows, NOW);
    const items = agenda.flatMap((l) => l.items);
    const scriptItems = items.filter((i) => i.clientId === "c1");
    expect(scriptItems).toHaveLength(1);
    expect(scriptItems[0].verb).toBe("Write & send script");
    expect(scriptItems[0].count).toBe(3);
    expect(scriptItems[0].countLabel).toBe("3 ready for review");
  });

  it("keeps an unpaired scripts_review as its own dated item", () => {
    const rows: TriageRowsByClient = {
      c1: [{ type: "scripts_review", count: 2, sampleNames: [], oldestPendingAt: at(-1) }],
    };
    const agenda = buildAgenda(clients, rows, NOW);
    const items = agenda.flatMap((l) => l.items);
    expect(items).toHaveLength(1);
    expect(items[0].verb).toBe("Review scripts");
    expect(items[0].count).toBe(2);
  });

  it("marks filming and onboarding as prep", () => {
    const rows: TriageRowsByClient = {
      c1: [{ type: "pipeline", milestone: "filming", at: at(1) }],
    };
    const agenda = buildAgenda(clients, rows, NOW);
    const item = agenda.flatMap((l) => l.items)[0];
    expect(item.isPrep).toBe(true);
    expect(item.verb).toBe("Prep the shoot");
  });

  it("orders lanes overdue→today→tomorrow→thisweek→later and sorts within", () => {
    const rows: TriageRowsByClient = {
      c1: [
        { type: "pipeline", milestone: "posting", at: at(0.1) },
        { type: "pipeline", milestone: "script_due", at: at(4) },
        { type: "pipeline", milestone: "editing_due", at: at(-1) },
      ],
    };
    const agenda = buildAgenda(clients, rows, NOW);
    expect(agenda.map((l) => l.key)).toEqual(["overdue", "today", "thisweek"]);
  });

  it("marks an unpaired videos_revision as the editor's task, naming the assignee", () => {
    const rows: TriageRowsByClient = {
      c1: [{ type: "videos_revision", count: 1, sampleNames: [], oldestPendingAt: at(-3), assignee: "Tom" }],
    };
    const item = buildAgenda(clients, rows, NOW).flatMap((l) => l.items)[0];
    expect(item.verb).toBe("Edits in revision");
    expect(item.owner).toBe("editor");
    expect(item.ownerName).toBe("Tom");
  });

  it("keeps owner 'editor' when the assignee user_id is a real editor (not the client)", () => {
    const rows: TriageRowsByClient = {
      c1: [{ type: "videos_revision", count: 1, sampleNames: [], oldestPendingAt: at(-3), assignee: "Tom", assigneeUserId: "u-editor" }],
    };
    const item = buildAgenda(clients, rows, NOW).flatMap((l) => l.items)[0];
    expect(item.owner).toBe("editor");
    expect(item.ownerName).toBe("Tom");
  });

  it("marks a videos_revision sent back by the client (assignee is the client) as owner 'client'", () => {
    // When a client requests a revision in the content calendar, the edit's
    // assignee stays the client (the Scheduled handoff set it). The card must
    // not mislabel the client as the editor.
    const rows: TriageRowsByClient = {
      c1: [{ type: "videos_revision", count: 1, sampleNames: [], oldestPendingAt: at(-3), assignee: "Dr Calvin's Clinic", assigneeUserId: "u-c1" }],
    };
    const item = buildAgenda(clients, rows, NOW).flatMap((l) => l.items)[0];
    expect(item.owner).toBe("client");
  });

  it("dates an edit-in-revision by its real deadline when one is set", () => {
    const rows: TriageRowsByClient = {
      c1: [{ type: "videos_revision", count: 2, sampleNames: [], oldestPendingAt: at(-5), deadlineAt: at(1) }],
    };
    const item = buildAgenda(clients, rows, NOW).flatMap((l) => l.items)[0];
    expect(item.sortDate).toBe(at(1));
    expect(item.bucket).toBe("tomorrow");
    expect(item.ownerName).toBeUndefined();
  });

  it("falls back to a waiting age when an edit-in-revision has no deadline", () => {
    const rows: TriageRowsByClient = {
      c1: [{ type: "videos_revision", count: 1, sampleNames: [], oldestPendingAt: at(-3) }],
    };
    const item = buildAgenda(clients, rows, NOW).flatMap((l) => l.items)[0];
    expect(item.chipLabel).toBe("waiting 3d");
    expect(item.bucket).toBe("overdue");
  });

  it("treats scripts_review as your task and shows its waiting age", () => {
    const rows: TriageRowsByClient = {
      c1: [{ type: "scripts_review", count: 2, sampleNames: [], oldestPendingAt: at(-4) }],
    };
    const item = buildAgenda(clients, rows, NOW).flatMap((l) => l.items)[0];
    expect(item.owner).toBe("you");
    expect(item.chipLabel).toBe("waiting 4d");
  });

  it("treats scheduled posts as automated (owner scheduled)", () => {
    const rows: TriageRowsByClient = {
      c1: [{ type: "posts_scheduled", count: 2, sampleNames: [], nextAt: at(0.1) }],
    };
    const item = buildAgenda(clients, rows, NOW).flatMap((l) => l.items)[0];
    expect(item.owner).toBe("scheduled");
  });

  it("shows a concrete due date for a far-off pipeline milestone", () => {
    const rows: TriageRowsByClient = {
      c1: [{ type: "pipeline", milestone: "script_due", at: at(10) }],
    };
    const item = buildAgenda(clients, rows, NOW).flatMap((l) => l.items)[0];
    expect(item.owner).toBe("you");
    expect(item.chipLabel).toBe("Due Jun 20");
  });

  it("carries the boosting budget label as context", () => {
    const rows: TriageRowsByClient = {
      c1: [{ type: "pipeline", milestone: "boosting", at: at(3), label: "$400 budget" }],
    };
    const item = buildAgenda(clients, rows, NOW).flatMap((l) => l.items)[0];
    expect(item.verb).toBe("Set up boost");
    expect(item.context).toBe("$400 budget");
  });
});
