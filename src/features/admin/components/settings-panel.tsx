"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { SessionUser, TeamUser } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Toast } from "@/components/ui/toast";
import { AdminPageHeader } from "./admin-page-header";
import { TeamManager } from "./team-manager";
import { ToggleSwitch } from "./toggle-switch";

const SAVE_TOAST = "Saved — demo only, backend pending.";

/** Placeholder — SessionUser has no phone field yet (contact data still pending). */
const PLACEHOLDER_PHONE = "(077) 600-2345";

function initialsOf(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

interface SettingsPanelProps {
  team: TeamUser[];
  currentUser: SessionUser;
}

/** Account settings: profile, security, preferences, team roles. Profile/security/preferences saves are mock. */
export function SettingsPanel({ team, currentUser }: SettingsPanelProps) {
  const [profile, setProfile] = useState({
    name: currentUser.fullName,
    email: currentUser.email,
    phone: PLACEHOLDER_PHONE,
  });
  const [profileErrors, setProfileErrors] = useState<{ name?: string; email?: string }>({});
  const [savingProfile, setSavingProfile] = useState(false);

  const [passwords, setPasswords] = useState({ current: "", next: "" });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [twoFactor, setTwoFactor] = useState(true);

  const [language, setLanguage] = useState("en-US");
  const [prefs, setPrefs] = useState({ emailAlerts: true, browserPush: false, weeklyDigest: true });

  const [toast, setToast] = useState<string | null>(null);

  const handleProfileSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors: typeof profileErrors = {};
    if (!profile.name.trim()) nextErrors.name = "Full name is required.";
    if (!profile.email.trim()) nextErrors.email = "Email address is required.";
    setProfileErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSavingProfile(true);
    setTimeout(() => {
      setSavingProfile(false);
      setToast(SAVE_TOAST);
    }, 600);
  };

  const handlePasswordSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!passwords.current || !passwords.next) {
      setPasswordError("Enter your current password and a new password.");
      return;
    }
    setPasswordError(null);
    setSavingPassword(true);
    setTimeout(() => {
      setSavingPassword(false);
      setPasswords({ current: "", next: "" });
      setToast(SAVE_TOAST);
    }, 600);
  };

  return (
    <>
      <AdminPageHeader
        title="Settings"
        description="Manage your account preferences and system configuration."
      />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card className="p-8">
            <h3 className="font-display text-xl font-semibold tracking-tight text-ink-900">
              Profile Information
            </h3>
            <p className="mb-6 text-sm text-ink-600">
              Update your personal details and public profile.
            </p>
            <div className="flex flex-col gap-6 border-t border-ink-200/70 pt-6 sm:flex-row">
              <div className="flex shrink-0 flex-col items-center gap-2">
                <span
                  aria-hidden="true"
                  className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-500 text-2xl font-bold text-white ring-2 ring-brand-400"
                >
                  {initialsOf(currentUser.fullName) || "?"}
                </span>
                <button
                  type="button"
                  onClick={() => setToast(SAVE_TOAST)}
                  className="text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800"
                >
                  Change Photo
                </button>
              </div>
              <form onSubmit={handleProfileSubmit} noValidate className="flex-1 space-y-4">
                <Field label="Full Name" htmlFor="settings-name">
                  <Input
                    id="settings-name"
                    value={profile.name}
                    onChange={(event) =>
                      setProfile((prev) => ({ ...prev, name: event.target.value }))
                    }
                    aria-invalid={Boolean(profileErrors.name)}
                  />
                  {profileErrors.name ? (
                    <p className="text-sm text-danger">{profileErrors.name}</p>
                  ) : null}
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Email Address" htmlFor="settings-email">
                    <Input
                      id="settings-email"
                      type="email"
                      value={profile.email}
                      onChange={(event) =>
                        setProfile((prev) => ({ ...prev, email: event.target.value }))
                      }
                      aria-invalid={Boolean(profileErrors.email)}
                    />
                    {profileErrors.email ? (
                      <p className="text-sm text-danger">{profileErrors.email}</p>
                    ) : null}
                  </Field>
                  <Field label="Contact Number" htmlFor="settings-phone">
                    <Input
                      id="settings-phone"
                      type="tel"
                      value={profile.phone}
                      onChange={(event) =>
                        setProfile((prev) => ({ ...prev, phone: event.target.value }))
                      }
                    />
                  </Field>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={savingProfile}>
                    {savingProfile ? "Saving…" : "Save Profile"}
                  </Button>
                </div>
              </form>
            </div>
          </Card>
          <Card className="p-8">
            <h3 className="font-display text-xl font-semibold tracking-tight text-ink-900">
              Account Security
            </h3>
            <p className="mb-6 text-sm text-ink-600">
              Manage your password and authentication settings.
            </p>
            <form
              onSubmit={handlePasswordSubmit}
              noValidate
              className="space-y-4 border-t border-ink-200/70 pt-6"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Current Password" htmlFor="settings-current-password">
                  <Input
                    id="settings-current-password"
                    type="password"
                    autoComplete="current-password"
                    value={passwords.current}
                    onChange={(event) =>
                      setPasswords((prev) => ({ ...prev, current: event.target.value }))
                    }
                  />
                </Field>
                <Field label="New Password" htmlFor="settings-new-password">
                  <Input
                    id="settings-new-password"
                    type="password"
                    autoComplete="new-password"
                    value={passwords.next}
                    onChange={(event) =>
                      setPasswords((prev) => ({ ...prev, next: event.target.value }))
                    }
                  />
                </Field>
              </div>
              {passwordError ? <p className="text-sm text-danger">{passwordError}</p> : null}
              <div className="flex justify-end">
                <Button variant="outline" type="submit" disabled={savingPassword}>
                  {savingPassword ? "Updating…" : "Update Password"}
                </Button>
              </div>
            </form>
            <div className="mt-6 flex items-center justify-between gap-4 border-t border-ink-200/70 pt-6">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-brand-700" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    Two-Factor Authentication (2FA)
                  </p>
                  <p className="text-sm text-ink-600">
                    Add an extra layer of security to your account.
                  </p>
                </div>
              </div>
              <ToggleSwitch
                label="Two-Factor Authentication"
                checked={twoFactor}
                onChange={setTwoFactor}
              />
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="mb-4 font-display text-lg font-semibold tracking-tight text-ink-900">
              Preferences
            </h3>
            <Field label="Language" htmlFor="settings-language" className="mb-6">
              <Select
                id="settings-language"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                <option value="en-US">English (US)</option>
                <option value="fil">Filipino</option>
                <option value="ilo">Ilocano</option>
              </Select>
            </Field>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-500">
              Notifications
            </p>
            <div className="space-y-4">
              {(
                [
                  ["emailAlerts", "Email Alerts"],
                  ["browserPush", "Browser Push"],
                  ["weeklyDigest", "Weekly Digest"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <span className="text-sm text-ink-700">{label}</span>
                  <ToggleSwitch
                    label={label}
                    checked={prefs[key]}
                    onChange={(checked) => setPrefs((prev) => ({ ...prev, [key]: checked }))}
                  />
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-6">
            <TeamManager team={team} currentUser={currentUser} />
          </Card>
        </div>
      </div>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
