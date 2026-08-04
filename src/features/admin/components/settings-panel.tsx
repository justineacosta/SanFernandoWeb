import type { SessionUser } from "@/types";
import { Card } from "@/components/ui/card";
import { AdminPageHeader } from "./admin-page-header";
import { AccountProfileForm } from "./account-profile-form";
import { AccountSecurityForm } from "./account-security-form";

interface SettingsPanelProps {
  currentUser: SessionUser;
}

/** Account settings: profile and security. Both forms own their own saves. */
export function SettingsPanel({ currentUser }: SettingsPanelProps) {
  return (
    <>
      <AdminPageHeader
        title="Settings"
        description="Manage your account profile and security."
      />
      {/*
        The pair goes side by side at xl, not lg: at lg each card's inner width
        is ~276px once the sidebar and page padding are taken out, which is
        narrower than the profile card's avatar-beside-fields row can take.
        items-start keeps each card its natural height instead of stretching the
        shorter one. min-w-0 on the items is load-bearing — a grid item defaults
        to min-width:auto, so the truncating rows inside would floor the track at
        their min-content width and pan the whole page sideways.
      */}
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card className="min-w-0 p-8">
          <h3 className="font-display text-xl font-semibold tracking-tight text-ink-900">
            Profile Information
          </h3>
          <p className="mb-6 text-sm text-ink-600">
            Update your personal details and public profile.
          </p>
          <AccountProfileForm currentUser={currentUser} />
        </Card>
        <Card className="min-w-0 p-8">
          <h3 className="font-display text-xl font-semibold tracking-tight text-ink-900">
            Account Security
          </h3>
          <p className="mb-6 text-sm text-ink-600">
            Manage your password and authentication settings.
          </p>
          <AccountSecurityForm />
        </Card>
      </div>
    </>
  );
}
