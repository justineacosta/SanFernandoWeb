import { TicketNotice } from "./shared/TicketNotice";
import { excerpt } from "./shared/text";

export interface AssistanceSubmittedEmailProps {
  firstName: string;
  ticketNo: string;
  categoryLabel: string;
  details: string;
}

export function AssistanceSubmittedEmail({
  firstName,
  ticketNo,
  categoryLabel,
  details,
}: AssistanceSubmittedEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={`Assistance request received — ${ticketNo}`}
      headline="Assistance request received"
      intro="We received your request. Keep this ticket number, with your last name, to check its status at any time."
      ticketNo={ticketNo}
      detailLines={[
        { label: "Type of assistance", value: categoryLabel },
        { label: "Details", value: excerpt(details) },
      ]}
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
