import { TicketNotice } from "./shared/TicketNotice";

export interface AssistanceDeclinedEmailProps {
  firstName: string;
  ticketNo: string;
  remarks: string;
}

export function AssistanceDeclinedEmail({
  firstName,
  ticketNo,
  remarks,
}: AssistanceDeclinedEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={`Update on your assistance request — ${ticketNo}`}
      headline="Your assistance request was declined"
      intro="We reviewed your request and could not grant it."
      ticketNo={ticketNo}
      remarksLabel="Reason"
      remarks={remarks}
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
