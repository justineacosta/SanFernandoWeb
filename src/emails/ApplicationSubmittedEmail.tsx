import { TicketNotice } from "./shared/TicketNotice";

export interface ApplicationSubmittedEmailProps {
  firstName: string;
  ticketNo: string;
  serviceTitle: string;
  purpose: string;
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
      detailLines={[
        { label: "Document", value: serviceTitle },
        { label: "Purpose", value: purpose },
      ]}
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
