import { TicketNotice } from "./shared/TicketNotice";

export interface AssistanceGrantedEmailProps {
  firstName: string;
  ticketNo: string;
  categoryLabel: string;
  remarks: string | null;
}

export function AssistanceGrantedEmail({
  firstName,
  ticketNo,
  categoryLabel,
  remarks,
}: AssistanceGrantedEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={`Your assistance request was granted — ${ticketNo}`}
      headline="Your assistance request was granted"
      intro={`Your request for ${categoryLabel} was granted. Please visit the barangay hall for next steps.`}
      ticketNo={ticketNo}
      remarksLabel="Notes"
      remarks={remarks}
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
