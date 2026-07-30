import { Text } from "react-email";
import { EmailLayout } from "./EmailLayout";

export interface InquiryAcknowledgedEmailProps {
  firstName: string;
  subject: string;
}

export function InquiryAcknowledgedEmail({ firstName, subject }: InquiryAcknowledgedEmailProps) {
  return (
    <EmailLayout previewText="We received your message">
      <Text style={{ fontSize: 16, margin: "0 0 12px" }}>Hi {firstName},</Text>
      <Text style={{ fontSize: 14, lineHeight: 1.5, margin: "0 0 12px" }}>
        We received your message about &ldquo;{subject}&rdquo;. Our office typically responds
        within 24-48 business hours.
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>
        This is an automated confirmation — no need to reply unless you have more details to add.
      </Text>
    </EmailLayout>
  );
}
