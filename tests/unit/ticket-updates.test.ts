import { describe, expect, it } from "vitest";
import {
  REPLY_RETURN_STATUS,
  TICKET_INTAKE_STATUS,
  canReply,
  isTerminalStatus,
  statusEntryCopy,
} from "@/lib/ticket-updates";

describe("canReply", () => {
  it("is true only for awaiting-info", () => {
    expect(canReply("awaiting-info")).toBe(true);
    expect(canReply("pending")).toBe(false);
    expect(canReply("under-review")).toBe(false);
    expect(canReply("released")).toBe(false);
    expect(canReply("dismissed")).toBe(false);
  });
});

describe("TICKET_INTAKE_STATUS", () => {
  it("gives each kind its own intake status — complaints are `received`, not `pending`", () => {
    expect(TICKET_INTAKE_STATUS.application).toBe("pending");
    expect(TICKET_INTAKE_STATUS.appointment).toBe("pending");
    expect(TICKET_INTAKE_STATUS.complaint).toBe("received");
    expect(TICKET_INTAKE_STATUS.assistance).toBe("pending");
  });
});

describe("isTerminalStatus", () => {
  it("recognises each kind's own terminal statuses", () => {
    expect(isTerminalStatus("application", "released")).toBe(true);
    expect(isTerminalStatus("application", "rejected")).toBe(true);
    expect(isTerminalStatus("application", "approved")).toBe(false);
    expect(isTerminalStatus("complaint", "resolved")).toBe(true);
    expect(isTerminalStatus("complaint", "under-review")).toBe(false);
    expect(isTerminalStatus("assistance", "granted")).toBe(true);
    expect(isTerminalStatus("appointment", "completed")).toBe(true);
  });

  it("treats awaiting-info as non-terminal for every kind", () => {
    expect(isTerminalStatus("application", "awaiting-info")).toBe(false);
    expect(isTerminalStatus("appointment", "awaiting-info")).toBe(false);
    expect(isTerminalStatus("complaint", "awaiting-info")).toBe(false);
    expect(isTerminalStatus("assistance", "awaiting-info")).toBe(false);
  });
});

describe("REPLY_RETURN_STATUS", () => {
  it("returns a replied ticket to under-review, never to its intake status", () => {
    // A ticket that has been reviewed and replied to is not "Pending".
    expect(REPLY_RETURN_STATUS).toBe("under-review");
  });
});

describe("statusEntryCopy", () => {
  it("gives per-kind wording for the same status word", () => {
    expect(statusEntryCopy("application", "approved").title).toBe("Approved");
    expect(statusEntryCopy("complaint", "under-review").title).toBe("Under review");
    expect(statusEntryCopy("appointment", "confirmed").title).toBe("Confirmed");
  });

  it("words awaiting-info as a request, not a delay", () => {
    const copy = statusEntryCopy("application", "awaiting-info");
    expect(copy.title).toBe("More information needed");
    expect(copy.detail).toContain("need something from you");
  });

  it("falls back rather than throwing on an unmapped status", () => {
    const copy = statusEntryCopy("application", "some-future-status" as never);
    expect(copy.title.length).toBeGreaterThan(0);
  });
});
