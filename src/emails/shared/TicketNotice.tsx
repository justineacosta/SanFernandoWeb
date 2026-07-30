import { Button, Text } from "react-email";
import { EmailLayout } from "../EmailLayout";
import { EMAIL_SITE_URL } from "../site-url";

export interface TicketNoticeDetailLine {
  label: string;
  value: string;
}

export interface TicketNoticeProps {
  firstName: string;
  previewText: string;
  headline: string;
  intro: string;
  ticketNo: string;
  detailLines?: TicketNoticeDetailLine[];
  remarksLabel?: string;
  remarks?: string | null;
  closingNote?: string;
  requirementsLabel?: string;
  requirements?: string[];
  trackHref: string;
}

/**
 * Shared body for every resident-facing ticket email — submission receipts and
 * status-change notices across all four ticketing flows. The email equivalent
 * of EmailLayout being the one wrapper: one place owns the ticket-number
 * treatment and the "Track this ticket" button so 12 near-identical templates
 * don't hand-roll the same markup.
 */
export function TicketNotice({
  firstName,
  previewText,
  headline,
  intro,
  ticketNo,
  detailLines = [],
  remarksLabel = "Remarks",
  remarks,
  closingNote,
  requirementsLabel = "Bring these when you claim it",
  requirements = [],
  trackHref,
}: TicketNoticeProps) {
  return (
    <EmailLayout previewText={previewText}>
      <Text style={{ fontSize: 16, margin: "0 0 12px" }}>Hi {firstName},</Text>
      <Text style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px" }}>{headline}</Text>
      <Text style={{ fontSize: 14, lineHeight: 1.5, margin: "0 0 16px" }}>{intro}</Text>
      <Text
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: 1,
          margin: "0 0 4px",
          color: "#6b6255",
        }}
      >
        Ticket number
      </Text>
      <Text style={{ fontSize: 22, fontWeight: 700, margin: "0 0 16px", color: "#b45309" }}>
        {ticketNo}
      </Text>
      {detailLines.map((line) => (
        <Text key={line.label} style={{ fontSize: 14, margin: "0 0 4px" }}>
          <strong>{line.label}:</strong> {line.value}
        </Text>
      ))}
      {remarks ? (
        <Text style={{ fontSize: 14, lineHeight: 1.5, margin: "16px 0 0" }}>
          <strong>{remarksLabel}:</strong> {remarks}
        </Text>
      ) : null}
      {closingNote ? (
        <Text style={{ fontSize: 14, lineHeight: 1.5, margin: "16px 0" }}>{closingNote}</Text>
      ) : null}
      {requirements.length > 0 ? (
        <>
          <Text style={{ fontSize: 14, fontWeight: 700, margin: "16px 0 4px" }}>
            {requirementsLabel}:
          </Text>
          {requirements.map((requirement, index) => (
            <Text key={`${index}-${requirement}`} style={{ fontSize: 14, lineHeight: 1.5, margin: "0 0 4px" }}>
              • {requirement}
            </Text>
          ))}
        </>
      ) : null}
      <Button
        href={`${EMAIL_SITE_URL}${trackHref}`}
        style={{
          backgroundColor: "#b45309",
          color: "#ffffff",
          padding: "10px 20px",
          borderRadius: 6,
          fontSize: 14,
          marginTop: 8,
        }}
      >
        Track this ticket
      </Button>
    </EmailLayout>
  );
}
