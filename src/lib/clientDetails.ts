import type { Tone } from '../components/ui/tone'
import type { Client, ClientDetailField, DetailFieldType } from '../types/db'

// The client details form: the standard questions, how far a client has got, and the checks
// both the client's form and Vernex's editor run before saving.

const field = (
  key: string,
  label: string,
  section: string,
  type: DetailFieldType = 'text',
  required = false,
  hint: string | null = null,
): ClientDetailField => ({ key, label, section, type, required, hint })

/** What every new client is asked. Vernex can add, remove or change fields per client. */
export const STANDARD_DETAIL_FIELDS: readonly ClientDetailField[] = [
  field('legal_name', 'Registered business name', 'Business', 'text', true, 'As it should appear on agreements and invoices.'),
  field('brand_name', 'Brand name', 'Business', 'text', false, 'The name customers know you by, if different.'),
  field('business_type', 'Business type', 'Business', 'text', false, 'For example Proprietorship, Partnership, LLP or Private Limited.'),
  field('industry', 'Industry', 'Business', 'text', true),
  field('year_established', 'Year established', 'Business', 'number'),
  field('contact_name', 'Contact person', 'Contact', 'text', true),
  field('contact_designation', 'Designation', 'Contact'),
  field('contact_phone', 'Mobile number', 'Contact', 'phone', true, '10-digit mobile number. Example: 98765 43210'),
  field('contact_email', 'Email address', 'Contact', 'email', true),
  field('alternate_phone', 'Alternate number', 'Contact', 'phone'),
  field('address', 'Business address', 'Address', 'textarea', true),
  field('city', 'City', 'Address', 'text', true),
  field('state', 'State', 'Address', 'text', true),
  field('pincode', 'PIN code', 'Address', 'text', true, '6 digits.'),
  field('gstin', 'GSTIN', 'Billing', 'text', false, 'Leave blank if you are not GST registered.'),
  field('pan', 'PAN', 'Billing'),
  field('billing_email', 'Billing email', 'Billing', 'email', false, 'Where invoices should be sent.'),
  field('website', 'Website', 'Online presence', 'url'),
  field('instagram', 'Instagram', 'Online presence', 'text', false, 'Handle or profile link.'),
  field('facebook', 'Facebook page', 'Online presence', 'url'),
  field('google_business', 'Google Business Profile', 'Online presence', 'url'),
  field('notes', 'Anything else we should know', 'Other', 'textarea'),
]

export const DETAIL_FIELD_TYPE_LABEL: Record<DetailFieldType, string> = {
  text: 'Short text',
  textarea: 'Long text',
  email: 'Email',
  phone: 'Phone number',
  url: 'Web link',
  number: 'Number',
  date: 'Date',
}

/** The fields this client's form shows. */
export function detailFieldsOf(client: Pick<Client, 'detail_fields'>): ClientDetailField[] {
  return client.detail_fields ? client.detail_fields : STANDARD_DETAIL_FIELDS.map((item) => ({ ...item }))
}

/** Fields grouped by section, in the order the sections first appear. */
export function groupBySection(fields: ClientDetailField[]): { section: string; fields: ClientDetailField[] }[] {
  const groups: { section: string; fields: ClientDetailField[] }[] = []
  for (const item of fields) {
    const section = item.section.trim() || 'Other'
    const group = groups.find((candidate) => candidate.section === section)
    if (group) group.fields.push(item)
    else groups.push({ section, fields: [item] })
  }
  return groups
}

export type DetailsStatus = 'not_started' | 'in_progress' | 'submitted' | 'locked'

export const DETAILS_STATUS: Record<DetailsStatus, { label: string; tone: Tone }> = {
  not_started: { label: 'Not started', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'warn' },
  submitted: { label: 'Ready to review', tone: 'info' },
  locked: { label: 'Locked', tone: 'ok' },
}

export function detailsStatus(
  client: Pick<Client, 'details' | 'details_submitted_at' | 'details_locked_at'>,
): DetailsStatus {
  if (client.details_locked_at) return 'locked'
  if (client.details_submitted_at) return 'submitted'
  const values = Object.values(client.details ?? {})
  return values.some((value) => value.trim() !== '') ? 'in_progress' : 'not_started'
}

