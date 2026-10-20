import type { ServiceRequest } from '../../types/db'
import type { ServiceRequestsRepo } from '../types'
import { requireProfile } from './auth'
import { supabase } from './client'
import { cleanPatch, row, rows } from './errors'

export const serviceRequests: ServiceRequestsRepo = {
  list(filter = {}) {
    let query = supabase().from('service_requests').select('*').order('created_at', { ascending: true })
    if (filter.client_id) query = query.eq('client_id', filter.client_id)
    return rows<ServiceRequest>(query)
  },

  async submit(input) {
    const requester = await requireProfile()
    return row<ServiceRequest>(
      supabase()
        .from('service_requests')
        .insert({
          client_id: input.client_id,
          project_id: input.project_id ?? null,
          title: input.title,
          description: input.description ?? null,
          status: 'submitted',
          desired_date: input.desired_date ?? null,
          attachment_names: input.attachment_names ?? [],
          requested_by: requester.id,
        })
        .select()
        .single(),
    )
  },

  update: (id, patch) =>
    row<ServiceRequest>(
      supabase()
        .from('service_requests')
        .update(cleanPatch(patch, ['requested_by']))
        .eq('id', id)
        .select()
        .single(),
      { PGRST116: "We couldn't find that request." },
    ),
}
