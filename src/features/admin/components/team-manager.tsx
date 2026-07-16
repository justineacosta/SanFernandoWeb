"use client";

import { useState, useTransition } from "react";
import { Plus, Archive, Trash2, Pencil } from "lucide-react";
import type { Permission, SessionUser, StaffStatusLabel, TeamUser } from "@/types";
import { PERMISSION_GROUPS, PERMISSION_LABELS, STATUS_PRESETS } from "@/constants/permissions";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrength } from "@/components/ui/password-strength";
import { Toast } from "@/components/ui/toast";
import {
  archiveTeamUser,
  createTeamUser,
  deleteTeamUser,
  setTeamUserActive,
  updateTeamUser,
} from "@/features/admin/actions/users";

interface TeamManagerProps {
  team: TeamUser[];
  currentUser: SessionUser;
}

interface DrawerState {
  mode: "create" | "edit";
  user?: TeamUser;
}

const inputClass =
  "w-full rounded-full border border-ink-200 bg-ink-50 px-4 py-2 text-sm text-ink-900 transition-colors focus:border-ink-300 focus:outline-none focus:ring-1 focus:ring-brand-400/30";

/** Team management: list, create/edit drawer with permission checkboxes, row actions. */
export function TeamManager({ team, currentUser }: TeamManagerProps) {
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Controlled drawer form state.
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [statusLabel, setStatusLabel] = useState<StaffStatusLabel>("staff");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [permissions, setPermissions] = useState<Permission[]>(STATUS_PRESETS.staff);

  const editingSelf = drawer?.mode === "edit" && drawer.user?.id === currentUser.id;

  function openCreate() {
    setFullName("");
    setEmail("");
    setPassword("");
    setStatusLabel("staff");
    setIsSuperAdmin(false);
    setPermissions(STATUS_PRESETS.staff);
    setFormError(null);
    setDrawer({ mode: "create" });
  }

  function openEdit(user: TeamUser) {
    setFullName(user.fullName);
    setEmail(user.email);
    setPassword("");
    setStatusLabel(user.statusLabel);
    setIsSuperAdmin(user.isSuperAdmin);
    setPermissions(user.permissions);
    setFormError(null);
    setDrawer({ mode: "edit", user });
  }

  /** Picking a label re-applies its preset; SuperAdmin can adjust after. */
  function applyStatusLabel(label: StaffStatusLabel) {
    setStatusLabel(label);
    setPermissions(STATUS_PRESETS[label]);
  }

  function togglePermission(permission: Permission) {
    setPermissions((current) =>
      current.includes(permission)
        ? current.filter((p) => p !== permission)
        : [...current, permission],
    );
  }

  function submit() {
    startTransition(async () => {
      const result =
        drawer?.mode === "edit" && drawer.user
          ? await updateTeamUser(drawer.user.id, {
              fullName,
              statusLabel,
              permissions,
              isSuperAdmin,
              ...(drawer.user.id !== currentUser.id && email !== drawer.user.email
                ? { email }
                : {}),
            })
          : await createTeamUser({
              fullName,
              email,
              password,
              statusLabel,
              permissions,
              isSuperAdmin,
            });
      if (result.error) {
        setFormError(result.error);
        return;
      }
      setDrawer(null);
      setToast(drawer?.mode === "edit" ? "User updated." : "User created.");
    });
  }

  function runRowAction(action: () => Promise<{ error: string | null }>, success: string) {
    startTransition(async () => {
      const result = await action();
      setToast(result.error ?? success);
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold text-ink-900">Manage Users</h3>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add user
        </Button>
      </div>

      <ul className="divide-y divide-ink-200/70 rounded-2xl border border-ink-200/70">
        {team.map((member) => (
          <li key={member.id} className="flex items-center justify-between gap-4 p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">
                {member.fullName}
                {member.id === currentUser.id ? (
                  <span className="ml-2 text-xs font-medium text-brand-600">(you)</span>
                ) : null}
              </p>
              <p className="truncate text-xs text-ink-500">
                {member.email} ·{" "}
                <span className="capitalize">
                  {member.isSuperAdmin ? "SuperAdmin" : member.statusLabel}
                </span>{" "}
                · {member.isSuperAdmin ? "all permissions" : `${member.permissions.length} permission(s)`}
                {member.isActive ? "" : " · disabled"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label={`Edit ${member.fullName}`}
                onClick={() => openEdit(member)}
                className="rounded-full p-2 text-ink-600 transition-colors hover:bg-ink-50"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={isPending || member.id === currentUser.id}
                onClick={() =>
                  runRowAction(
                    () => setTeamUserActive(member.id, !member.isActive),
                    member.isActive ? "User disabled." : "User enabled.",
                  )
                }
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-ink-600 transition-colors hover:bg-ink-50 disabled:opacity-40"
              >
                {member.isActive ? "Disable" : "Enable"}
              </button>
              <button
                type="button"
                aria-label={`Archive ${member.fullName}`}
                disabled={isPending || member.id === currentUser.id}
                onClick={() => runRowAction(() => archiveTeamUser(member.id), "User archived.")}
                className="rounded-full p-2 text-ink-600 transition-colors hover:bg-ink-50 disabled:opacity-40"
              >
                <Archive className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Delete ${member.fullName}`}
                disabled={isPending || member.id === currentUser.id}
                onClick={() => runRowAction(() => deleteTeamUser(member.id), "User deleted.")}
                className="rounded-full p-2 text-danger transition-colors hover:bg-danger/10 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer?.mode === "edit" ? "Edit user" : "Add user"}
      >
        <div className="flex h-full flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            <label className="text-sm font-semibold text-ink-700">
              Full name
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-sm font-semibold text-ink-700">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={editingSelf}
                className={`mt-1 ${inputClass} ${editingSelf ? "cursor-not-allowed opacity-60" : ""}`}
              />
              {editingSelf ? (
                <span className="mt-1 block text-xs font-normal text-ink-500">
                  You cannot change your own email.
                </span>
              ) : null}
            </label>
            {drawer?.mode === "create" ? (
              <label className="text-sm font-semibold text-ink-700">
                Temporary password (min 10 characters)
                <div className="mt-1">
                  <PasswordInput
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <PasswordStrength value={password} />
              </label>
            ) : null}

            <fieldset>
              <legend className="text-sm font-semibold text-ink-700">Status label</legend>
              <p className="mb-2 text-xs text-ink-500">
                A title with a permission preset — actual power is the checkboxes below.
              </p>
              <div className="flex gap-2">
                {(["staff", "editor"] as const).map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => applyStatusLabel(label)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition-colors ${
                      statusLabel === label
                        ? "bg-brand-500 text-white"
                        : "border border-ink-200 text-ink-600 hover:bg-ink-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="flex items-center gap-2 text-sm font-semibold text-ink-700">
              <input
                type="checkbox"
                checked={isSuperAdmin}
                disabled={editingSelf}
                onChange={(e) => setIsSuperAdmin(e.target.checked)}
                className="h-4 w-4 accent-brand-500 disabled:opacity-50"
              />
              SuperAdmin (full power, manages users — ignores the checkboxes below)
            </label>
            {editingSelf ? (
              <p className="text-xs text-ink-500">
                You cannot change your own SuperAdmin status.
              </p>
            ) : null}

            {PERMISSION_GROUPS.map((group) => (
              <fieldset key={group.title} disabled={isSuperAdmin} className="disabled:opacity-40">
                <legend className="text-sm font-semibold text-ink-700">{group.title}</legend>
                <div className="mt-1 flex flex-col gap-1.5">
                  {group.permissions.map((permission) => (
                    <label key={permission} className="flex items-center gap-2 text-sm text-ink-700">
                      <input
                        type="checkbox"
                        checked={permissions.includes(permission)}
                        onChange={() => togglePermission(permission)}
                        className="h-4 w-4 accent-brand-500"
                      />
                      {PERMISSION_LABELS[permission]}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}

            {formError ? (
              <p role="alert" className="text-sm font-medium text-danger">
                {formError}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-3 border-t border-ink-200/70 p-6">
            <Button variant="ghost" onClick={() => setDrawer(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={isPending}>
              {isPending ? "Saving…" : drawer?.mode === "edit" ? "Save changes" : "Create user"}
            </Button>
          </div>
        </div>
      </Drawer>

      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}
