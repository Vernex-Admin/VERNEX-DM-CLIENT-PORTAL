export type AgreementClause = { id: string; number: number; title: string; body: string }

export type AgreementContent = {
  projectTitle: string
  agreementDate: string
  startDate: string
  endDate: string
  clientName: string
  clientEmail: string
  services: string
  scope: string
  paymentTerms: string
  developerName: string
  companyName: string
  companySigner: string
  companyTitle: string
  logoUrl?: string | null
  tagline?: string
  /** Replaces the company block printed on the letterhead and closing page. */
  letterhead?: AgreementLetterhead
  clauses: AgreementClause[]
}

export type AgreementLetterhead = { name: string; phone: string; website: string; logoUrl: string; email?: string }

export type AgreementStatus =
  | 'draft'
  | 'awaiting_founder_signature'
  | 'awaiting_client_signature'
  | 'signed'
  | 'cancelled'

export type AgreementEventType =
  | 'created'
  | 'edited'
  | 'submitted_for_founder_signature'
  | 'founder_signed_and_sent'
  | 'client_signed'
  | 'cancelled'
  | 'signed_pdf_generated'
