import { TicketNotice } from "./shared/TicketNotice";

export interface AppointmentDeclinedEmailProps {
  firstName: string;
  ticketNo: string;
  remarks: string;
}

export function AppointmentDeclinedEmail({
  firstName,
  ticketNo,
  remarks,
}: AppointmentDeclinedEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={`Update on your appointment request — ${ticketNo}`}
      headline="Your appointment request was declined"
      intro="We reviewed your appointment request and could not accommodate it."
      ticketNo={ticketNo}
      remarksLabel="Reason"
      remarks={remarks}
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
