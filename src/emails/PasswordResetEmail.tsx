import { Button, Text } from "react-email";
import { EmailLayout } from "./EmailLayout";

export interface PasswordResetEmailProps {
  resetUrl: string;
}

/**
 * resetUrl is a URL this app constructs itself in requestPasswordReset —
 * `${EMAIL_SITE_URL}/admin/reset-password?token_hash=…`, carrying
 * generateLink()'s `hashed_token` rather than its `action_link` (which would
 * route through Supabase's own /auth/v1/verify endpoint; this flow redeems
 * the token server-side instead). It is already absolute, so unlike
 * TicketNotice's trackHref it is used as-is here, never joined with
 * EMAIL_SITE_URL a second time.
 */
export function PasswordResetEmail({ resetUrl }: PasswordResetEmailProps) {
  return (
    <EmailLayout previewText="Reset your Barangay San Fernando admin password">
      <Text style={{ fontSize: 16, margin: "0 0 12px" }}>Hi,</Text>
      <Text style={{ fontSize: 14, lineHeight: 1.5, margin: "0 0 16px" }}>
        We received a request to reset the password for your Barangay San Fernando staff
        account. Click the button below to choose a new password. This link is valid for a
        short time and can only be used once.
      </Text>
      <Button
        href={resetUrl}
        style={{
          backgroundColor: "#b45309",
          color: "#ffffff",
          padding: "10px 20px",
          borderRadius: 6,
          fontSize: 14,
          marginTop: 8,
        }}
      >
        Reset your password
      </Button>
      <Text style={{ fontSize: 13, lineHeight: 1.5, margin: "16px 0 0", color: "#6b6255" }}>
        If you didn&apos;t request this, you can safely ignore this email — your password will
        not change.
      </Text>
    </EmailLayout>
  );
}
