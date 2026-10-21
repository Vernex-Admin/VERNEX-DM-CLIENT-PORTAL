import { invoiceImagePath, invoiceImageProblem, withBuiltInDefaults } from '../../lib/invoiceDocument'
import type { InvoiceDefaults, InvoiceSettings, InvoiceTemplate, PaymentMode } from '../../types/invoiceDocument'
import { DataError } from '../types'
import type { InvoiceSettingsRepo } from '../types'
import { supabase } from './client'
import { row, rows, toDataError } from './errors'

// Company defaults, templates and invoice images (migration 20261023120000_invoice_generator.sql).
// Reads go through RLS (staff only); writes through the save_/delete_ functions.

const BUCKET = 'invoice-assets'
const SIGNED_URL_SECONDS = 900

type SettingsRow = {
  defaults: Partial<InvoiceDefaults>
  payment_mode: PaymentMode
  gateway_configured: boolean
  updated_at: string | null
}

const toSettings = (stored: SettingsRow): InvoiceSettings => ({
  defaults: withBuiltInDefaults(stored.defaults),
  payment_mode: stored.payment_mode,
  gateway_configured: stored.gateway_configured,
  updated_at: stored.updated_at,
})

export const invoiceSettings: InvoiceSettingsRepo = {
  async get() {
    const stored = await row<SettingsRow>(
      supabase().from('invoice_settings').select('defaults, payment_mode, gateway_configured, updated_at').single(),
      { PGRST116: 'Invoice settings are missing. Apply the invoice generator migration.' },
    )
    return toSettings(stored)
  },

  async save(input) {
    const { data, error } = await supabase().rpc('save_invoice_settings', {
      p_defaults: input.defaults,
      p_payment_mode: input.payment_mode,
    })
    if (error) throw toDataError(error)
    return toSettings(data as SettingsRow)
  },

  async uploadImage(kind, file) {
    const problem = invoiceImageProblem(file)
    if (problem) throw new DataError('invalid', problem)
    const path = invoiceImagePath(kind, file.type)
    const { error } = await supabase().storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
    if (error) throw new DataError('invalid', 'Could not upload that image. Try again.')
    return path
  },

  async imageUrls(paths) {
    const unique = [...new Set(paths.filter(Boolean))]
    if (unique.length === 0) return {}
    const { data } = await supabase().storage.from(BUCKET).createSignedUrls(unique, SIGNED_URL_SECONDS)
    const urls: Record<string, string> = {}
    for (const entry of data ?? []) {
      if (entry.path && entry.signedUrl && !entry.error) urls[entry.path] = entry.signedUrl
    }
    return urls
  },

  templates() {
    return rows<InvoiceTemplate>(supabase().from('invoice_templates').select('*').order('name', { ascending: true }))
  },

  async saveTemplate(input) {
    const { data, error } = await supabase().rpc('save_invoice_template', {
      p_id: input.id ?? null,
      p_name: input.name,
      p_document: input.document,
    })
    if (error) throw toDataError(error)
    return data as InvoiceTemplate
  },

  async removeTemplate(id) {
    const { error } = await supabase().rpc('delete_invoice_template', { p_id: id })
    if (error) throw toDataError(error, { P0002: 'That template no longer exists.' })
  },
}
