import type { Reminder } from '../../types/db'
import type { RemindersRepo } from '../types'
import { supabase } from './client'
import { row, rows } from './errors'

export const reminders: RemindersRepo = {
  list: () => rows<Reminder>(supabase().from('reminders').select('*').order('due_at', { ascending: true })),

  update: (id, patch) =>
    row<Reminder>(
      supabase()
        .from('reminders')
        .update({
          ...(patch.status
            ? { status: patch.status, sent_at: patch.status === 'sent' ? new Date().toISOString() : null }
            : {}),
        })
        .eq('id', id)
        .select()
        .single(),
      { PGRST116: "We couldn't find that reminder." },
    ),
}
