import { Button, Text } from "react-email";
import { EmailLayout } from "./EmailLayout";
import { EMAIL_SITE_URL } from "./site-url";

export interface FeedbackStaffNotifyEmailProps {
  category: string;
  subject: string;
  message: string;
  feedbackId: string;
}

export function FeedbackStaffNotifyEmail({
  category,
  subject,
  message,
  feedbackId,
}: FeedbackStaffNotifyEmailProps) {
  return (
    <EmailLayout previewText={`New feedback: ${subject}`}>
      <Text style={{ fontSize: 16, margin: "0 0 12px" }}>New website feedback</Text>
      <Text style={{ fontSize: 14, margin: "0 0 4px" }}>
        <strong>Category:</strong> {category}
      </Text>
      <Text style={{ fontSize: 14, margin: "0 0 4px" }}>
        <strong>Subject:</strong> {subject}
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.5, margin: "0 0 16px" }}>{message}</Text>
      <Button
        href={`${EMAIL_SITE_URL}/admin/inquiries?tab=feedback&review=${feedbackId}`}
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
