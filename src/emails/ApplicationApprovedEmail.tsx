import { TicketNotice } from "./shared/TicketNotice";

export interface ApplicationApprovedEmailProps {
  firstName: string;
  ticketNo: string;
  serviceTitle: string;
  requirements: string[];
}

export function ApplicationApprovedEmail({
  firstName,
  ticketNo,
  serviceTitle,
  requirements,
}: ApplicationApprovedEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={`Your application is ready to claim — ${ticketNo}`}
      headline="Your application was approved"
      intro={`Your ${serviceTitle} is ready to claim at the barangay hall.`}
      ticketNo={ticketNo}
      closingNote="Bring a valid ID when you claim it."
      requirements={requirements}
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
