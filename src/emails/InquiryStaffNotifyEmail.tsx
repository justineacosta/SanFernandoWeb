import { Button, Text } from "react-email";
import { EmailLayout } from "./EmailLayout";
import { EMAIL_SITE_URL } from "./site-url";

export interface InquiryStaffNotifyEmailProps {
  fullName: string;
  subject: string;
  message: string;
  inquiryId: string;
}

export function InquiryStaffNotifyEmail({ fullName, subject, message, inquiryId }: InquiryStaffNotifyEmailProps) {
  return (
    <EmailLayout previewText={`New inquiry from ${fullName}`}>
      <Text style={{ fontSize: 16, margin: "0 0 12px" }}>New inquiry from {fullName}</Text>
      <Text style={{ fontSize: 14, margin: "0 0 4px" }}>
        <strong>Subject:</strong> {subject}
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.5, margin: "0 0 16px" }}>{message}</Text>
      <Button
        href={`${EMAIL_SITE_URL}/admin/inquiries?review=${inquiryId}`}
        style={{
          backgroundColor: "#b45309",
          color: "#ffffff",
          padding: "10px 20px",
          borderRadius: 6,
          fontSize: 14,
        }}
      >
        View in admin portal
      </Button>
    </EmailLayout>
  );
}
