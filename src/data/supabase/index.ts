import type { DataLayer } from '../types'
import { actionItems } from './actionItems'
import { activity } from './activity'
import { aiDrafts } from './aiDrafts'
import { supabaseAuth, supabaseSession } from './auth'
import { clients } from './clients'
import { comments } from './comments'
import { deliverables } from './deliverables'
import { documents } from './documents'
import { files } from './files'
import { founderBox } from './founderBox'
import { invoices } from './invoices'
import { leads } from './leads'
import { milestones } from './milestones'
import { onboarding } from './onboarding'
import { profiles } from './profiles'
import { projects } from './projects'
import { reminders } from './reminders'
import { revisions } from './revisions'
import { serviceRequests } from './serviceRequests'
import { socialMetrics } from './socialMetrics'
import { templates } from './templates'

/** The whole DataLayer on Supabase. Nothing here depends on the mock. */
export const supabaseData: DataLayer = {
  auth: supabaseAuth,
  session: supabaseSession,
  clients,
  profiles,
  projects,
  milestones,
  deliverables,
  revisions,
  serviceRequests,
  invoices,
  actionItems,
  comments,
  files,
  founderBox,
  socialMetrics,
  leads,
  reminders,
  aiDrafts,
  activity,
  onboarding,
  documents,
  templates,
}
