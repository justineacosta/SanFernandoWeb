import { Button, Text } from "react-email";
import { EmailLayout } from "./EmailLayout";
import { EMAIL_SITE_URL } from "./site-url";

export interface TicketReplyStaffNotifyEmailProps {
  ticketNo: string;
  /** e.g. "incident report". Lower-case, mid-sentence. */
  kindLabel: string;
  attachmentCount: number;
  /** Admin deep link, e.g. "/admin/complaints?review=<id>". */
  adminHref: string;
}

/**
 * Staff-facing: a resident answered an information request.
 *
 * It deliberately takes NO `body` prop. For a complaint, a reply can carry
 * incident detail, and the restraint ComplaintSubmittedEmail already applies —
 * never echoing a narrative, even to the reporter's own inbox — applies here
 * too. Staff read the reply in the admin queue, where it belongs.
 */
export function TicketReplyStaffNotifyEmail({
  ticketNo,
  kindLabel,
  attachmentCount,
  adminHref,
}: TicketReplyStaffNotifyEmailProps) {
  const files =
    attachmentCount === 0
      ? "No files were attached."
      : attachmentCount === 1
        ? "1 file was attached."
        : `${attachmentCount} files were attached.`;

  return (
    <EmailLayout previewText={`Resident reply on ${ticketNo}`}>
      <Text style={{ fontSize: 16, margin: "0 0 12px" }}>
        A resident replied to the information request on {kindLabel} <strong>{ticketNo}</strong>.
      </Text>
      <Text style={{ fontSize: 14, margin: "0 0 16px" }}>{files}</Text>
      <Button
        href={`${EMAIL_SITE_URL}${adminHref}`}
        style={{
          backgroundColor: "#b45309",
          color: "#ffffff",
          padding: "10px 20px",
          borderRadius: 6,
          fontSize: 14,
        }}
      >
        Open in the admin portal
      </Button>
    </EmailLayout>
  );
}
