"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Archive, RotateCcw, Trash2, Pencil, UserCheck, UserX } from "lucide-react";
import type { Permission, SessionUser, StaffStatusLabel, TeamUser } from "@/types";
import { PERMISSION_GROUPS, PERMISSION_LABELS, STATUS_PRESETS } from "@/constants/permissions";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Drawer } from "@/components/ui/drawer";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrength } from "@/components/ui/password-strength";
import { RowActions, type RowAction } from "@/components/ui/row-actions";
import { SortableTh } from "@/components/ui/sortable-th";
import { Toast } from "@/components/ui/toast";
import { useTableSort } from "@/components/ui/use-table-sort";
import { ViewToggle, type TableView } from "@/components/ui/view-toggle";
import { useToast } from "@/hooks/use-toast";
import { fuzzyFilter, haystack } from "@/lib/fuzzy";
import {
  archiveTeamUser,
  createTeamUser,
  deleteTeamUser,
  restoreTeamUser,
  setTeamUserActive,
  updateTeamUser,
} from "@/features/admin/actions/users";
import { AdminEmptyState } from "./admin-empty-state";
import { AdminFilterBar } from "./admin-filter-bar";
import { AdminPageHeader } from "./admin-page-header";
import { AdminPagination } from "./admin-pagination";

interface TeamManagerProps {
  team: TeamUser[];
  archived: TeamUser[];
  currentUser: SessionUser;
}

interface DrawerState {
  mode: "create" | "edit";
  user?: TeamUser;
}

/**
 * A row action awaiting confirmation. Null when no dialog is open.
 *
 * Enabling and restoring are absent on purpose: they hand access back rather
 * than take it away, and a confirmation step on a harmless action teaches
 * people to click through the ones that matter.
 */
type PendingAction = { kind: "archive" | "delete" | "disable"; user: TeamUser } | null;

const CONFIRM_COPY = {
  archive: { title: "Archive this user?", confirmLabel: "Archive" },
  delete: { title: "Delete this user?", confirmLabel: "Delete" },
  disable: { title: "Disable sign-in for this user?", confirmLabel: "Disable sign-in" },
} as const;

const inputClass =
  "w-full rounded-full border border-ink-200 bg-ink-50 px-4 py-2 text-sm text-ink-900 transition-colors focus:border-ink-300 focus:outline-none focus:ring-1 focus:ring-brand-400/30";

const PAGE_SIZE = 10;

/** The role shown in the table and matched by the filter. */
function roleLabel(user: TeamUser): string {
  return user.isSuperAdmin ? "SuperAdmin" : user.statusLabel === "editor" ? "Editor" : "Staff";
}

/**
 * `useTableSort` memoises on this object, so it must be a module-level
 * constant — a fresh literal every render would re-sort every render.
 */
const SORT_ACCESSORS: Record<string, (row: TeamUser) => string | number | null> = {
  name: (u) => u.fullName,
  email: (u) => u.email,
  role: (u) => roleLabel(u),
  status: (u) => (u.isActive ? "Active" : "Disabled"),
};

