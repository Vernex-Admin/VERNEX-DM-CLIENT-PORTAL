import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { Icon } from '../../components/Icon'
import { QueryError } from '../../components/QueryError'
import { Button, Card, CardBody, CardHeader, Checkbox, Field, Input, Skeleton, Textarea, useToast } from '../../components/ui'
import { useClient, useCurrentProfile, useOnboarding, useSubmitOnboarding } from '../../lib/queries'
import type { Client, OnboardingItem } from '../../types/db'

const HINTS: Record<string, string> = {
  // Common
  'Agreement signed': 'Review and sign your services agreement in Vault > Documents.',
  'First invoice paid': 'Clear the advance retainer or project invoice in Billing.',
  'Setup form completed in the portal': 'Fill in the discovery questions below and click save.',

  // Social
  'Instagram switched to Professional and linked to the Facebook Page':
    'Go to Instagram Settings > Account > Switch to professional account, then link your Facebook Page.',
  'Vernex added as partner in Meta Business Settings (Page, Instagram, ad account, pixel)':
    'In Meta Business Settings > Partners, add Vernex using our Business Portfolio ID.',
  "Ad account set up with the client's own payment method":
    'In Meta Ads Manager > Payment Settings, add your debit or credit card so ad spend is billed to you directly.',
  'Google Business Profile manager access':
    'In Google Business Profile settings > Users, invite Vernex as a manager.',
  'Instagram and Facebook connected in the portal':
    'Connect your social accounts in the portal under Performance > Connect.',
  'Logo, brand colours and fonts uploaded to Brand Assets':
    'Upload your SVG/PNG logo, colour hex codes and fonts to Vault > Brand Assets.',
  '20+ real photos and videos uploaded':
    'Upload photos and short clips of your space, team and customers to Vault > Brand Assets.',
  'Offers, prices and USPs shared; what never to say':
    'Share your key offers, pricing and any taboo claims or topics in the box below.',
  'Top 3 competitors and 3 admired accounts shared':
    'Share links or handles of 3 direct competitors and 3 accounts whose aesthetic you love.',
  'Approver named; 3-working-day turnaround agreed':
    'Confirm the person responsible for post approvals and commit to feedback within 3 days.',

  // Website
  'Discovery questionnaire completed':
    'Answer the website discovery questions below so we understand your visitors and goals.',
  'Domain registrar or DNS access shared':
    'Share delegate access in GoDaddy, Hostinger or Namecheap so we can configure DNS at launch.',
  "Hosting or platform account set up in the client's name":
    'Create hosting in your company name and invite Vernex as an admin collaborator.',
  'Business email set up for enquiry forms':
    'Confirm the inbox (e.g. info@yourcompany.com) that will receive enquiries from the website.',
  'GA4 and Search Console owned by client, Vernex added':
    'In Google Analytics and Search Console, invite Vernex as an admin/editor.',
  "Third-party tools in the client's name (booking, payments, WhatsApp)":
    'Create accounts for Razorpay, Calendly or WhatsApp Business and invite Vernex.',
  'Copy supplied or Vernex copy approved':
    'Upload your copy documents to Brand Assets or approve the draft provided by Vernex.',
  'Photos supplied':
    'Upload high-resolution photography for your website pages to Vault > Brand Assets.',
  'Home page design approved':
    'Review the home page design in Deliverables and approve it.',
  'Inner pages approved; design-approval invoice paid':
    'Review remaining page designs and clear the design-approval milestone invoice.',
  'Staging site reviewed; bug list in the portal':
    'Test the staging site link and list any requested tweaks or bug fixes in Deliverables.',
  'Staging approved; launch invoice paid':
    'Approve the final staging build and clear the launch milestone invoice.',
}

function getHint(title: string): string {
  return HINTS[title] ?? 'Complete this step and tick the box when ready.'
}

