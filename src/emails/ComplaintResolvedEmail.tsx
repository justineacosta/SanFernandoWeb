import { TicketNotice } from "./shared/TicketNotice";

export interface ComplaintResolvedEmailProps {
  firstName: string;
  ticketNo: string;
  remarks: string | null;
}

export function ComplaintResolvedEmail({ firstName, ticketNo, remarks }: ComplaintResolvedEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={`Your report has been resolved — ${ticketNo}`}
      headline="Your report has been resolved"
      intro="Barangay staff have resolved your report."
      ticketNo={ticketNo}
      remarksLabel="Notes"
      remarks={remarks}
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
