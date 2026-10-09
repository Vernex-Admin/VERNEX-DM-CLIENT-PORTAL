import { useState } from 'react'
import { UserPlus, Users } from 'lucide-react'
import { ConfirmDialog } from '../../../components/admin/ConfirmDialog'
import { FormDrawer } from '../../../components/admin/FormDrawer'
import { Icon } from '../../../components/Icon'
import { QueryError } from '../../../components/QueryError'
import { Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Select, Skeleton, Switch, Table, useToast } from '../../../components/ui'
import type { Column } from '../../../components/ui'
import { USER_ROLE_LABEL } from '../../../lib/labels'
import { useCan } from '../../../lib/permissions'
import {
  useAccountLeads,
  useClientUsers,
  useCreateClientUser,
  useDeleteClientUser,
  useSetAccountLead,
  useStaff,
  useUpdateClientUser,
} from '../../../lib/queries'
import { useForm } from '../../../lib/useForm'
import type { ClientRole, Profile } from '../../../types/db'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')
const CLIENT_ROLE_CHOICES: ClientRole[] = ['client_admin', 'client_member']

export function TeamTab({ clientId }: { clientId: string }) {
  const users = useClientUsers(clientId)
  const canInvite = useCan('client_user', 'create', { clientId })
  const [drawer, setDrawer] = useState<Profile | 'new'>()
  const [removing, setRemoving] = useState<Profile>()

  return (
    <div className="flex flex-col gap-4">
      <AccountLead clientId={clientId} />

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[1.1rem]">People</h2>
        {canInvite && (
          <Button variant="primary" onClick={() => setDrawer('new')}>
            <Icon icon={UserPlus} size={16} />
            Invite user
          </Button>
        )}
      </div>

      {users.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </div>
      ) : users.isError ? (
        <QueryError what="this client's people" onRetry={() => users.refetch()} />
      ) : (
        <UsersTable users={users.data} clientId={clientId} onEdit={setDrawer} onRemove={setRemoving} onInvite={() => setDrawer('new')} />
      )}

      {drawer && <UserDrawer clientId={clientId} user={drawer === 'new' ? undefined : drawer} onClose={() => setDrawer(undefined)} />}
      <RemoveUser user={removing} onClose={() => setRemoving(undefined)} />
    </div>
  )
}