/** Team management: list, create/edit drawer with permission checkboxes, row actions. */
export function TeamManager({ team, archived, currentUser }: TeamManagerProps) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<TableView>("active");
  const [role, setRole] = useState("all");
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [confirming, setConfirming] = useState<PendingAction>(null);
  const [actionPending, setActionPending] = useState(false);
  const { toast, showToast, showError, dismissToast } = useToast();
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
      try {
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
        showToast(drawer?.mode === "edit" ? "User updated." : "User created.");
      } catch {
        setFormError("Something went wrong. Please try again.");
      }
    });
  }

  function runRowAction(action: () => Promise<{ error: string | null }>, success: string) {
    startTransition(async () => {
      try {
        const result = await action();
        // Previously the error text was passed to the success toast, so a failed
        // archive arrived looking like a successful one.
        if (result.error) {
          showError(result.error);
          return;
        }
        showToast(success);
      } catch {
        showError("Something went wrong. Please try again.");
      }
    });
  }

  /**
   * Archiving, disabling, and deleting a colleague's account all went through a
   * bare click before this — no confirmation of any kind. All three now route
   * through the dialog, which stays locked until the Server Action answers.
   */
  function runConfirmed() {
    if (!confirming) return;
    const { kind, user } = confirming;
    setActionPending(true);
    startTransition(async () => {
      try {
        const result =
          kind === "delete"
            ? await deleteTeamUser(user.id)
            : kind === "disable"
              ? await setTeamUserActive(user.id, false)
              : await archiveTeamUser(user.id);
        if (result.error) {
          showError(result.error);
          return;
        }
        showToast(
          kind === "delete"
            ? `Deleted ${user.fullName}.`
            : kind === "disable"
              ? `Disabled ${user.fullName}.`
              : `Archived ${user.fullName}.`,
        );
      } catch {
        showError("Something went wrong. Please try again.");
      } finally {
        setActionPending(false);
        setConfirming(null);
      }
    });
  }

  function restore(user: TeamUser) {
    runRowAction(
      () => restoreTeamUser(user.id),
      `Restored ${user.fullName} — still disabled until you enable sign-in.`,
    );
  }

  function actionsFor(member: TeamUser): RowAction[] {
    // Nobody may disable, archive, or delete their own account — that is the
    // one mistake with no way back into the portal.
    const isSelf = member.id === currentUser.id;

    if (view === "archived") {
      return [
        {
          label: "Restore",
          icon: RotateCcw,
          disabled: isPending,
          onSelect: () => restore(member),
        },
        {
          label: "Delete",
          icon: Trash2,
          tone: "danger" as const,
          disabled: isPending || isSelf,
          onSelect: () => setConfirming({ kind: "delete", user: member }),
        },
      ];
    }

    return [
      { label: "Edit user", icon: Pencil, onSelect: () => openEdit(member) },
      {
        label: member.isActive ? "Disable sign-in" : "Enable sign-in",
        icon: member.isActive ? UserX : UserCheck,
        tone: member.isActive ? ("danger" as const) : ("default" as const),
        disabled: isPending || isSelf,
        // Disabling locks a colleague out of the portal, so it asks first.
        // Enabling gives access back and goes straight through.
        onSelect: () =>
          member.isActive
            ? setConfirming({ kind: "disable", user: member })
            : runRowAction(
                () => setTeamUserActive(member.id, true),
                `Enabled ${member.fullName}.`,
              ),
      },
      {
        label: "Archive",
        icon: Archive,
        tone: "danger" as const,
        disabled: isPending || isSelf,
        onSelect: () => setConfirming({ kind: "archive", user: member }),
      },
    ];
  }

  const source = view === "active" ? team : archived;

  const filtered = useMemo(() => {
    const narrowed = source.filter((member) => role === "all" || roleLabel(member) === role);
    return fuzzyFilter(narrowed, search, (member) =>
      haystack(member.fullName, member.email, roleLabel(member)),
    );
  }, [source, search, role]);

  const { sorted, sortKey, sortDir, toggle } = useTableSort(
    filtered,
    { key: "name", dir: "asc" },
    SORT_ACCESSORS,
  );

  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <AdminPageHeader
        title="Users Management"
        description="Portal accounts, roles and permissions."
        action={
          <Button variant="primary" onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add user
          </Button>
        }
      />

      <Card>
        <div className="border-b border-ink-200/70 px-6 pb-4 pt-6">
          <AdminFilterBar
            search={{
              id: "team-user-search",
              value: search,
              placeholder: "Search users...",
              onChange: (value) => {
                setSearch(value);
                setPage(1);
              },
            }}
            selects={
              // Every archived account is off the roster for the same reason,
              // so the role filter has nothing left to narrow there.
              view === "active"
                ? [
                    {
                      id: "team-user-role-filter",
                      label: "Role",
                      value: role,
                      options: [
                        { value: "all", label: "All Roles" },
                        { value: "SuperAdmin", label: "SuperAdmin" },
                        { value: "Editor", label: "Editor" },
                        { value: "Staff", label: "Staff" },
                      ],
                      onChange: (value) => {
                        setRole(value);
                        setPage(1);
                      },
                    },
                  ]
                : []
            }
          />
          <ViewToggle
            className="mt-4"
            view={view}
            archivedCount={archived.length}
            noun="users"
            onChange={(next) => {
              setView(next);
              setRole("all");
              setPage(1);
            }}
          />
        </div>
        {sorted.length === 0 ? (
          view === "archived" ? (
            <AdminEmptyState message="Nothing archived. Archived accounts are kept here so they can be restored." />
          ) : (
            <AdminEmptyState
              message="No users match your filters."
              onClear={() => {
                setSearch("");
                setRole("all");
                setPage(1);
              }}
            />
          )
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-200/70 text-xs font-semibold uppercase tracking-wider text-ink-500">
                    <SortableTh label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <SortableTh label="Email" sortKey="email" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <SortableTh label="Role" sortKey="role" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <th scope="col" className="px-6 py-4">Permissions</th>
                    <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onToggle={toggle} />
                    <th scope="col" className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((member) => (
                    <tr key={member.id} className="border-b border-ink-200/40 last:border-b-0">
                      <td className="px-6 py-4 font-semibold text-ink-900">
                        <span className="flex items-center gap-3">
                          <Avatar src={member.avatarSrc} fullName={member.fullName} size="sm" />
                          <span className="min-w-0">
                            {member.fullName}
                            {member.id === currentUser.id ? (
                              <span className="ml-2 text-xs font-medium text-brand-600">
                                (you)
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </td>
                      <td className="px-6 py-4 text-ink-600">{member.email}</td>
                      <td className="px-6 py-4 text-ink-600">{roleLabel(member)}</td>
                      <td className="px-6 py-4 text-ink-600">
                        {member.isSuperAdmin ? "All" : `${member.permissions.length} permission(s)`}
                      </td>
                      <td className="px-6 py-4 text-ink-600">
                        {member.isActive ? "Active" : "Disabled"}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end">
                          <RowActions label={member.fullName} actions={actionsFor(member)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AdminPagination
              page={page}
              pageSize={PAGE_SIZE}
              total={sorted.length}
              onPageChange={setPage}
              className="px-6 py-4"
            />
          </>
        )}
      </Card>

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
              <InlineAlert message={formError} onDismiss={() => setFormError(null)} />
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

      <ConfirmDialog
        open={confirming !== null}
        title={confirming ? CONFIRM_COPY[confirming.kind].title : ""}
        body={
          confirming?.kind === "delete" ? (
            <>
              <strong className="font-semibold text-ink-900">{confirming.user.fullName}</strong>{" "}
              ({confirming.user.email}) will lose their account permanently. Their entries in
              the audit log stay — that record is immutable.
            </>
          ) : confirming?.kind === "disable" ? (
            <>
              <strong className="font-semibold text-ink-900">{confirming.user.fullName}</strong>{" "}
              will be signed out and blocked from the portal on their next page load. They stay
              on this list with their permissions intact, and you can enable them again from
              the same menu.
            </>
          ) : (
            <>
              <strong className="font-semibold text-ink-900">
                {confirming?.user.fullName}
              </strong>{" "}
              will no longer be able to sign in and will drop off this list. The account is
              kept — restore it from the <em>Archived</em> view.
            </>
          )
        }
        confirmLabel={confirming ? CONFIRM_COPY[confirming.kind].confirmLabel : ""}
        pending={actionPending}
        onConfirm={runConfirmed}
        onCancel={() => setConfirming(null)}
      />
      {toast ? (
        <Toast key={toast.id} message={toast.message} tone={toast.tone} onDismiss={dismissToast} />
      ) : null}
    </>
  );
}
