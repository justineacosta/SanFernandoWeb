import { Button, Text } from "react-email";
import { EmailLayout } from "./EmailLayout";

export interface AccountInviteEmailProps {
  fullName: string;
  setPasswordUrl: string;
}

/**
 * setPasswordUrl carries generateLink()'s recovery hashed_token — the exact
 * mechanism PasswordResetEmail uses, reused as-is here (see createTeamUser's
 * sendAccountInvite helper in src/features/admin/actions/users.ts). It is
 * already absolute, used as-is.
 */
export function AccountInviteEmail({ fullName, setPasswordUrl }: AccountInviteEmailProps) {
  return (
    <EmailLayout previewText="An admin portal account was created for you">
      <Text style={{ fontSize: 16, margin: "0 0 12px" }}>Hi {fullName},</Text>
      <Text style={{ fontSize: 14, lineHeight: 1.5, margin: "0 0 16px" }}>
        A Barangay San Fernando admin portal account was created for you. Click the button
        below to set your password and sign in. This link is valid for a short time and can
        only be used once.
      </Text>
      <Button
        href={setPasswordUrl}
        style={{
          backgroundColor: "#b45309",
          color: "#ffffff",
          padding: "10px 20px",
          borderRadius: 6,
          fontSize: 14,
          marginTop: 8,
        }}
      >
        Set your password
      </Button>
      <Text style={{ fontSize: 13, lineHeight: 1.5, margin: "16px 0 0", color: "#6b6255" }}>
        If you weren&apos;t expecting this, you can ignore this email — no one can access this
        account without setting a password through this link.
      </Text>
    </EmailLayout>
  );
}
