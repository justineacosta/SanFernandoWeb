/**
 * Absolute base URL for links and images inside email templates. Email
 * clients cannot resolve relative paths, unlike the app's own pages.
 */
export const EMAIL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