function AccountLead({ clientId }: { clientId: string }) {
  const toast = useToast()
  const staff = useStaff()
  const leads = useAccountLeads()
  const setLead = useSetAccountLead()
  const canAssign = useCan('client', 'edit', { clientId })
  const current = leads.data?.find((row) => row.client_id === clientId)?.user_id ?? ''

  async function choose(userId: string) {
    if (!userId) return
    try {
      await setLead.mutateAsync({ clientId, userId })
      toast({ title: 'Account lead changed', tone: 'ok' })
    } catch (error) {
      toast({ title: 'Could not change the account lead', description: messageOf(error), tone: 'bad' })
    }
  }

  return (
    <Card>
      <CardHeader title="Account lead" description="The Vernex person this client sees on their dashboard." />
      <CardBody>
        {staff.isPending || leads.isPending ? (
          <Skeleton className="h-10 w-64" />
        ) : (
          <Field label="Account lead">
            <Select value={current} disabled={!canAssign} onChange={(event) => void choose(event.target.value)} className="max-w-sm">
              {!current && <option value="">Unassigned</option>}
              {(staff.data ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </CardBody>
    </Card>
  )
}

function UsersTable({
  users,
  clientId,
  onEdit,
  onRemove,
  onInvite,
}: {
  users: Profile[]
  clientId: string
  onEdit: (user: Profile) => void
  onRemove: (user: Profile) => void
  onInvite: () => void
}) {
  const canInvite = useCan('client_user', 'create', { clientId })
  const columns: Column<Profile>[] = [
    { key: 'name', header: 'Name', cell: (user) => <span className="font-medium">{user.full_name}</span> },
    { key: 'email', header: 'Email', cell: (user) => user.email },
    { key: 'role', header: 'Role', cell: (user) => USER_ROLE_LABEL[user.role] },
    { key: 'approve', header: 'Can approve', cell: (user) => <ApproveToggle user={user} /> },
    { key: 'actions', header: 'Actions', cell: (user) => <UserActions user={user} onEdit={onEdit} onRemove={onRemove} /> },
  ]
  return (
    <Table
      dense
      caption="Client users"
      columns={columns}
      rows={users}
      rowKey={(user) => user.id}
      empty={
        <EmptyState
          icon={Users}
          title="No one from this client has an account"
          description="Invite the client's admin so they can sign in and approve work."
          action={
            canInvite ? (
              <Button variant="primary" onClick={onInvite}>
                Invite user
              </Button>
            ) : undefined
          }
        />
      }
    />
  )
}

function ApproveToggle({ user }: { user: Profile }) {
  const toast = useToast()
  const update = useUpdateClientUser()
  const canEdit = useCan('client_user', 'edit', { clientId: user.client_id ?? undefined })
  if (user.role === 'client_admin') return <span className="text-ink-muted">Always</span>

  async function toggle(next: boolean) {
    try {
      await update.mutateAsync({ id: user.id, patch: { can_approve: next } })
      toast({ title: next ? `${user.full_name} can now approve` : `${user.full_name} can no longer approve`, tone: 'ok' })
    } catch (error) {
      toast({ title: 'Could not change approval', description: messageOf(error), tone: 'bad' })
    }
  }

  return (
    <Switch
      label={<span className="sr-only">{`${user.full_name} can approve`}</span>}
      checked={user.can_approve}
      disabled={!canEdit}
      onChange={(event) => void toggle(event.target.checked)}
    />
  )
}

function UserActions({ user, onEdit, onRemove }: { user: Profile; onEdit: (user: Profile) => void; onRemove: (user: Profile) => void }) {
  const clientId = user.client_id ?? undefined
  const canEdit = useCan('client_user', 'edit', { clientId })
  const canDelete = useCan('client_user', 'delete', { clientId })
  return (
    <span className="inline-flex gap-1">
      {canEdit && (
        <Button size="sm" variant="ghost" aria-label={`Edit ${user.full_name}`} onClick={() => onEdit(user)}>
          Edit
        </Button>
      )}
      {canDelete && (
        <Button size="sm" variant="ghost" aria-label={`Remove ${user.full_name}`} onClick={() => onRemove(user)}>
          Remove
        </Button>
      )}
    </span>
  )
}

function UserDrawer({ clientId, user, onClose }: { clientId: string; user: Profile | undefined; onClose: () => void }) {
  const toast = useToast()
  const create = useCreateClientUser()
  const update = useUpdateClientUser()
  const can = useCan('client_user', user ? 'edit' : 'create', { clientId })
  const { values, set, dirty } = useForm({
    full_name: user?.full_name ?? '',
    email: user?.email ?? '',
    role: (user?.role ?? 'client_member') as ClientRole,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function submit() {
    const next: Record<string, string> = {}
    if (!values.full_name.trim()) next.full_name = 'Enter their name.'
    if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) next.email = 'Enter a valid email address.'
    setErrors(next)
    if (Object.keys(next).length > 0 || !can) return
    try {
      if (user) {
        await update.mutateAsync({
          id: user.id,
          patch: {
            full_name: values.full_name.trim(),
            email: values.email.trim(),
            role: values.role,
            // Admins always approve; a member who becomes an admin must too.
            ...(values.role === 'client_admin' ? { can_approve: true } : {}),
          },
        })
        toast({ title: `${values.full_name.trim()} updated`, tone: 'ok' })
      } else {
        await create.mutateAsync({
          client_id: clientId,
          full_name: values.full_name.trim(),
          email: values.email.trim(),
          role: values.role,
        })
        toast({ title: `Invitation sent to ${values.email.trim()}`, tone: 'ok' })
      }
      onClose()
    } catch (error) {
      toast({ title: user ? 'Could not save changes' : 'Could not invite them', description: messageOf(error), tone: 'bad' })
    }
  }

  return (
    <FormDrawer
      open
      onClose={onClose}
      title={user ? `Edit ${user.full_name}` : 'Invite a user'}
      description={user ? undefined : 'They get an email with a sign-in link.'}
      dirty={dirty}
      onSubmit={submit}
      submitLabel={user ? 'Save changes' : 'Send invitation'}
      pending={create.isPending || update.isPending}
      submitDisabled={!can}
    >
      <Field label="Name" required error={errors.full_name}>
        <Input value={values.full_name} onChange={(event) => set('full_name', event.target.value)} autoFocus />
      </Field>
      <Field label="Email" required error={errors.email}>
        <Input type="email" value={values.email} onChange={(event) => set('email', event.target.value)} />
      </Field>
      <Field label="Role" hint="Admins always approve work. A member approves only if you allow it.">
        <Select value={values.role} onChange={(event) => set('role', event.target.value as ClientRole)}>
          {CLIENT_ROLE_CHOICES.map((role) => (
            <option key={role} value={role}>
              {USER_ROLE_LABEL[role]}
            </option>
          ))}
        </Select>
      </Field>
    </FormDrawer>
  )
}

function RemoveUser({ user, onClose }: { user: Profile | undefined; onClose: () => void }) {
  const toast = useToast()
  const remove = useDeleteClientUser()
  const can = useCan('client_user', 'delete', { clientId: user?.client_id ?? undefined })

  async function confirm() {
    if (!user || !can) return
    try {
      await remove.mutateAsync(user.id)
      toast({ title: `${user.full_name} removed`, tone: 'ok' })
      onClose()
    } catch (error) {
      toast({ title: 'Could not remove them', description: messageOf(error), tone: 'bad' })
    }
  }

  return (
    <ConfirmDialog
      open={Boolean(user)}
      onClose={onClose}
      title={`Remove ${user?.full_name ?? 'this person'}?`}
      description="They will no longer be able to sign in. Their past comments and approvals stay."
      confirmLabel="Remove"
      pending={remove.isPending}
      onConfirm={confirm}
    />
  )
}