/** How many of the required fields have an answer. */
export function requiredProgress(fields: ClientDetailField[], values: Record<string, string>) {
  const required = fields.filter((item) => item.required)
  const done = required.filter((item) => (values[item.key] ?? '').trim() !== '').length
  return { done, total: required.length }
}

const EMAIL = /^\S+@\S+\.\S+$/
const PHONE = /^\+?[0-9][0-9\s-]{6,17}$/
const URL_LIKE = /^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i
const NUMBER = /^-?\d+(\.\d+)?$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
export const MAX_DETAIL_LENGTH = 2000

/** The problem with one answer, or undefined. Empty answers only fail when `requireAnswers` is set. */
export function detailError(item: ClientDetailField, raw: string | undefined, requireAnswers: boolean): string | undefined {
  const value = (raw ?? '').trim()
  if (value === '') return requireAnswers && item.required ? `Enter ${item.label.toLowerCase()}.` : undefined
  if (value.length > MAX_DETAIL_LENGTH) return `Keep this under ${MAX_DETAIL_LENGTH} characters.`
  if (item.type === 'email' && !EMAIL.test(value)) return 'Enter a valid email address.'
  if (item.type === 'phone' && !PHONE.test(value)) return 'Enter a valid phone number.'
  if (item.type === 'url' && !URL_LIKE.test(value)) return 'Enter a web address, for example example.com.'
  if (item.type === 'number' && !NUMBER.test(value)) return 'Enter a number.'
  if (item.type === 'date' && !DATE.test(value)) return 'Enter a date.'
  if (item.key === 'pincode' && !/^\d{6}$/.test(value)) return 'Enter the 6-digit PIN code.'
  if (item.key === 'gstin' && !/^[0-9]{2}[A-Z0-9]{13}$/i.test(value)) return 'A GSTIN has 15 letters and digits.'
  return undefined
}

/** Errors by field key; empty when everything can be saved. */
export function validateDetails(
  fields: ClientDetailField[],
  values: Record<string, string>,
  requireAnswers: boolean,
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const item of fields) {
    const error = detailError(item, values[item.key], requireAnswers)
    if (error) errors[item.key] = error
  }
  return errors
}

/** Only the answers to this form's fields, trimmed. */
export function cleanDetails(fields: ClientDetailField[], values: Record<string, string>): Record<string, string> {
  const clean: Record<string, string> = {}
  for (const item of fields) {
    const value = (values[item.key] ?? '').trim()
    if (value !== '') clean[item.key] = item.key === 'gstin' || item.key === 'pan' ? value.toUpperCase() : value
  }
  return clean
}

export const FIELD_KEY = /^[a-z][a-z0-9_]{0,63}$/

/** A key for a new custom field that no other field of the form uses. */
export function newFieldKey(label: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base = `custom_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'field'}`
  let key = base
  for (let n = 2; used.has(key); n++) key = `${base}_${n}`
  return key
}

/** Problems with a form layout Vernex is about to save, or undefined. */
export function fieldsError(fields: ClientDetailField[]): string | undefined {
  if (fields.length === 0) return 'Keep at least one field on the form.'
  const keys = new Set<string>()
  for (const item of fields) {
    if (!item.label.trim()) return 'Every field needs a label.'
    if (!FIELD_KEY.test(item.key)) return `"${item.label}" has an invalid key.`
    if (keys.has(item.key)) return `"${item.label}" appears twice.`
    keys.add(item.key)
  }
  return undefined
}

/**
 * Client columns kept in step with the details form, so invoices and agreements use what the client
 * entered. Only filled-in answers overwrite a column.
 */
export function columnsFromDetails(values: Record<string, string>): Partial<Pick<Client, 'industry' | 'city' | 'gstin' | 'billing_email'>> {
  const patch: Partial<Pick<Client, 'industry' | 'city' | 'gstin' | 'billing_email'>> = {}
  if (values.industry) patch.industry = values.industry
  if (values.city) patch.city = values.city
  if (values.gstin) patch.gstin = values.gstin.toUpperCase()
  if (values.billing_email) patch.billing_email = values.billing_email
  return patch
}
