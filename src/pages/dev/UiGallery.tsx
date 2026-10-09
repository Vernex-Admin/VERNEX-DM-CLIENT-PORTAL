import { useState } from 'react'
import type { ReactNode } from 'react'
import { Archive, Download, FolderOpen, Info, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Icon } from '../../components/Icon'
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Dialog,
  Drawer,
  DropdownMenu,
  EmptyState,
  Field,
  Input,
  Pill,
  Select,
  Skeleton,
  Switch,
  Table,
  Tabs,
  Textarea,
  Tooltip,
  useToast,
} from '../../components/ui'
import type { ButtonVariant, Column } from '../../components/ui'

type Invoice = { number: string; client: string; due: string; amount: string; status: ReactNode }

const invoices: Invoice[] = [
  {
    number: 'VX-INV-0142',
    client: 'AGK Fitness',
    due: '15 Oct 2026',
    amount: '₹48,500',
    status: <Pill tone="signal">Due in 7 days</Pill>,
  },
  {
    number: 'VX-INV-0139',
    client: 'Raack Dance Academy',
    due: '02 Oct 2026',
    amount: '₹1,18,000',
    status: <Pill tone="ok">Paid</Pill>,
  },
  {
    number: 'VX-INV-0131',
    client: 'AGK Fitness',
    due: '20 Sep 2026',
    amount: '₹22,000',
    status: <Pill tone="bad">Overdue</Pill>,
  },
]

const invoiceColumns: Column<Invoice>[] = [
  { key: 'number', header: 'Invoice', cell: (row) => row.number, mono: true },
  { key: 'client', header: 'Client', cell: (row) => row.client },
  { key: 'due', header: 'Due', cell: (row) => row.due },
  { key: 'status', header: 'Status', cell: (row) => row.status },
  { key: 'amount', header: 'Amount', cell: (row) => row.amount, mono: true, align: 'right' },
]

const buttonVariants: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger']

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-rule py-8">
      <h2 className="mb-5 text-[1.4667rem]">{title}</h2>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[120px_1fr] sm:items-start">
      <p className="pt-1 font-mono text-[12px] text-ink-muted">{label}</p>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </div>
  )
}

