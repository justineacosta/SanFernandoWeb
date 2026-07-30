import { TicketNotice } from "./shared/TicketNotice";

export interface ApplicationRejectedEmailProps {
  firstName: string;
  ticketNo: string;
  serviceTitle: string;
  remarks: string;
}

export function ApplicationRejectedEmail({
  firstName,
  ticketNo,
  serviceTitle,
  remarks,
}: ApplicationRejectedEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={`Update on your application — ${ticketNo}`}
      headline="Your application was not approved"
      intro={`We reviewed your ${serviceTitle} application and could not approve it.`}
      ticketNo={ticketNo}
      remarksLabel="Reason"
      remarks={remarks}
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
