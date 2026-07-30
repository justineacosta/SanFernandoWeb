import { TicketNotice } from "./shared/TicketNotice";

export interface ComplaintDismissedEmailProps {
  firstName: string;
  ticketNo: string;
  remarks: string;
}

export function ComplaintDismissedEmail({ firstName, ticketNo, remarks }: ComplaintDismissedEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={`Update on your report — ${ticketNo}`}
      headline="Your report was dismissed"
      intro="We reviewed your report and it has been dismissed."
      ticketNo={ticketNo}
      remarksLabel="Reason"
      remarks={remarks}
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
