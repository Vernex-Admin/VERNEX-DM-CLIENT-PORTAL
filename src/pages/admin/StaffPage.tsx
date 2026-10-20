import { useState } from 'react'
import type { FormEvent } from 'react'
import { UserCog } from 'lucide-react'
import { QueryError } from '../../components/QueryError'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Pill,
  Skeleton,
  useToast,
} from '../../components/ui'
import { useCan } from '../../lib/permissions'
import {
  useAssignToClient,
  useAssignments,
  useClients,
  useCreateStaff,
  useCurrentProfile,
  useSetStaffActive,
  useStaff,
  useUnassignFromClient,
} from '../../lib/queries'
import type { Client, ClientAssignment, Profile } from '../../types/db'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')

/** The founder's page: add a PM, switch one off, and choose which clients each PM can see. */
export default function StaffPage() {
  const toast = useToast()
  const canManage = useCan('staff', 'view')
  const { data: me } = useCurrentProfile()
  const staff = useStaff()
  const clients = useClients()
  const assignments = useAssignments()
  const create = useCreateStaff()
  const setActive = useSetStaffActive()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  if (!canManage) {
    return (
      <EmptyState
        icon={UserCog}
        title="Only the founder manages staff"
        description="Ask the founder to add or change team members."
      />
    )
  }

  if (staff.isPending || clients.isPending || assignments.isPending) {
    return (
      <div aria-busy="true" className="mx-auto flex max-w-4xl flex-col gap-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (staff.isError || clients.isError || assignments.isError) {
    return (
      <QueryError
        what="the team"
        onRetry={() => {
          void staff.refetch()
          void clients.refetch()
          void assignments.refetch()
        }}
      />
    )
  }

  function add(event: FormEvent) {
    event.preventDefault()
    create.mutate(
      { email, full_name: name },
      {
        onSuccess: (person) => {
          toast({ title: `${person.full_name} added`, description: `They sign in with ${person.email}.`, tone: 'ok' })
          setName('')
          setEmail('')
        },
        onError: (error) => toast({ title: 'Could not add them', description: messageOf(error), tone: 'bad' }),
      },
    )
  }

  function deactivate(person: Profile) {
    setActive.mutate(
      { id: person.id, isActive: false },
      {
        onSuccess: () => toast({ title: `${person.full_name} deactivated`, tone: 'ok' }),
        onError: (error) => toast({ title: 'Could not deactivate', description: messageOf(error), tone: 'bad' }),
      },
    )
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-[1.6rem] leading-tight">Staff</h1>
        <p className="text-sm text-ink-muted">
          A PM sees only the clients assigned to them. Team members sign in with the email you add here.
        </p>
      </div>

      <Card>
        <CardHeader title="Add a PM" />
        <CardBody>
          <form onSubmit={add} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" noValidate>
            <Field label="Name" required>
              <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" />
            </Field>
            <Field label="Email" required>
              <Input
                type="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="off"
              />
            </Field>
            <Button type="submit" variant="primary" loading={create.isPending}>
              Add PM
            </Button>
          </form>
        </CardBody>
      </Card>

      <div className="flex flex-col gap-4">
        {(staff.data ?? []).map((person) => (
          <StaffCard
            key={person.id}
            person={person}
            isMe={person.id === me?.id}
            clients={clients.data ?? []}
            assignments={assignments.data ?? []}
            onDeactivate={() => deactivate(person)}
            deactivating={setActive.isPending && setActive.variables?.id === person.id}
          />
        ))}
      </div>
    </div>
  )
}

function StaffCard(props: {
  person: Profile
  isMe: boolean
  clients: Client[]
  assignments: ClientAssignment[]
  onDeactivate: () => void
  deactivating: boolean
}) {
  const toast = useToast()
  const assign = useAssignToClient()
  const unassign = useUnassignFromClient()
  const { person } = props
  const isFounder = person.role === 'vernex_founder'

  function toggle(client: Client, assigned: boolean) {
    const input = { clientId: client.id, userId: person.id }
    const options = {
      onError: (error: unknown) => toast({ title: 'Could not change access', description: messageOf(error), tone: 'bad' as const }),
    }
    if (assigned) unassign.mutate(input, options)
    else assign.mutate(input, options)
  }

  return (
    <Card>
      <CardHeader
        title={person.full_name || person.email}
        description={person.email}
        action={
          <div className="flex items-center gap-2">
            <Pill tone={isFounder ? 'info' : 'neutral'}>{isFounder ? 'Founder' : 'PM'}</Pill>
            {!isFounder && !props.isMe && (
              <Button size="sm" loading={props.deactivating} onClick={props.onDeactivate}>
                Deactivate
              </Button>
            )}
          </div>
        }
      />
      <CardBody>
        {isFounder ? (
          <p className="text-ink-muted">Sees every client.</p>
        ) : props.clients.length === 0 ? (
          <p className="text-ink-muted">No clients yet.</p>
        ) : (
          <ul aria-label={`Clients ${person.full_name} can see`} className="grid gap-x-6 sm:grid-cols-2">
            {props.clients.map((client) => {
              const link = props.assignments.find((a) => a.client_id === client.id && a.user_id === person.id)
              return (
                <li key={client.id}>
                  <Checkbox
                    label={client.name}
                    description={link?.is_account_lead ? 'Account lead' : undefined}
                    checked={Boolean(link)}
                    disabled={link?.is_account_lead || assign.isPending || unassign.isPending}
                    onChange={() => toggle(client, Boolean(link))}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}
