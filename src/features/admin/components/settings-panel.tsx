"use client";

import { useState } from "react";
import type { SessionUser } from "@/types";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form";
import { AdminPageHeader } from "./admin-page-header";
import { AccountProfileForm } from "./account-profile-form";
import { AccountSecurityForm } from "./account-security-form";
import { ToggleSwitch } from "./toggle-switch";

interface SettingsPanelProps {
  currentUser: SessionUser;
}

/** Account settings: profile, security, preferences, team roles. Profile/security/preferences saves are mock. */
export function SettingsPanel({ currentUser }: SettingsPanelProps) {
  const [language, setLanguage] = useState("en-US");
  const [prefs, setPrefs] = useState({ emailAlerts: true, browserPush: false, weeklyDigest: true });

  return (
    <>
      <AdminPageHeader
        title="Settings"
        description="Manage your account preferences and system configuration."
      />
      {/*
        min-w-0 on both grid items is load-bearing. A grid item defaults to
        min-width:auto, flooring its track at the item's min-content width — so
        on the single-column mobile grid the widest card pushes the track past
        the viewport and the whole page pans sideways. min-w-0 lets the track
        collapse to the viewport; the truncating rows inside then shrink with it.
      */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <Card className="p-8">
            <h3 className="font-display text-xl font-semibold tracking-tight text-ink-900">
              Profile Information
            </h3>
            <p className="mb-6 text-sm text-ink-600">
              Update your personal details and public profile.
            </p>
            <AccountProfileForm currentUser={currentUser} />
          </Card>
          <Card className="p-8">
            <h3 className="font-display text-xl font-semibold tracking-tight text-ink-900">
              Account Security
            </h3>
            <p className="mb-6 text-sm text-ink-600">
              Manage your password and authentication settings.
            </p>
            <AccountSecurityForm />
          </Card>
        </div>
        <div className="min-w-0 space-y-6">
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
        </div>
      </div>
    </>
  );
}
