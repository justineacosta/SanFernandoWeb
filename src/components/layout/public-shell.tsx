import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { FeedbackLauncher } from "@/features/feedback";

/**
 * Public-site chrome: floating header, content area, footer, and the feedback
 * launcher.
 *
 * The launcher is mounted here rather than per page so every public route
 * carries it — and so the admin portal, which has its own layout, carries none.
 * It sits as a sibling of the header, not inside it: the chrome bars use
 * `backdrop-filter`, which would become the containing block for a `fixed`
 * descendant and pin the button to the header instead of the viewport.
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-grow">{children}</main>
      <SiteFooter />
      <FeedbackLauncher />
    </div>
  );
}
