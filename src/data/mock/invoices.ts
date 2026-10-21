import { formatDate, istDay } from '../../lib/dates'
import { invoiceImagePath, invoiceImageProblem, nextMonthCopy, sameMonthCopy, withBuiltInDefaults } from '../../lib/invoiceDocument'
import { computeInvoice, isBilledLine, lineAmount, validateInvoice } from '../../lib/invoiceMath'
import { invoiceTotals, itemAmount } from '../../lib/money'
import type { Invoice, InvoiceItem, InvoiceStatus, Profile } from '../../types/db'
import type {
  ImageRef,
  InvoiceDocument,
  InvoiceDraftInput,
  InvoiceEvent,
  InvoiceSettings,
  InvoiceTemplate,
} from '../../types/invoiceDocument'
import { DataError } from '../types'
import type { InvoiceSettingsRepo, InvoicesRepo } from '../types'
import { db, guard, me, newId, nowIso, readOne, removeWhere, run, visible, visibleClientIds, writable } from './store'

// The invoice rules the database enforces (02_security.sql and the invoice generator migration),
// played out in memory: same validation, same lock on issued invoices, same history.

const isClientUser = (profile: Profile) => profile.role === 'client_admin' || profile.role === 'client_member'

const NUMBER_TAKEN = 'That invoice number is already used. Choose another, or leave it empty to number it automatically.'
const LOCKED = 'This invoice has been issued and cannot be changed. Create a revision instead.'

/** VX/26-27/0049, ignoring custom numbers and revision suffixes (-R2) when counting. */
function nextInvoiceNumber(): string {
  const serials = db.invoices.map((invoice) => Number(/\/(\d+)(?:-R\d+)?$/.exec(invoice.number)?.[1] ?? 0))
  return `VX/26-27/${String(Math.max(0, ...serials) + 1).padStart(4, '0')}`
}

function log(invoiceId: string, event_type: InvoiceEvent['event_type'], details: Record<string, unknown> = {}) {
  const actor = me()
  db.invoice_events.push({
    id: newId(),
    invoice_id: invoiceId,
    actor_user_id: actor.id,
    actor_name: actor.full_name,
    event_type,
    details,
    created_at: nowIso(),
  })
}

/** The client's in-app notice (Action Required) for an issued invoice, due at the end of its due date in IST. */
function notifyClient(invoice: Invoice) {
  db.action_items.push({
    id: newId(),
    client_id: invoice.client_id,
    project_id: invoice.project_id,
    type: 'invoice_due',
    title: `Invoice ${invoice.number} is due on ${formatDate(invoice.due_date)}`,
    ref_type: 'invoice',
    ref_id: invoice.id,
    assigned_user_id: null,
    blocks_milestone: false,
    due_at: `${invoice.due_date}T23:59:59+05:30`,
    resolved_at: null,
    created_at: nowIso(),
  })
}

/** Paid or cancelled: the client's notice is done. */
function resolveNotices(invoice: Invoice) {
  if (invoice.status !== 'paid' && invoice.status !== 'void') return
  for (const item of db.action_items) {
    if (item.ref_type === 'invoice' && item.ref_id === invoice.id && item.resolved_at === null) item.resolved_at = nowIso()
  }
}

function settingsRow(): InvoiceSettings {
  const settings = db.invoice_settings[0]
  if (!settings) throw new DataError('invalid', 'Invoice settings are missing.')
  return settings
}

const imageOk = (image: ImageRef) =>
  image.kind !== 'uploaded' || /^branding\/(logo|qr)-[0-9a-f-]{36}\.(png|jpg|webp)$/.test(image.path)

/** The first problem as a DataError, like the database's invoice_check(). */
function check(document: InvoiceDocument, input: { issue_date: string; due_date: string }, stage: 'draft' | 'issue') {
  if (document?.version !== 1 || !Array.isArray(document.lines)) {
    throw new DataError('invalid', 'The invoice could not be read. Reload the page and try again.')
  }
  if (!imageOk(document.company.logo) || !imageOk(document.payment.qr)) {
    throw new DataError('invalid', 'An invoice image is not valid. Upload it again.')
  }
  const [first] = validateInvoice(document, { ...input, gst_rates: settingsRow().defaults.gst_rates, stage })
  if (first) throw new DataError('invalid', first.message)
}

