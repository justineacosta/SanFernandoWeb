import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Permission } from "@/types";
import { MODULE_META, MODULE_PERMISSION } from "@/features/admin/search-modules";

// vi.mock factories are hoisted above regular `const` declarations, so the
// mock functions themselves must be created inside vi.hoisted() — same
// reasoning tests/unit/email.test.ts documents for its own `resend` mock.
const { fromMock, createSupabaseAdminClientMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  createSupabaseAdminClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: createSupabaseAdminClientMock,
}));

import {
  NOTIFICATION_QUEUES,
  countForNavHref,
  formatRelativeTime,
  hasUnseen,
  mergeRecent,
  permittedQueues,
  staffEmailsFor,
  staffQualifies,
  type NotificationCounts,
  type NotificationItem,
} from "@/lib/notifications";

/**
 * The request-notifications registry (2026-07-25). Mirrors why admin-nav.ts
 * is unit-tested: this is the portal's other pure gating/derivation layer,
 * and getting the gate wrong silently leaks which modules exist.
 */

const superAdmin = { isSuperAdmin: true, permissions: [] as Permission[] };
const inquiriesOnly = { isSuperAdmin: false, permissions: ["handle-inquiries"] as Permission[] };
const nobody = { isSuperAdmin: false, permissions: [] as Permission[] };

describe("permittedQueues", () => {
  it("gives a SuperAdmin every queue", () => {
    expect(permittedQueues(superAdmin)).toHaveLength(6);
  });

  it("gives an inquiries handler both inquiries and feedback, nothing else", () => {
    expect(permittedQueues(inquiriesOnly)).toEqual(["inquiries", "feedback"]);
  });

  it("gives someone with no permissions nothing", () => {
    expect(permittedQueues(nobody)).toEqual([]);
  });
});

describe("countForNavHref", () => {
  const counts: NotificationCounts = {
    applications: 12,
    complaints: 3,
    appointments: 5,
    assistance: 1,
    inquiries: 6,
    feedback: 2,
  };

  it("sums inquiries and feedback under their shared nav row", () => {
    expect(countForNavHref(counts, permittedQueues(superAdmin), "/admin/inquiries")).toBe(8);
  });

  it("returns a single queue's count for a row with only one queue", () => {
    expect(countForNavHref(counts, permittedQueues(superAdmin), "/admin/applications")).toBe(12);
  });

  it("excludes a queue the viewer cannot see", () => {
    expect(countForNavHref(counts, permittedQueues(inquiriesOnly), "/admin/applications")).toBe(0);
  });
});

describe("hasUnseen", () => {
  const item = (createdAt: string): NotificationItem => ({
    queue: "applications",
    id: "1",
    label: "APP-0001",
    sublabel: "Barangay Clearance",
    createdAt,
    href: "/admin/applications?review=1",
  });

  it("is false with nothing outstanding", () => {
    expect(hasUnseen([], null)).toBe(false);
  });

  it("is true when never seen and something is outstanding", () => {
    expect(hasUnseen([item("2026-07-25T10:00:00Z")], null)).toBe(true);
  });

  it("is false when the newest item is older than the last look", () => {
    expect(hasUnseen([item("2026-07-25T10:00:00Z")], "2026-07-25T12:00:00Z")).toBe(false);
  });

  it("is true when something arrived after the last look", () => {
    expect(hasUnseen([item("2026-07-25T13:00:00Z")], "2026-07-25T12:00:00Z")).toBe(true);
  });
});

