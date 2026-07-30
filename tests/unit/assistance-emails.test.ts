import { createElement } from "react";
import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";
import { AssistanceDeclinedEmail } from "@/emails/AssistanceDeclinedEmail";
import { AssistanceGrantedEmail } from "@/emails/AssistanceGrantedEmail";
import { AssistanceSubmittedEmail } from "@/emails/AssistanceSubmittedEmail";

describe("AssistanceSubmittedEmail", () => {
  it("includes the category and a truncated details excerpt", async () => {
    const html = await render(
      createElement(AssistanceSubmittedEmail, {
        firstName: "Maria",
        ticketNo: "AST-2026-00001",
        categoryLabel: "Medical Assistance",
        details: "a".repeat(300),
      }),
    );

    expect(html).toContain("Medical Assistance");
    expect(html).toContain("AST-2026-00001");
    expect(html).toContain(`${"a".repeat(200)}…`);
  });
});

describe("AssistanceGrantedEmail", () => {
  it("names the category in the intro", async () => {
    const html = await render(
      createElement(AssistanceGrantedEmail, {
        firstName: "Maria",
        ticketNo: "AST-2026-00001",
        categoryLabel: "Medical Assistance",
        remarks: null,
      }),
    );

    expect(html).toContain("granted");
    expect(html).toContain("Medical Assistance");
  });
});

describe("AssistanceDeclinedEmail", () => {
  it("includes the reason under the Reason label", async () => {
    const html = await render(
      createElement(AssistanceDeclinedEmail, {
        firstName: "Maria",
        ticketNo: "AST-2026-00001",
        remarks: "Does not meet the eligibility criteria.",
      }),
    );

    expect(html).toContain("Reason");
    expect(html).toContain("Does not meet the eligibility criteria.");
  });
});
