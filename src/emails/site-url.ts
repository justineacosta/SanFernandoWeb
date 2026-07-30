/**
 * Absolute base URL for links and images inside email templates. Email
 * clients cannot resolve relative paths, unlike the app's own pages.
 *
 * Never throws — this must stay usable in dev/test with no env vars set,
 * same reasoning as sendEmail()'s own fail-open shape. But an unset
 * NEXT_PUBLIC_SITE_URL in production is a silent misconfiguration: every
 * email would ship a broken http://localhost:3000/icon.png image and dead
 * admin-portal links with nothing in the logs, so this logs via
 * console.error the same way sendEmail() does for a missing
 * RESEND_API_KEY.
 */
const siteUrlEnv = process.env.NEXT_PUBLIC_SITE_URL;

if (!siteUrlEnv && process.env.NODE_ENV === "production") {
  console.error(
    "EMAIL_SITE_URL: NEXT_PUBLIC_SITE_URL is not set; email links and images will point at localhost in production.",
  );
}

export const EMAIL_SITE_URL = siteUrlEnv ?? "http://localhost:3000";