export default function SetupPage() {
  const { data: profile } = useCurrentProfile()
  const clientId = profile?.client_id ?? undefined
  const clientQuery = useClient(clientId)
  const onboarding = useOnboarding(clientId)

  if (clientQuery.isPending || onboarding.isPending) {
    return (
      <div aria-busy="true" className="mx-auto flex max-w-3xl flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (clientQuery.isError || onboarding.isError || !clientQuery.data) {
    return <QueryError what="setup checklist" onRetry={() => void onboarding.refetch()} />
  }

  return <SetupForm client={clientQuery.data} items={onboarding.data ?? []} />
}

function SetupForm({ client, items }: { client: Client; items: OnboardingItem[] }) {
  const toast = useToast()
  const navigate = useNavigate()
  const submit = useSubmitOnboarding()
  const clientItems = items.filter((i) => i.owner === 'client')

  const existingAnswers = (client?.onboarding_answers as Record<string, string> | null) ?? {}

  // Discovery questions state
  const [visitorAction, setVisitorAction] = useState(existingAnswers.visitor_action ?? '')
  const [idealCustomer, setIdealCustomer] = useState(existingAnswers.ideal_customer ?? '')
  const [servicesPrices, setServicesPrices] = useState(existingAnswers.services_prices ?? '')
  const [websitesAdmired, setWebsitesAdmired] = useState(existingAnswers.websites_admired ?? '')
  const [mustHaveFeatures, setMustHaveFeatures] = useState(existingAnswers.must_have_features ?? '')
  const [copyApprover, setCopyApprover] = useState(existingAnswers.copy_approver ?? '')
  const [launchDeadline, setLaunchDeadline] = useState(existingAnswers.launch_deadline ?? '')

  // Social-specific questions
  const [socialGoal, setSocialGoal] = useState(existingAnswers.social_goal ?? '')
  const [competitors, setCompetitors] = useState(existingAnswers.competitors ?? '')
  const [brandNotes, setBrandNotes] = useState(existingAnswers.brand_notes ?? '')

  // The person's own ticks, as changes on top of what is already done.
  const [toggled, setToggled] = useState<Set<string>>(() => new Set())
  const tickedIds = new Set(clientItems.filter((i) => (i.status === 'done') !== toggled.has(i.id)).map((i) => i.id))

  function toggleItem(id: string) {
    setToggled((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const answers: Record<string, string> = {
      visitor_action: visitorAction,
      ideal_customer: idealCustomer,
      services_prices: servicesPrices,
      websites_admired: websitesAdmired,
      must_have_features: mustHaveFeatures,
      copy_approver: copyApprover,
      launch_deadline: launchDeadline,
      social_goal: socialGoal,
      competitors: competitors,
      brand_notes: brandNotes,
      submitted_at: new Date().toISOString(),
    }

    try {
      await submit.mutateAsync({
        answers,
        doneItemIds: Array.from(tickedIds),
      })
      toast({ title: 'Setup answers saved', tone: 'ok' })
      navigate('/', { replace: true })
    } catch {
      toast({ title: 'Could not save setup form', tone: 'bad' })
    }
  }

  const isSocial = client.service_type === 'social' || client.service_type === 'both'
  const isWebsite = client.service_type === 'website' || client.service_type === 'both'

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[1.6rem] font-semibold leading-tight">Let&apos;s get set up</h1>
          <p className="text-sm text-ink-muted">
            Share your goals and tick the access steps you&apos;ve completed so we can hit the ground running.
          </p>
        </div>
        <Link
          to="/"
          className="text-sm font-medium text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          Later
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Discovery Questions */}
        <Card>
          <CardHeader
            title="Discovery Questions"
            description="Help us understand your business, customers, and targets."
          />
          <CardBody className="flex flex-col gap-4">
            {isWebsite && (
              <>
                <Field label="What should a visitor do on the site?" hint="Call, WhatsApp, book, buy or enquire?">
                  <Input
                    value={visitorAction}
                    onChange={(e) => setVisitorAction(e.target.value)}
                    placeholder="e.g. Call for an appointment or WhatsApp our front desk"
                  />
                </Field>

                <Field label="Who is the ideal customer, and what do they search for?">
                  <Input
                    value={idealCustomer}
                    onChange={(e) => setIdealCustomer(e.target.value)}
                    placeholder="e.g. Local families in Chennai looking for quality dance classes"
                  />
                </Field>

                <Field label="Services and prices to show, and which matters most?">
                  <Textarea
                    rows={2}
                    value={servicesPrices}
                    onChange={(e) => setServicesPrices(e.target.value)}
                    placeholder="e.g. Annual memberships, personal training packages"
                  />
                </Field>

                <Field label="Three websites you like, and why?">
                  <Input
                    value={websitesAdmired}
                    onChange={(e) => setWebsitesAdmired(e.target.value)}
                    placeholder="e.g. apple.com (clean), cult.fit (energetic)"
                  />
                </Field>

                <Field label="Must-have features" hint="Booking, payments, blog, multilingual, gallery...">
                  <Input
                    value={mustHaveFeatures}
                    onChange={(e) => setMustHaveFeatures(e.target.value)}
                    placeholder="e.g. Online Razorpay payments and student photo gallery"
                  />
                </Field>

                <Field label="Who writes the copy, and who approves it?">
                  <Input
                    value={copyApprover}
                    onChange={(e) => setCopyApprover(e.target.value)}
                    placeholder="e.g. Vernex drafts copy, Arun approves it"
                  />
                </Field>

                <Field label="Launch deadline, and anything tied to it?">
                  <Input
                    value={launchDeadline}
                    onChange={(e) => setLaunchDeadline(e.target.value)}
                    placeholder="e.g. Before our November batch admissions open"
                  />
                </Field>
              </>
            )}

            {isSocial && (
              <>
                <Field label="Primary goal for social media" hint="Followers, walk-ins, leads, brand awareness?">
                  <Input
                    value={socialGoal}
                    onChange={(e) => setSocialGoal(e.target.value)}
                    placeholder="e.g. 50+ monthly membership enquiries via Instagram DMs"
                  />
                </Field>

                <Field label="Top 3 competitors and 3 admired accounts">
                  <Input
                    value={competitors}
                    onChange={(e) => setCompetitors(e.target.value)}
                    placeholder="e.g. @competitor1, @competitor2, @gymshark"
                  />
                </Field>

                <Field label="Brand notes, USPs, and what never to say">
                  <Textarea
                    rows={2}
                    value={brandNotes}
                    onChange={(e) => setBrandNotes(e.target.value)}
                    placeholder="e.g. Premium equipment, certified coaches; never claim guaranteed weight loss"
                  />
                </Field>
              </>
            )}
          </CardBody>
        </Card>

        {/* Client Access Checklist */}
        {clientItems.length > 0 && (
          <Card>
            <CardHeader
              title="Your Onboarding Checklist"
              description="Tick the items you have completed so far. You can return anytime to tick remaining items."
            />
            <CardBody className="flex flex-col divide-y divide-rule p-0">
              {clientItems.map((item) => {
                const isChecked = tickedIds.has(item.id)
                const hint = getHint(item.title)

                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 p-3.5 transition-colors hover:bg-paper/40"
                  >
                    <div className="mt-0.5">
                      <Checkbox
                        label=""
                        checked={isChecked}
                        onChange={() => toggleItem(item.id)}
                        aria-label={item.title}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">{item.title}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>
                    </div>
                  </div>
                )
              })}
            </CardBody>
          </Card>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <Link
            to="/"
            className="text-sm font-medium text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            I&apos;ll do this later
          </Link>

          <Button type="submit" variant="primary" loading={submit.isPending}>
            Save and continue to dashboard
            <Icon icon={ChevronRight} size={16} />
          </Button>
        </div>
      </form>
    </div>
  )
}

