import type { InvoiceDefaults } from '../types/invoiceDocument'
import type { AgreementClause, AgreementLetterhead } from '../types/agreement'
import type { Profile } from '../types/db'
import { useSessionProfile } from './session-context'

// Vernex Gen Technologies is a separate company run from its own admin login
// (admin@vernexgentech.in). Its agreements and invoices carry its own letterhead; every other
// login keeps the Vernex Digital Marketing artwork.

export const GENTECH_LETTERHEAD: AgreementLetterhead = {
  name: 'Vernex Gen Technologies',
  phone: '+91 9789912805',
  website: 'www.vernexgentech.in',
  logoUrl: '/vernex-gentech-logo.png',
  email: 'admin@vernexgentech.in  |  support@vernexgentech.in',
}

/** The addresses Gen Technologies sends from. */
export const GENTECH_EMAILS = ['admin@vernexgentech.in', 'support@vernexgentech.in']

const GENTECH_DOMAIN = '@vernexgentech.in'

export const isGentech = (profile: Pick<Profile, 'email'> | null | undefined) =>
  !!profile?.email?.toLowerCase().endsWith(GENTECH_DOMAIN)

/** The Gen Technologies letterhead for its admin login, otherwise null (Vernex Digital Marketing). */
export function useGentechBrand(): AgreementLetterhead | null {
  return isGentech(useSessionProfile()) ? GENTECH_LETTERHEAD : null
}

/** Invoices whose company is Gen Technologies show its logo as the built-in artwork. */
export const isGentechCompany = (name: string) => name.trim().toLowerCase() === GENTECH_LETTERHEAD.name.toLowerCase()

/** The shared invoice defaults with the Gen Technologies company block. */
export function gentechInvoiceDefaults(defaults: InvoiceDefaults): InvoiceDefaults {
  return {
    ...defaults,
    subtitle: 'TECHNOLOGY SERVICES',
    company: {
      ...defaults.company,
      name: GENTECH_LETTERHEAD.name,
      tagline: '',
      email: 'admin@vernexgentech.in',
      website: GENTECH_LETTERHEAD.website,
      logo: { kind: 'default' },
    },
    footer: { ...defaults.footer, thank_you: `Thank you for partnering with ${GENTECH_LETTERHEAD.name}.` },
  }
}

const clause = (number: number, title: string, body: string): AgreementClause => ({ id: `g${number}`, number, title, body })

/** Default terms for an agreement between Vernex Gen Technologies (Service Provider) and a client. */
export const GENTECH_CLAUSES: AgreementClause[] = [
  clause(1, 'Scope of Services', 'The Service Provider shall design, develop and deliver the project titled "{{projectTitle}}" for the Client as described in the Services and Scope of Work sections of this Agreement. Any work outside this scope shall be handled as a change request.'),
  clause(2, 'Project Timeline', 'The Service Provider shall make reasonable efforts to complete the work within the agreed timeline. Delays caused by late requirements, content, approvals or payments from the Client shall extend the timeline accordingly.'),
  clause(3, 'Fees and Payment', 'The Client shall pay the fees set out in the Payment Terms of this Agreement. Each invoice is payable by the due date stated on it. The Service Provider may pause the work while any payment is overdue.'),
  clause(4, 'Client Responsibilities', 'The Client shall provide accurate requirements, content, access credentials and timely feedback, and shall nominate one point of contact who is authorised to give approvals.'),
  clause(5, 'Change Requests', 'Any addition or change to the agreed scope shall be confirmed in writing by both parties and may involve additional fees and a revised timeline.'),
  clause(6, 'Testing and Acceptance', 'The Client shall review each deliverable within seven (7) days of delivery. A deliverable shall be deemed accepted if no written objection is raised within that period.'),
  clause(7, 'Intellectual Property', 'On receipt of full payment, ownership of the final deliverables created specifically for the Client shall pass to the Client. The Service Provider retains ownership of its pre-existing tools, libraries, frameworks and know-how, and may show the work in its portfolio unless the Client objects in writing.'),
  clause(8, 'Confidentiality', 'Each party shall keep confidential all non-public business, technical and financial information received from the other party and shall use it only for the purposes of this Agreement. This obligation continues after the Agreement ends.'),
  clause(9, 'Warranty and Support', 'The Service Provider shall fix defects reported within thirty (30) days of final delivery at no extra cost. Maintenance, hosting and support after this period shall be covered by a separate agreement.'),
  clause(10, 'Limitation of Liability', "The Service Provider's total liability under this Agreement shall not exceed the fees paid by the Client for the services. Neither party shall be liable for any indirect or consequential loss."),
  clause(11, 'Termination', 'Either party may terminate this Agreement by giving fifteen (15) days\' written notice. The Client shall pay for all work completed up to the date of termination.'),
  clause(12, 'Governing Law and Jurisdiction', 'This Agreement shall be governed by the laws of India, and the courts at Chennai, Tamil Nadu shall have exclusive jurisdiction.'),
  clause(13, 'Entire Agreement', 'This Agreement is the entire understanding between {{companyName}} and {{clientName}} and replaces all earlier discussions. Any change to it must be in writing and signed by both parties.'),
]

