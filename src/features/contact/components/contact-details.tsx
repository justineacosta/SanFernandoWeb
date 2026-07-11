import { Siren } from "lucide-react";
import { EMERGENCY_HOTLINES, SOCIAL_LINKS } from "@/constants/site";
import { Card } from "@/components/ui/card";
import { IconCircle } from "@/components/ui/icon-circle";
import { CONTACT_CHANNELS } from "@/features/contact/data";

/** Left rail of the contact page: channels, socials, and the emergency widget. */
export function ContactDetails() {
  return (
    <Card className="h-full rounded-3xl p-8">
      <h2 className="mb-8 text-2xl font-semibold tracking-tight text-ink-900">Contact Details</h2>
      <div className="space-y-8">
        {CONTACT_CHANNELS.map((channel) => (
          <div key={channel.label} className="flex items-start gap-4">
            <IconCircle icon={channel.icon} tone="primary" square />
            <div>
              <h3 className="mb-1 text-sm font-semibold uppercase tracking-wider text-ink-500">
                {channel.label}
              </h3>
              {channel.lines.map((line) => (
                <p key={line} className="text-ink-900">
                  {line}
                </p>
              ))}
            </div>
          </div>
        ))}

        <div className="border-t border-ink-200 pt-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ink-500">
            Follow Us
          </h3>
          <div className="flex gap-4">
            {SOCIAL_LINKS.map(({ label, href, icon: Icon }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                className="flex items-center justify-center rounded-full bg-ink-100 p-3 text-ink-900 transition-colors hover:bg-brand-100"
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-danger/20 bg-danger-soft p-6">
          <div className="mb-2 flex items-center gap-2 text-danger-soft-fg">
            <Siren className="h-5 w-5" aria-hidden="true" />
            <h3 className="text-lg font-semibold tracking-tight">Emergency Hotlines</h3>
          </div>
          {EMERGENCY_HOTLINES.slice(0, 2).map((hotline) => (
            <p key={hotline.label} className="font-bold text-danger-soft-fg">
              {hotline.label}: {hotline.number}
            </p>
          ))}
        </div>
      </div>
    </Card>
  );
}
