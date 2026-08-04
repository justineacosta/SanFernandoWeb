import { TicketNotice } from "./shared/TicketNotice";

export interface ApplicationSubmittedEmailProps {
  firstName: string;
  ticketNo: string;
  serviceTitle: string;
  /** Optional since migration 0033 — the whole line is dropped when absent. */
  purpose: string | null;
}

export function ApplicationSubmittedEmail({
  firstName,
  ticketNo,
  serviceTitle,
  purpose,
}: ApplicationSubmittedEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={`Application received — ${ticketNo}`}
      headline="Application received"
      intro="We received your application. Keep this ticket number, with your last name, to check its status at any time."
      ticketNo={ticketNo}
      // TicketNotice renders every detail line it is handed, so an absent
      // purpose has to be dropped here or the email prints a bare "Purpose:".
      detailLines={[
        { label: "Document", value: serviceTitle },
        ...(purpose ? [{ label: "Purpose", value: purpose }] : []),
      ]}
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