function applyDocument(invoice: Invoice, document: InvoiceDocument) {
  const totals = computeInvoice(document)
  invoice.document = structuredClone(document)
  invoice.currency = document.currency
  invoice.tax_mode = document.tax.mode
  invoice.gst_rate = document.tax.rate
  invoice.subtotal_minor = totals.subtotal_minor
  invoice.discount_minor = totals.discount_minor
  invoice.taxable_minor = totals.taxable_minor
  invoice.cgst_minor = totals.cgst_minor
  invoice.sgst_minor = totals.sgst_minor
  invoice.igst_minor = totals.igst_minor
  invoice.total_minor = totals.total_minor
}

/** Billed rows of the document become the invoice's items, in page order. */
function rebuildItems(invoiceId: string, document: InvoiceDocument) {
  removeWhere(db.invoice_items, (item) => item.invoice_id === invoiceId)
  document.lines.forEach((line, index) => {
    if (!isBilledLine(line)) return
    db.invoice_items.push({
      id: newId(),
      invoice_id: invoiceId,
      description: line.description.trim(),
      sac_code: null,
      quantity: line.quantity as number,
      unit_price_minor: line.rate_minor as number,
      amount_minor: lineAmount(line) as number,
      position: index + 1,
      bill_period: line.bill_period.trim(),
    })
  })
}

const itemsOf = (invoiceId: string) =>
  db.invoice_items.filter((item) => item.invoice_id === invoiceId).sort((a, b) => a.position - b.position)

/** One invoice the signed-in user may see. Clients never see drafts. */
function readInvoice(id: string): Invoice {
  const invoice = readOne(db.invoices, id, 'invoice')
  if (isClientUser(me()) && invoice.status === 'draft') throw new DataError('not_found', `No invoice ${id}`)
  return invoice
}

function blankInvoice(fields: Pick<Invoice, 'client_id' | 'project_id' | 'number' | 'issue_date' | 'due_date'>): Invoice {
  const now = nowIso()
  return {
    milestone_id: null,
    status: 'draft',
    currency: 'INR',
    subtotal_minor: 0,
    discount_minor: 0,
    taxable_minor: 0,
    tax_mode: 'none',
    gst_rate: 0,
    cgst_minor: 0,
    sgst_minor: 0,
    igst_minor: 0,
    total_minor: 0,
    amount_paid_minor: 0,
    paid_at: null,
    document: null,
    revision: 1,
    revision_of: null,
    superseded_by: null,
    issued_at: null,
    ...fields,
    id: newId(),
    updated_at: now,
    created_at: now,
  }
}