export default function UiGallery() {
  const toast = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [lastAction, setLastAction] = useState('none yet')

  return (
    <main className="mx-auto max-w-4xl px-4 pb-24">
      <header className="py-8">
        <p className="font-mono text-[12px] text-ink-muted">/dev/ui · development only</p>
        <h1 className="text-[2rem] leading-tight">UI kit</h1>
        <p className="mt-1 text-ink-muted">
          Every component in every state. The hover rows are forced on; everything else is live, so tab through
          to check focus rings.
        </p>
      </header>

      <Section title="Button">
        {buttonVariants.map((variant) => (
          <Row key={variant} label={variant}>
            <Button variant={variant}>Default</Button>
            <Button variant={variant} data-hover>
              Hover
            </Button>
            <Button variant={variant} disabled>
              Disabled
            </Button>
            <Button variant={variant} loading>
              Loading
            </Button>
            <Button variant={variant} size="sm">
              Small
            </Button>
          </Row>
        ))}
        <Row label="with icon">
          <Button variant="secondary">
            <Icon icon={Download} size={16} />
            Download invoice
          </Button>
        </Row>
      </Section>

      <Section title="Field, Input, Textarea, Select">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Client name" hint="Shown on invoices and the client's dashboard.">
            <Input placeholder="AGK Fitness" />
          </Field>
          <Field label="Client name (hover)">
            <Input defaultValue="Raack Dance Academy" data-hover />
          </Field>
          <Field label="GSTIN" required error="GSTIN must be 15 characters.">
            <Input defaultValue="33ABCDE1234F1Z" className="font-mono" />
          </Field>
          <Field label="Billing email" hint="Locked while an invoice is open.">
            <Input type="email" defaultValue="accounts@agkfitness.in" disabled />
          </Field>
          <Field label="Revision note" hint="Say what should change and where.">
            <Textarea placeholder="At 0:14, the logo should stay on screen for two more seconds." />
          </Field>
          <Field label="Revision note" error="Add a note so the editor knows what to change.">
            <Textarea />
          </Field>
          <Field label="Project type">
            <Select defaultValue="social_media">
              <option value="web">Website</option>
              <option value="social_media">Social media</option>
              <option value="video">Video</option>
              <option value="performance_marketing">Performance marketing</option>
            </Select>
          </Field>
          <Field label="Project type" error="Choose a project type.">
            <Select defaultValue="">
              <option value="" disabled>
                Choose one
              </option>
              <option value="web">Website</option>
            </Select>
          </Field>
          <Field label="Account lead">
            <Select disabled defaultValue="pm">
              <option value="pm">Assigned by Vernex</option>
            </Select>
          </Field>
        </div>
      </Section>

      <Section title="Checkbox and Switch">
        <Row label="checkbox">
          <Checkbox label="Can approve deliverables" description="Lets this member approve on the client's behalf." />
          <Checkbox label="Checked" defaultChecked />
          <Checkbox label="Disabled" disabled />
          <Checkbox label="Disabled, checked" disabled defaultChecked />
        </Row>
        <Row label="switch">
          <Switch label="WhatsApp reminders" />
          <Switch label="Email reminders" defaultChecked />
          <Switch label="Disabled" disabled />
          <Switch label="Disabled, on" disabled defaultChecked />
        </Row>
      </Section>

      <Section title="Card">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader
              title="Diwali campaign reel"
              description="Version 2 · 2 of 3 revisions left"
              action={<Pill tone="signal">Waiting on you</Pill>}
            />
            <CardBody>
              <p className="text-ink-muted">Review the cut and approve it, or tell us what to change.</p>
            </CardBody>
          </Card>
          <Card aria-busy="true">
            <CardBody className="flex flex-col gap-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </CardBody>
          </Card>
        </div>
      </Section>

      <Section title="Pill and Badge">
        <Row label="pill">
          <Pill>Draft</Pill>
          <Pill tone="signal">Waiting on you</Pill>
          <Pill tone="info">In review</Pill>
          <Pill tone="ok">Approved</Pill>
          <Pill tone="bad">Blocked</Pill>
        </Row>
        <Row label="badge">
          <Badge>v2</Badge>
          <Badge tone="signal">3</Badge>
          <Badge tone="info">12</Badge>
          <Badge tone="ok">0</Badge>
          <Badge tone="bad">1</Badge>
        </Row>
      </Section>

      <Section title="Tabs">
        <Tabs
          label="Deliverable sections"
          items={[
            { id: 'review', label: 'Review', content: <p>Arrow keys move between tabs; Home and End jump to the ends.</p> },
            { id: 'revisions', label: 'Revisions', content: <p>Revision 1 delivered on 04 Oct 2026.</p> },
            { id: 'files', label: 'Files', content: <p>Two versions uploaded.</p> },
            { id: 'internal', label: 'Internal notes', content: null, disabled: true },
          ]}
        />
      </Section>

      <Section title="Table">
        <Row label="default">
          <Table className="w-full" caption="Invoices" columns={invoiceColumns} rows={invoices} rowKey={(row) => row.number} />
        </Row>
        <Row label="dense">
          <Table
            className="w-full"
            dense
            caption="Invoices, dense"
            columns={invoiceColumns}
            rows={invoices}
            rowKey={(row) => row.number}
          />
        </Row>
        <Row label="empty">
          <Table
            className="w-full"
            caption="Invoices"
            columns={invoiceColumns}
            rows={[]}
            rowKey={(row) => row.number}
            empty={
              <EmptyState
                className="w-full"
                title="No invoices yet"
                description="Invoices appear here when a milestone is billed."
              />
            }
          />
        </Row>
        <p className="text-sm text-ink-muted">Narrow the window under 640px to see rows collapse into stacked cards.</p>
      </Section>

      <Section title="Dialog, Drawer, Toast">
        <Row label="dialog">
          <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
        </Row>
        <Row label="drawer">
          <Button onClick={() => setDrawerOpen(true)}>Open drawer</Button>
        </Row>
        <Row label="toast">
          <Button onClick={() => toast({ title: 'Revision request sent', description: 'The editor has been notified.' })}>
            Info toast
          </Button>
          <Button onClick={() => toast({ tone: 'ok', title: 'Approved', description: 'Diwali campaign reel, version 2.' })}>
            Success toast
          </Button>
          <Button onClick={() => toast({ tone: 'bad', title: 'Upload failed', description: 'Check your connection and try again.' })}>
            Error toast
          </Button>
        </Row>
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="Approve this version?"
          description="Diwali campaign reel, version 2"
          footer={
            <>
              <Button onClick={() => setDialogOpen(false)}>Not yet</Button>
              <Button variant="primary" onClick={() => setDialogOpen(false)}>
                Approve
              </Button>
            </>
          }
        >
          <p>Approving records your name and the time. Changes after approval are quoted as a new request.</p>
        </Dialog>
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title="New milestone"
          description="AGK Fitness · Website rebuild"
          footer={
            <>
              <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => setDrawerOpen(false)}>
                Add milestone
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-5">
            <Field label="Title" required>
              <Input placeholder="Homepage design sign-off" />
            </Field>
            <Field label="Due date">
              <Input type="date" />
            </Field>
            <Checkbox label="Raise an invoice when this is done" />
          </div>
        </Drawer>
      </Section>

      <Section title="Skeleton">
        <Row label="loading">
          <div aria-busy="true" className="flex w-full max-w-sm items-center gap-3">
            <Skeleton className="size-[40px] rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        </Row>
      </Section>

      <Section title="EmptyState">
        <div className="grid gap-4 sm:grid-cols-2">
          <EmptyState
            icon={FolderOpen}
            title="Nothing in the vault yet"
            description="Upload your logo and brand files so the team can start."
            action={<Button variant="primary">Upload brand assets</Button>}
          />
          <EmptyState title="You're all caught up" description="Nothing is waiting on you right now." />
        </div>
      </Section>

      <Section title="Avatar">
        <Row label="sizes">
          <Avatar name="Arun Kumar" size="sm" />
          <Avatar name="Arun Kumar" size="md" />
          <Avatar name="Arun Kumar" size="lg" />
          <Avatar name="Raack Dance Academy" size="lg" />
          <Avatar name="Priya" size="lg" />
        </Row>
      </Section>

      <Section title="Dropdown menu">
        <Row label="menu">
          <DropdownMenu
            trigger={(props) => (
              <Button {...props}>
                Actions
                <Icon icon={MoreHorizontal} size={16} />
              </Button>
            )}
            items={[
              { id: 'edit', label: 'Edit project', icon: Pencil, onSelect: () => setLastAction('Edit project') },
              { id: 'archive', label: 'Archive', icon: Archive, onSelect: () => setLastAction('Archive'), disabled: true },
              { id: 'delete', label: 'Delete project', icon: Trash2, onSelect: () => setLastAction('Delete project'), danger: true },
            ]}
          />
          <p className="pt-2 text-sm text-ink-muted">Last action: {lastAction}</p>
        </Row>
      </Section>

      <Section title="Tooltip">
        <Row label="hover or focus">
          <Tooltip label="Revisions reset when a new deliverable starts">
            <Button variant="ghost" aria-label="About revision limits">
              <Icon icon={Info} />
            </Button>
          </Tooltip>
          <Tooltip label="Shown below" side="bottom">
            <Button>Bottom tooltip</Button>
          </Tooltip>
        </Row>
      </Section>
    </main>
  )
}
