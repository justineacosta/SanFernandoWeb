import { TicketNotice } from "./shared/TicketNotice";

export interface TicketUpdateEmailProps {
  firstName: string;
  ticketNo: string;
  /** e.g. "certificate application", "incident report". Lower-case, mid-sentence. */
  kindLabel: string;
  /** Exactly what staff typed. Never a field read from the ticket row itself. */
  body: string;
  /** True when this update also moved the ticket to `awaiting-info`. */
  needsInfo: boolean;
}

/**
 * One template for both a plain update and an information request, switched by
 * `needsInfo` rather than split into two near-identical files — the same DRY
 * reasoning that produced the shared <TicketNotice>.
 *
 * `body` is the ONLY variable content that reaches the resident. Nothing is read
 * from the ticket row, which is what keeps the "complaints show status only"
 * rule intact by construction rather than by review.
 */
export function TicketUpdateEmail({
  firstName,
  ticketNo,
  kindLabel,
  body,
  needsInfo,
}: TicketUpdateEmailProps) {
  return (
    <TicketNotice
      firstName={firstName}
      previewText={needsInfo ? `We need more information — ${ticketNo}` : `Update on your ${kindLabel}`}
      headline={needsInfo ? "We need more information" : "There's an update on your request"}
      intro={
        needsInfo
          ? `Before we can move your ${kindLabel} forward, barangay staff need something from you.`
          : `Barangay staff have posted an update on your ${kindLabel}.`
      }
      ticketNo={ticketNo}
      remarksLabel={needsInfo ? "What we need" : "Update"}
      remarks={body}
      trackHref={`/track?ticket=${ticketNo}`}
      trackLabel={needsInfo ? "Send the information" : "Track this ticket"}
    />
  );
}