const ALLOWED_MOVES: Partial<Record<InvoiceStatus, InvoiceStatus[]>> = {
  sent: ['sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'void'],
  viewed: ['sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'void'],
  partially_paid: ['paid', 'overdue', 'void'],
  overdue: ['partially_paid', 'paid', 'void'],
}

/** The guard trigger on issued invoices: only status and payment may change, along allowed moves. */
function checkIssuedChange(invoice: Invoice, next: Invoice) {
  const locked: (keyof Invoice)[] = [
    'document', 'number', 'client_id', 'project_id', 'milestone_id', 'issue_date', 'due_date', 'currency',
    'subtotal_minor', 'discount_minor', 'taxable_minor', 'tax_mode', 'gst_rate', 'cgst_minor', 'sgst_minor',
    'igst_minor', 'total_minor', 'revision', 'revision_of', 'issued_at',
  ]
  if (locked.some((key) => JSON.stringify(invoice[key]) !== JSON.stringify(next[key]))) throw new DataError('invalid', LOCKED)
  if (next.status !== invoice.status && !ALLOWED_MOVES[invoice.status]?.includes(next.status)) {
    throw new DataError('invalid', `An issued invoice cannot move from ${invoice.status} to ${next.status}.`)
  }
  if (next.amount_paid_minor < 0 || next.amount_paid_minor > next.total_minor) {
    throw new DataError('invalid', 'The amount paid must be between zero and the invoice total.')
  }
  if (next.status === 'paid' && next.amount_paid_minor !== next.total_minor) {
    throw new DataError('invalid', 'A paid invoice must record the full amount.')
  }
  if (next.status === 'partially_paid' && (next.amount_paid_minor <= 0 || next.amount_paid_minor >= next.total_minor)) {
    throw new DataError('invalid', 'A partly paid invoice needs an amount above zero and below the total.')
  }
}

/** The log trigger: any status or amount change is recorded. */
function logStatusChange(before: Invoice, after: Invoice, note?: string) {
  if (before.status === after.status && before.amount_paid_minor === after.amount_paid_minor) return
  resolveNotices(after)
  log(after.id, 'status_changed', {
    from: before.status,
    to: after.status,
    amount_paid_minor: after.amount_paid_minor,
    note: note?.trim() || null,
  })
}

function saveDraftNow(input: InvoiceDraftInput) {
  guard('invoice', input.id ? 'edit' : 'create', input.client_id)
  if (input.project_id && !db.projects.some((project) => project.id === input.project_id && project.client_id === input.client_id)) {
    throw new DataError('invalid', 'That project belongs to a different client.')
  }
  const number = input.number.trim()
  if (number.length > 40) throw new DataError('invalid', 'The invoice number can be at most 40 characters.')
  if (!input.issue_date || !input.due_date) throw new DataError('invalid', 'Set the invoice date and the due date.')
  check(input.document, input, 'draft')
  if (number && db.invoices.some((invoice) => invoice.number === number && invoice.id !== input.id)) {
    throw new DataError('invalid', NUMBER_TAKEN)
  }

  let invoice: Invoice
  if (input.id === null) {
    invoice = blankInvoice({
      client_id: input.client_id,
      project_id: input.project_id,
      number: number || nextInvoiceNumber(),
      issue_date: input.issue_date,
      due_date: input.due_date,
    })
    applyDocument(invoice, input.document)
    db.invoices.push(invoice)
    log(invoice.id, 'created', input.source_id ? { copied_from: input.source_id } : {})
  } else {
    const existing = writable(db.invoices, input.id, 'invoice', 'edit')
    if (existing.status !== 'draft' || existing.issued_at !== null || existing.document === null) {
      throw new DataError('invalid', 'Only a draft can be edited. Create a revision of an issued invoice instead.')
    }
    invoice = existing
    Object.assign(invoice, {
      client_id: input.client_id,
      project_id: input.project_id,
      number: number || invoice.number,
      issue_date: input.issue_date,
      due_date: input.due_date,
      updated_at: nowIso(),
    })
    applyDocument(invoice, input.document)
    log(invoice.id, 'edited')
  }
  rebuildItems(invoice.id, input.document)
  return { ...invoice, items: itemsOf(invoice.id) }
}

export const mockInvoices: InvoicesRepo = {
  list: (filter = {}) =>
    run(() => {
      const profile = guard('invoice', 'view', filter.client_id)
      return visible(db.invoices, profile).filter(
        (row) =>
          (!filter.client_id || row.client_id === filter.client_id) &&
          // A client sees an invoice once it has been sent.
          !(isClientUser(profile) && row.status === 'draft'),
      )
    }),

  get: (id) => run(() => ({ ...readInvoice(id), items: itemsOf(id) })),

  create: (input) =>
    run(() => {
      guard('invoice', 'create', input.client_id)
      if (input.items.length === 0) throw new DataError('invalid', 'An invoice needs at least one line item.')
      const { items: itemInputs, ...rest } = input
      const invoice: Invoice = {
        ...blankInvoice({ client_id: input.client_id, project_id: null, number: nextInvoiceNumber(), issue_date: input.issue_date, due_date: input.due_date }),
        ...rest,
        ...invoiceTotals(itemInputs),
      }
      const items: InvoiceItem[] = itemInputs.map((item, index) => ({
        id: newId(),
        invoice_id: invoice.id,
        description: item.description,
        sac_code: item.sac_code ?? null,
        quantity: item.quantity ?? 1,
        unit_price_minor: item.unit_price_minor,
        amount_minor: itemAmount(item),
        position: index + 1,
        bill_period: item.bill_period ?? '',
      }))
      db.invoices.push(invoice)
      db.invoice_items.push(...items)
      return { ...invoice, items }
    }),

  update: (id, { items, ...patch }) =>
    run(() => {
      const invoice = writable(db.invoices, id, 'invoice', 'edit')
      if (invoice.document !== null && invoice.issued_at === null && (items || (patch.status && patch.status !== 'draft'))) {
        throw new DataError('invalid', 'Use the Invoice Generator to change this invoice.')
      }
      if (invoice.issued_at !== null && items) throw new DataError('invalid', LOCKED)
      const next: Invoice = { ...invoice, ...patch, ...(items ? invoiceTotals(items) : {}) }
      if (invoice.issued_at !== null) checkIssuedChange(invoice, next)
      if (items) {
        if (items.length === 0) throw new DataError('invalid', 'An invoice needs at least one line item.')
        removeWhere(db.invoice_items, (row) => row.invoice_id === id)
        db.invoice_items.push(
          ...items.map((item, index) => ({
            id: newId(),
            invoice_id: id,
            description: item.description,
            sac_code: item.sac_code ?? null,
            quantity: item.quantity ?? 1,
            unit_price_minor: item.unit_price_minor,
            amount_minor: itemAmount(item),
            position: index + 1,
            bill_period: item.bill_period ?? '',
          })),
        )
      }
      const before = { ...invoice }
      Object.assign(invoice, next, { updated_at: nowIso() })
      logStatusChange(before, invoice)
      return invoice
    }),

  remove: (id) =>
    run(() => {
      const invoice = writable(db.invoices, id, 'invoice', 'delete')
      if (invoice.issued_at !== null) {
        throw new DataError('invalid', 'An issued invoice cannot be deleted. Cancel it instead, so the record is kept.')
      }
      removeWhere(db.invoice_items, (row) => row.invoice_id === id)
      removeWhere(db.invoice_events, (row) => row.invoice_id === id)
      removeWhere(db.action_items, (row) => row.ref_id === id)
      removeWhere(db.invoices, (row) => row.id === id)
    }),

  saveDraft: (input) => run(() => saveDraftNow(input)),

  issue: (id) =>
    run(() => {
      const invoice = writable(db.invoices, id, 'invoice', 'edit')
      if (invoice.status !== 'draft' || invoice.document === null) {
        throw new DataError('invalid', 'Only a draft from the Invoice Generator can be issued.')
      }
      check(invoice.document, invoice, 'issue')
      const original = invoice.revision_of ? db.invoices.find((row) => row.id === invoice.revision_of) : undefined
      if (invoice.revision_of) {
        if (!original || original.superseded_by || !['sent', 'viewed', 'overdue'].includes(original.status) || original.amount_paid_minor > 0) {
          throw new DataError('invalid', 'The invoice this revises can no longer be replaced: it was paid, cancelled or already replaced.')
        }
      }
      const now = nowIso()
      Object.assign(invoice, { status: 'sent', issued_at: now, updated_at: now })
      log(id, 'issued', { number: invoice.number, total_minor: invoice.total_minor })
      notifyClient(invoice)
      if (original) {
        const before = { ...original }
        Object.assign(original, { status: 'void', superseded_by: id, updated_at: now })
        logStatusChange(before, original, `Replaced by revision ${invoice.number}`)
        log(original.id, 'superseded', { superseded_by: id, number: invoice.number })
      }
      return invoice
    }),

  revise: (id) =>
    run(() => {
      const original = writable(db.invoices, id, 'invoice', 'edit')
      guard('invoice', 'create', original.client_id)
      if (original.issued_at === null || original.document === null) {
        throw new DataError('invalid', 'Only an invoice issued from the Invoice Generator can be revised.')
      }
      if (original.superseded_by) throw new DataError('invalid', 'This invoice has already been replaced by a revision.')
      if (!['sent', 'viewed', 'overdue'].includes(original.status) || original.amount_paid_minor > 0) {
        throw new DataError('invalid', 'Paid, part-paid or cancelled invoices cannot be revised.')
      }
      if (db.invoices.some((row) => row.revision_of === id && row.status === 'draft')) {
        throw new DataError('invalid', 'A draft revision of this invoice already exists. Open it from the invoice list.')
      }
      const revision = blankInvoice({
        client_id: original.client_id,
        project_id: original.project_id,
        number: `${original.number.replace(/-R\d+$/, '')}-R${original.revision + 1}`,
        issue_date: original.issue_date,
        due_date: original.due_date,
      })
      Object.assign(revision, { milestone_id: original.milestone_id, revision: original.revision + 1, revision_of: id })
      applyDocument(revision, original.document)
      db.invoices.push(revision)
      rebuildItems(revision.id, original.document)
      log(id, 'revised', { revision_id: revision.id, number: revision.number })
      log(revision.id, 'created', { revision_of: id })
      return revision
    }),

  duplicate: (id, mode) =>
    run(() => {
      const source = readInvoice(id)
      if (!source.document) throw new DataError('invalid', 'Only Invoice Generator invoices can be duplicated.')
      const from = { document: source.document, issue_date: source.issue_date, due_date: source.due_date }
      const copy = mode === 'next_month' ? nextMonthCopy(from) : sameMonthCopy(from, istDay(new Date()))
      return saveDraftNow({ id: null, client_id: source.client_id, project_id: source.project_id, number: '', ...copy, source_id: id })
    }),

  setPaymentStatus: (id, input) =>
    run(() => {
      const invoice = writable(db.invoices, id, 'invoice', 'edit')
      if (!['sent', 'partially_paid', 'paid', 'overdue', 'void'].includes(input.status)) {
        throw new DataError('invalid', 'Choose a valid status.')
      }
      if ((input.note ?? '').length > 500) throw new DataError('invalid', 'Keep the note under 500 characters.')
      if (invoice.status === 'draft') throw new DataError('invalid', 'Issue the invoice before recording a payment status.')
      const amount =
        input.status === 'paid'
          ? invoice.total_minor
          : input.status === 'partially_paid'
            ? input.amount_paid_minor
            : invoice.amount_paid_minor
      if (input.status === 'partially_paid' && (amount === undefined || !Number.isInteger(amount) || amount <= 0 || amount >= invoice.total_minor)) {
        throw new DataError('invalid', 'Enter the amount received: above zero and below the invoice total.')
      }
      if (input.status === invoice.status && amount === invoice.amount_paid_minor) {
        throw new DataError('invalid', "That is already the invoice's status.")
      }
      const next: Invoice = {
        ...invoice,
        status: input.status,
        amount_paid_minor: amount as number,
        paid_at: input.status === 'paid' ? (invoice.paid_at ?? nowIso()) : null,
      }
      if (invoice.issued_at !== null) checkIssuedChange(invoice, next)
      const before = { ...invoice }
      Object.assign(invoice, next, { updated_at: nowIso() })
      logStatusChange(before, invoice, input.note)
      return invoice
    }),

  events: (id) =>
    run(() => {
      const profile = me()
      if (isClientUser(profile)) throw new DataError('forbidden', 'Only Vernex staff can see the invoice history.')
      readInvoice(id)
      return db.invoice_events.filter((event) => event.invoice_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at))
    }),
}

async function fileDataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  return `data:${file.type};base64,${btoa(binary)}`
}

