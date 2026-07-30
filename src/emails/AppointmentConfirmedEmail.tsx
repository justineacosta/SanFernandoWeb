import { formatDate } from "@/lib/format";
import { TicketNotice } from "./shared/TicketNotice";
import { periodLabel } from "./shared/text";

export interface AppointmentConfirmedEmailProps {
  firstName: string;
  ticketNo: string;
  confirmedDate: string;
  confirmedPeriod: "am" | "pm";
}

export function AppointmentConfirmedEmail({
  firstName,
  ticketNo,
  confirmedDate,
  confirmedPeriod,
}: AppointmentConfirmedEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={`Your appointment is confirmed — ${ticketNo}`}
      headline="Your appointment is confirmed"
      intro="Barangay staff confirmed your appointment. This may be a different date or time than you requested — please check the schedule below."
      ticketNo={ticketNo}
      detailLines={[
        {
          label: "Confirmed schedule",
          value: `${formatDate(confirmedDate)} · ${periodLabel(confirmedPeriod)}`,
        },
      ]}
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
