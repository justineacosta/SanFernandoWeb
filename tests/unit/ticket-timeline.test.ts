import { describe, expect, it } from "vitest";
import type { TicketLookupResult, TicketUpdateEntry } from "@/types";
import { buildSteps } from "@/features/track/components/ticket-timeline";

function entry(over: Partial<TicketUpdateEntry> = {}): TicketUpdateEntry {
  return {
    id: crypto.randomUUID(),
    entryType: "status",
    status: "pending",
    body: "",
    authorKind: "system",
    attachmentCount: 0,
    createdAt: "2026-08-01",
    ...over,
  };
}

function ticket(over: Partial<TicketLookupResult> = {}): TicketLookupResult {
  return {
    kind: "application",
    ticketNo: "APP-2026-00001",
    type: "Certificate Application",
    serviceTitle: "Barangay Clearance",
    requirements: [],
    applicantName: "Maria Santos",
    status: "pending",
    submittedAt: "2026-08-01",
    reviewedAt: null,
    closedAt: null,
    remarks: null,
    scheduleNote: null,
    timeline: [entry()],
    repliable: false,
    ...over,
  };
}

describe("buildSteps", () => {
  it("renders one step per log entry, oldest first", () => {
    const steps = buildSteps(
      ticket({
        status: "approved",
        timeline: [
          entry({ status: "pending", createdAt: "2026-08-01" }),
          entry({ status: "approved", createdAt: "2026-08-03" }),
        ],
      }),
    );
    expect(steps[0].date).toBe("2026-08-01");
    expect(steps[1].title).toBe("Approved");
  });

  it("appends exactly one greyed 'what's next' step for a non-terminal ticket", () => {
    const steps = buildSteps(ticket({ status: "approved", timeline: [entry({ status: "approved" })] }));
    const todo = steps.filter((step) => step.state === "todo");
    expect(todo).toHaveLength(1);
    expect(todo[0].title).toBe("Released");
  });

  it("appends no trailing step once the ticket is terminal", () => {
    const steps = buildSteps(ticket({ status: "released", timeline: [entry({ status: "released" })] }));
    expect(steps.every((step) => step.state !== "todo")).toBe(true);
  });

  it("marks a negative outcome as failed", () => {
    const steps = buildSteps(
      ticket({ status: "rejected", timeline: [entry({ status: "rejected", body: "Missing valid ID." })] }),
    );
    expect(steps.at(-1)?.state).toBe("failed");
    expect(steps.at(-1)?.detail).toBe("Missing valid ID.");
  });

  it("uses the staff body when present and the default copy when blank", () => {
    const withBody = buildSteps(ticket({ timeline: [entry({ status: "pending", body: "Queued." })] }));
    expect(withBody[0].detail).toBe("Queued.");
    const withoutBody = buildSteps(ticket({ timeline: [entry({ status: "pending", body: "" })] }));
    expect(withoutBody[0].detail).toBe("Your request reached the barangay office.");
  });

  it("labels a staff note and a resident reply distinctly from a status entry", () => {
    const steps = buildSteps(
      ticket({
        timeline: [
          entry({ entryType: "staff-note", status: null, body: "Printing today." }),
          entry({ entryType: "resident-reply", status: null, authorKind: "resident", body: "Sent it." }),
        ],
      }),
    );
    expect(steps[0].title).toBe("Update from the barangay");
    expect(steps[1].title).toBe("Your reply");
  });

  it("shows an attachment count on a reply that carried files", () => {
    const steps = buildSteps(
      ticket({
        timeline: [
          entry({ entryType: "resident-reply", status: null, authorKind: "resident", body: "Sent.", attachmentCount: 2 }),
        ],
      }),
    );
    expect(steps[0].detail).toContain("2");
  });

  // An empty log is reachable in production: `loadTimeline` returns [] on any
  // query error rather than failing the whole lookup, so a resident whose
  // ticket_updates read failed still gets a page. It must not be a blank one.
  it("still shows the next step when the log came back empty", () => {
    const steps = buildSteps(ticket({ status: "pending", timeline: [] }));
    expect(steps).toHaveLength(1);
    expect(steps[0].state).toBe("todo");
  });

  it("renders nothing rather than throwing when a terminal ticket has an empty log", () => {
    expect(buildSteps(ticket({ status: "released", timeline: [] }))).toEqual([]);
  });

  // Guards the `if (next)` branch in buildSteps. Every non-terminal status has a
  // NEXT_STEP entry today, so this is the only thing proving the lookup miss
  // degrades to "no trailing step" instead of pushing an undefined one.
  it("omits the trailing step when the status has no next-step copy", () => {
    const steps = buildSteps(
      ticket({ status: "no-such-status" as TicketLookupResult["status"], timeline: [entry()] }),
    );
    expect(steps).toHaveLength(1);
    expect(steps.every((step) => step.state !== "todo")).toBe(true);
  });
});