describe("mergeRecent", () => {
  const item = (id: string, createdAt: string): NotificationItem => ({
    queue: "applications",
    id,
    label: id,
    sublabel: "",
    createdAt,
    href: "",
  });

  it("orders across queues by recency", () => {
    const a = [item("a", "2026-07-25T09:00:00Z")];
    const b = [item("b", "2026-07-25T11:00:00Z"), item("c", "2026-07-25T08:00:00Z")];
    expect(mergeRecent([a, b], 10).map((entry) => entry.id)).toEqual(["b", "a", "c"]);
  });

  it("honours the limit", () => {
    const a = [item("a", "2026-07-25T09:00:00Z"), item("b", "2026-07-25T10:00:00Z")];
    expect(mergeRecent([a], 1).map((entry) => entry.id)).toEqual(["b"]);
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-07-25T12:00:00Z");

  it("reads as just now under a minute", () => {
    expect(formatRelativeTime("2026-07-25T11:59:30Z", now)).toBe("just now");
  });

  it("reads in minutes under an hour", () => {
    expect(formatRelativeTime("2026-07-25T11:45:00Z", now)).toBe("15m ago");
  });

  it("reads in hours under a day", () => {
    expect(formatRelativeTime("2026-07-25T09:00:00Z", now)).toBe("3h ago");
  });

  it("reads in days beyond that", () => {
    expect(formatRelativeTime("2026-07-22T12:00:00Z", now)).toBe("3d ago");
  });
});

describe("staffQualifies", () => {
  it("qualifies a SuperAdmin regardless of their permissions list", () => {
    expect(staffQualifies({ isSuperAdmin: true, permissions: [] }, "handle-inquiries")).toBe(true);
  });

  it("qualifies a staff member who holds the exact permission", () => {
    expect(
      staffQualifies({ isSuperAdmin: false, permissions: ["handle-inquiries"] }, "handle-inquiries"),
    ).toBe(true);
  });

  it("does not qualify a staff member missing the permission", () => {
    expect(
      staffQualifies({ isSuperAdmin: false, permissions: ["process-applications"] }, "handle-inquiries"),
    ).toBe(false);
  });
});

describe("staffEmailsFor", () => {
  /**
   * Builds a stub matching admin.from("profiles").select(...).eq(...).eq(...),
   * where the second .eq() resolves to `result` — mirroring the real
   * Supabase query builder, which is thenable at any point in the chain.
   */
  function stubQuery(result: { data: unknown; error: { message: string } | null }) {
    const eq2 = vi.fn().mockResolvedValue(result);
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    fromMock.mockReturnValue({ select });
    return { select, eq1, eq2 };
  }

  beforeEach(() => {
    fromMock.mockReset();
    createSupabaseAdminClientMock.mockReset();
    createSupabaseAdminClientMock.mockReturnValue({ from: fromMock });
  });

  it("returns emails only for profiles that qualify, reusing staffQualifies", async () => {
    stubQuery({
      data: [
        { email: "super@example.com", is_superadmin: true, permissions: [] },
        { email: "handler@example.com", is_superadmin: false, permissions: ["handle-inquiries"] },
        { email: "other@example.com", is_superadmin: false, permissions: ["process-applications"] },
      ],
      error: null,
    });

    const result = await staffEmailsFor("handle-inquiries");

    expect(result).toEqual(["super@example.com", "handler@example.com"]);
  });

  it("returns an empty array, not a throw, when the query errors", async () => {
    stubQuery({ data: null, error: { message: "connection refused" } });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await staffEmailsFor("handle-inquiries");

    expect(result).toEqual([]);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("filters active, non-archived profiles server-side via .eq()", async () => {
    const { select, eq1, eq2 } = stubQuery({ data: [], error: null });

    await staffEmailsFor("handle-inquiries");

    expect(select).toHaveBeenCalledWith("email, is_superadmin, permissions");
    expect(eq1).toHaveBeenCalledWith("is_active", true);
    expect(eq2).toHaveBeenCalledWith("is_archived", false);
  });
});

describe("registry agreement with search-modules", () => {
  // `inquiries` has no search-modules entry, and four search modules
  // (news, officials, ...) carry no notification — only these five keys are
  // defined in both registries, so only these five can drift against each
  // other. See src/lib/notifications.ts's file comment for why the two
  // registries are not merged into one.
  const shared = ["applications", "appointments", "complaints", "assistance", "feedback"] as const;

  it("agrees with search-modules on permission and href for every shared key", () => {
    for (const key of shared) {
      expect(NOTIFICATION_QUEUES[key].permission).toBe(MODULE_PERMISSION[key]);
      expect(NOTIFICATION_QUEUES[key].navHref).toBe(MODULE_META[key].href);
    }
  });
});
