import { Body, Container, Head, Hr, Html, Img, Preview, Section, Text } from "react-email";
import type { ReactNode } from "react";
import { SITE } from "@/constants/site";
import { EMAIL_SITE_URL } from "./site-url";

interface EmailLayoutProps {
  previewText: string;
  children?: ReactNode;
}

/**
 * Shared header/footer for every transactional email — the email equivalent
 * of AdminShell being the one layout for admin pages. Inline styles only:
 * email clients don't reliably load external stylesheets.
 */
export function EmailLayout({ previewText, children }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={{ backgroundColor: "#f5f1ea", fontFamily: "Inter, Arial, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 8,
            maxWidth: 480,
            margin: "0 auto",
            overflow: "hidden",
          }}
        >
          <Section style={{ backgroundColor: "#b45309", padding: "20px 24px", textAlign: "center" }}>
            <Img
              src={`${EMAIL_SITE_URL}/icon.png`}
              width="48"
              height="48"
              alt={SITE.name}
              style={{ margin: "0 auto 8px" }}
            />
            <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: 700, margin: 0 }}>{SITE.name}</Text>
          </Section>
          <Section style={{ padding: "24px" }}>{children}</Section>
          <Hr style={{ borderColor: "#e5e0d8", margin: 0 }} />
          <Section style={{ padding: "16px 24px" }}>
            <Text style={{ color: "#6b6255", fontSize: 12, margin: 0 }}>{SITE.address}</Text>
            <Text style={{ color: "#6b6255", fontSize: 12, margin: 0 }}>
              {SITE.phone} &middot; {SITE.email}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