/** The addresses Vernex Digital Marketing sends from. */
export const DM_EMAILS = ['admin@vernex.in', 'support@vernex.in']

/** The company sending documents from the current login, and its sender addresses. */
export function useSenderCompany() {
  const gentech = useGentechBrand()
  return gentech ? { name: gentech.name, emails: GENTECH_EMAILS } : { name: 'Vernex Digital Marketing', emails: DM_EMAILS }
}

/** Default terms for an agreement between Vernex Digital Marketing (Service Provider) and a client. */
export const DM_CLIENT_CLAUSES: AgreementClause[] = [
  clause(1, 'Scope of Services', 'The Service Provider shall provide the digital marketing services for "{{projectTitle}}" described in the Services and Scope of Work sections of this Agreement. Any work outside this scope shall be handled as a change request.'),
  clause(2, 'Term', 'This Agreement starts on the start date and continues until the end date stated in this Agreement, unless terminated earlier under this Agreement. It may be renewed by mutual written consent.'),
  clause(3, 'Fees and Payment', 'The Client shall pay the service fees set out in the Payment Terms of this Agreement. Each invoice is payable by the due date stated on it. The Service Provider may pause the services while any payment is overdue.'),
  clause(4, 'Advertising Budget', 'Advertising spend on platforms such as Meta, Google and YouTube is separate from the service fees and is paid by the Client directly to the platform, unless agreed otherwise in writing.'),
  clause(5, 'Client Responsibilities', 'The Client shall provide brand assets, product information, account access and timely feedback, and shall nominate one point of contact who is authorised to give approvals.'),
  clause(6, 'Content Approval', 'The Service Provider shall share content for approval before publishing. Content not reviewed within three (3) working days may be treated as approved. The Client is responsible for the accuracy of the information it supplies.'),
  clause(7, 'Results', 'The Service Provider shall use its professional skill and best efforts but does not guarantee specific results such as reach, followers, leads or sales, which depend on factors outside its control, including platform algorithms.'),
  clause(8, 'Intellectual Property', 'On receipt of full payment, the Client owns the final creatives made specifically for it. The Service Provider may show the work in its portfolio unless the Client objects in writing. Account access shall be returned to the Client when the Agreement ends.'),
  clause(9, 'Confidentiality', 'Each party shall keep confidential all non-public business, technical and financial information received from the other party and shall use it only for the purposes of this Agreement. This obligation continues after the Agreement ends.'),
  clause(10, 'Termination', 'Either party may terminate this Agreement by giving thirty (30) days\' written notice. The Client shall pay for all services delivered up to the date of termination.'),
  clause(11, 'Limitation of Liability', "The Service Provider's total liability under this Agreement shall not exceed the fees paid by the Client for the services. Neither party shall be liable for any indirect or consequential loss."),
  clause(12, 'Governing Law and Jurisdiction', 'This Agreement shall be governed by the laws of India, and the courts at Chennai, Tamil Nadu shall have exclusive jurisdiction.'),
  clause(13, 'Entire Agreement', 'This Agreement is the entire understanding between {{companyName}} and {{clientName}} and replaces all earlier discussions. Any change to it must be in writing and signed by both parties.'),
]
