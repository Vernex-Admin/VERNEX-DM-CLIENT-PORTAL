import type { SocialMetricDaily, SocialPost } from '../../types/db'
import { DataError } from '../types'
import type { SocialMetricsRepo } from '../types'
import { supabase } from './client'
import { maybeRow, rows, toDataError } from './errors'

const DAY_MS = 86_400_000

/** The first day of a range that ends today and is `days` long. */
const sinceDay = (days: number) => new Date(Date.now() - (days - 1) * DAY_MS).toISOString().slice(0, 10)

export const socialMetrics: SocialMetricsRepo = {
  listDaily: (filter) =>
    rows<SocialMetricDaily>(
      supabase()
        .from('social_metrics_daily')
        .select('*')
        .eq('client_id', filter.client_id)
        .gte('date', sinceDay(filter.days ?? 30))
        .order('date', { ascending: true }),
    ),

  topPosts: (filter) =>
    rows<SocialPost>(
      supabase()
        .from('social_posts')
        .select('*')
        .eq('client_id', filter.client_id)
        .gte('published_at', new Date(Date.now() - ((filter.days ?? 30) - 1) * DAY_MS).toISOString())
        .order('reach', { ascending: false })
        .limit(filter.limit ?? 5),
    ),

  async lastSyncedAt(filter) {
    const latest = await maybeRow<{ date: string }>(
      supabase()
        .from('social_metrics_daily')
        .select('date')
        .eq('client_id', filter.client_id)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    )
    return latest?.date ?? null
  },

  async importDaily(input) {
    if (input.length === 0) throw new DataError('invalid', 'There are no rows to import.')
    const { error } = await supabase()
      .from('social_metrics_daily')
      .upsert(input, { onConflict: 'client_id,platform,date' })
    if (error) throw toDataError(error, { '42501': "You can't import numbers for this client." })
    return input.length
  },
}