export const mockInvoiceSettings: InvoiceSettingsRepo = {
  get: () =>
    run(() => {
      guard('invoice_settings', 'view')
      const settings = settingsRow()
      return { ...settings, defaults: withBuiltInDefaults(settings.defaults) }
    }),

  save: (input) =>
    run(() => {
      guard('invoice_settings', 'edit')
      const { defaults, payment_mode } = input
      const rates = defaults.gst_rates
      if (rates.length > 20 || rates.some((rate) => !Number.isFinite(rate) || rate <= 0 || rate > 100 || Math.round(rate * 100) !== rate * 100)) {
        throw new DataError('invalid', 'GST rates must be numbers above 0 and up to 100, with at most two decimals.')
      }
      const { mode, rate } = defaults.tax
      if ((mode === 'none' && rate !== 0) || (mode !== 'none' && !rates.includes(rate))) {
        throw new DataError('invalid', 'The default GST rate must be one of the configured rates, or 0 for no GST.')
      }
      if (mode !== 'none' && defaults.currency !== 'INR') {
        throw new DataError('invalid', 'GST applies only to INR invoices. Choose "No GST" as the default for other currencies.')
      }
      if (!imageOk(defaults.company.logo) || !imageOk(defaults.payment.qr)) {
        throw new DataError('invalid', 'An invoice image is not valid. Upload it again.')
      }
      const settings = settingsRow()
      if (payment_mode === 'gateway' && !settings.gateway_configured) {
        throw new DataError(
          'invalid',
          'Gateway Integration is not configured, so Mock Payment stays on. A payment provider and its verified webhook must be set up on the server first.',
        )
      }
      Object.assign(settings, { defaults: structuredClone(defaults), payment_mode, updated_at: nowIso() })
      return settings
    }),

  async uploadImage(kind, file) {
    const problem = invoiceImageProblem(file)
    if (problem) throw new DataError('invalid', problem)
    const data_url = await fileDataUrl(file)
    return run(() => {
      guard('invoice_settings', 'edit')
      const path = invoiceImagePath(kind, file.type)
      db.invoice_assets.push({ path, data_url })
      return path
    })
  },

  imageUrls: (paths) =>
    run(() => {
      const profile = me()
      const allowed = isClientUser(profile)
        ? new Set(
            db.invoices
              .filter((invoice) => invoice.status !== 'draft' && visibleClientIds(profile).has(invoice.client_id) && invoice.document)
              .flatMap((invoice) => [invoice.document?.company.logo, invoice.document?.payment.qr])
              .flatMap((image) => (image?.kind === 'uploaded' ? [image.path] : [])),
          )
        : null
      const urls: Record<string, string> = {}
      for (const asset of db.invoice_assets) {
        if (paths.includes(asset.path) && (!allowed || allowed.has(asset.path))) urls[asset.path] = asset.data_url
      }
      return urls
    }),

  templates: () =>
    run(() => {
      guard('template', 'view')
      return [...db.invoice_templates].sort((a, b) => a.name.localeCompare(b.name))
    }),

  saveTemplate: (input) =>
    run(() => {
      const profile = guard('template', input.id ? 'edit' : 'create')
      const name = input.name.trim()
      if (!name || name.length > 120) throw new DataError('invalid', 'Give the template a name of up to 120 characters.')
      if (input.document?.version !== 1 || !imageOk(input.document.company.logo) || !imageOk(input.document.payment.qr)) {
        throw new DataError('invalid', 'The template could not be read. Reload the page and try again.')
      }
      const now = nowIso()
      if (input.id) {
        const existing = db.invoice_templates.find((template) => template.id === input.id)
        if (!existing) throw new DataError('not_found', 'Template not found.')
        return Object.assign(existing, { name, document: structuredClone(input.document), updated_at: now })
      }
      const template: InvoiceTemplate = {
        id: newId(),
        name,
        document: structuredClone(input.document),
        created_by: profile.id,
        created_at: now,
        updated_at: now,
      }
      db.invoice_templates.push(template)
      return template
    }),

  removeTemplate: (id) =>
    run(() => {
      guard('template', 'delete')
      if (!db.invoice_templates.some((template) => template.id === id)) throw new DataError('not_found', 'That template no longer exists.')
      removeWhere(db.invoice_templates, (template) => template.id === id)
    }),
}
