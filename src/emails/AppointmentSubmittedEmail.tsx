import { formatDate } from "@/lib/format";
import { TicketNotice } from "./shared/TicketNotice";
import { periodLabel } from "./shared/text";

export interface AppointmentSubmittedEmailProps {
  firstName: string;
  ticketNo: string;
  purpose: string;
  preferredDate: string;
  preferredPeriod: "am" | "pm";
}

export function AppointmentSubmittedEmail({
  firstName,
  ticketNo,
  purpose,
  preferredDate,
  preferredPeriod,
}: AppointmentSubmittedEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={`Appointment request received — ${ticketNo}`}
      headline="Appointment request received"
      intro="We received your appointment request. Keep this ticket number, with your last name, to check its status at any time."
      ticketNo={ticketNo}
      detailLines={[
        { label: "Purpose", value: purpose },
        {
          label: "Requested schedule",
          value: `${formatDate(preferredDate)} · ${periodLabel(preferredPeriod)}`,
        },
      ]}
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
