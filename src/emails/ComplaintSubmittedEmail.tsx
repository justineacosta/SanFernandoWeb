import { formatDate } from "@/lib/format";
import { TicketNotice } from "./shared/TicketNotice";

export interface ComplaintSubmittedEmailProps {
  firstName: string;
  ticketNo: string;
  incidentDate: string;
  location: string;
}

export function ComplaintSubmittedEmail({
  firstName,
  ticketNo,
  incidentDate,
  location,
}: ComplaintSubmittedEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={`Report filed — ${ticketNo}`}
      headline="Report filed"
      intro="We received your report. Keep this ticket number, with your last name, to check its status at any time — tracking shows status only, never the details you wrote."
      ticketNo={ticketNo}
      detailLines={[
        { label: "Date of incident", value: formatDate(incidentDate) },
        { label: "Location", value: location },
      ]}
      trackHref={`/track?ticket=${encodeURIComponent(ticketNo)}`}
    />
  );
}
