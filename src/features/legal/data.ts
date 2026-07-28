export interface LegalSection {
  heading: string;
  body: string[];
}

export interface LegalDocument {
  title: string;
  intro: string;
  sections: LegalSection[];
}

/**
 * Placeholder text only — same treatment CLAUDE.md already documents for
 * CAPTAIN.message in src/features/about/data.ts: real legal text has to come
 * from the barangay/legal counsel before launch. Inventing convincing-
 * sounding legal language here would be worse than the gap staying visible.
 */
export const PRIVACY_POLICY: LegalDocument = {
  title: "Privacy Policy",
  intro:
    "This page has not yet been reviewed by the barangay or legal counsel. The text below is a placeholder outline, not the barangay's actual privacy policy.",
  sections: [
    {
      heading: "What this page will cover",
      body: [
        "How information submitted through this website — certificate applications, appointments, complaints, assistance requests, contact messages, alert sign-ups, and anonymous site feedback — is collected, used, and retained.",
        "Real policy text is pending review from the barangay and legal counsel before this site launches publicly.",
      ],
    },
  ],
};

export const TERMS_OF_USE: LegalDocument = {
  title: "Terms of Use",
  intro:
    "This page has not yet been reviewed by the barangay or legal counsel. The text below is a placeholder outline, not the barangay's actual terms of use.",
  sections: [
    {
      heading: "What this page will cover",
      body: [
        "The rules for using this website: the four ticketing flows, the transparency document archive, the public contact and feedback forms, and account use for signed-in staff.",
        "Real terms text is pending review from the barangay and legal counsel before this site launches publicly.",
      ],
    },
  ],
};
