# VERNEX Client Portal: PRD, IA, Wireframes & Roadmap

**Product:** Vernex Client Portal ("Vernex Hub") **Motto:** Strengthen Client-Agency Trust, Radical Transparency, Seamless Execution **Version:** 1.0 | **Audience:** Full-stack developers, designers, Vernex leadership

---

## 0. Benchmark Synthesis (what we borrow, from whom)

| Reference | Borrow | Vernex adaptation |
| --- | --- | --- |
| Copilot.com | White-labelled, simple client home, messaging + billing in one place | Branded subdomain per client (`acme.hub.vernex.in`) |
| ManyRequests | Request forms, service catalogue, turnaround tracking | Revision engine and service request catalogue |
| Frame.io / MotionArray | Timestamped, frame-accurate video comments, version compare | Video Reviewer with approve / revise per version |
| Monday.com | Status columns, timelines, dashboards | Pipeline timeline, health badges |
| Linear | Speed, keyboard-first UX, minimal chrome, cycles | Sprint board, command palette (`Cmd/Ctrl+K`), optimistic UI |

**Design stance:** Linear's speed and density for internal users, Copilot's calm simplicity for clients. One codebase, two experiences driven by role.

---

## 1. EXECUTIVE STRATEGY & ARCHITECTURE

### 1.1 Core UX Principles (the "15-second clarity" rule)

1. **Answer-first home.** The Dashboard answers five questions above the fold, in this order: (a) What is Vernex doing now? (b) What do you need from me? (c) How are my numbers? (d) How many revisions are left? (e) How do I talk to you?
2. **Blocking items are loud, everything else is quiet.** Only "Action Required" uses the accent colour and a persistent banner.
3. **One click to decide.** Approve, Request Revision, Pay, and Call are never more than one click from the Dashboard.
4. **No jargon.** Business owners see "Waiting on you", not "Blocked: pending UAT sign-off".
5. **Transparent by default.** Clients see task status, hours-light progress, revision counters, and invoices. Internal notes are separate and never leak (see RBAC).
6. **Mobile first.** Most Indian SMB owners will approve from a phone, often via a WhatsApp link. Every approval screen must work at 360px width.
7. **Everything is a record.** Every approval, revision, and comment is timestamped, attributed, and immutable. This is the anti-scope-creep audit trail.
8. **Notify where they already are.** Email + WhatsApp (Business API) deep links into the exact item. Portal replaces the conversation, not the nudge.

### 1.2 Multi-Tenancy Model

- **Tenant = Client organization.** Every business table carries `client_id`. Vernex staff belong to the special `vernex` organization and are granted access to specific clients via `client_assignments`.
- **Isolation:** PostgreSQL Row-Level Security (RLS) policies on every tenant table, enforced via `SET LOCAL app.current_user_id` and `app.current_client_ids` per request. Application-layer checks are a second line of defence, not the only one.
- **Storage isolation:** object keys prefixed `clients/{client_id}/projects/{project_id}/...`; signed URLs only, never public buckets.
- **Visibility flag:** content that can be client-visible has `visibility ENUM('internal','client')`. Default is `internal` for staff-created comments and tasks; client-facing needs an explicit publish.

### 1.3 Roles & Permissions (RBAC)

Roles: `client_admin`, `client_member`, `vernex_pm`, `vernex_tech_lead`, `vernex_creative_lead`, plus `vernex_founder` (super-admin, needed for Direct-to-Founder inbox) and `vernex_finance` (optional later).

Legend: **C**reate, **R**ead, **U**pdate, **D**elete, **A**pprove, – none. "Own" = own records only. "Assigned" = assigned clients/projects only.

| Capability | Client Admin | Client Member | Vernex PM | Tech Lead | Creative Lead |
| --- | --- | --- | --- | --- | --- |
| View dashboard (own org) | R | R | R (assigned) | R (assigned) | R (assigned) |
| Approve / request revision on deliverables | A | A (if `can_approve` flag) | – (can record offline approval with proof) | – | – |
| Submit new service / change request | C | C | C on behalf | C (tech) | C (creative) |
| Create / edit projects, milestones | – | – | CRUD | CRUD (tech projects) | CRUD (creative projects) |
| Create / move tasks & sprint board | R | R | CRUD | CRUD | CRUD |
| Upload deliverables | C (assets only) | C (assets only) | CRU | CRU (builds) | CRU (media) |
| Delete files | D (own uploads) | – | D | D (builds) | D (media) |
| Vault: Source code / API vault | R (after final payment gate) | – | R | CRUD | – |
| Video reviewer comments | C | C | CRU | – | CRU |
| Internal notes / internal tasks | – | – | CRUD | CRUD | CRUD |
| Invoices: view / pay | R, Pay | – (configurable) | R | – | – |
| Invoices: create / edit | – | – | C (draft), submit to finance | – | – |
| Manage client users, invite, SSO | CRUD | – | CRU (invite client admin) | – | – |
| Revision limit overrides | – | – | U (with reason, logged) | – | – |
| Ad accounts / integrations | R | R | CRU | – | CRU (ads) |
| Upsell cards | R, dismiss | R | Configure | – | – |
| Direct-to-Founder box | C, R own threads | C, R own threads | – (sees nothing unless escalated) | – | – |
| Founder inbox | – | – | – | – | – (founder only) |
| Global analytics (all clients) | – | – | R (assigned) | – | – |

Rules the backend must enforce:

- `client_member` can approve only if `users.can_approve = true` (set by Client Admin).
- Any user whose role begins with `vernex_` sees only clients in `client_assignments`; founder sees all.
- Approvals by Vernex staff on a client's behalf require an attached proof (screenshot of WhatsApp / email) and are tagged `approved_via = 'offline_proxy'`.
- Permissions are expressed as a policy map (`resource:action`) in code, not scattered `if role ==` checks.

### 1.4 Recommended Tech Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | **Next.js 15 (App Router) + TypeScript**, Tailwind CSS, shadcn/ui, TanStack Query, Zustand, Framer Motion (light), Recharts, dnd-kit (boards), FullCalendar (content calendar) | Fast SSR dashboards, big ecosystem, strong dev velocity |
| Backend | **NestJS (TypeScript)** modular monolith, REST + OpenAPI; tRPC acceptable if team prefers a single TS repo | One language across stack; modularity for later splitting |
| Database | **PostgreSQL 16** (Supabase or Neon/RDS Mumbai region) with RLS, JSONB for flexible fields | Relational integrity for approvals/billing; RLS for tenancy |
| ORM / migrations | Prisma or Drizzle | Typed schema |
| Cache / queues | **Redis** (Upstash) + **BullMQ** | Notifications, webhooks, report generation, scheduled syncs |
| Real-time | **Supabase Realtime** or **Socket.IO / Ably** channels per `project:{id}` | Live comments, status changes, presence |
| File storage | **S3-compatible (AWS S3 ap-south-1 or Cloudflare R2)** with presigned multipart upload (tus protocol for large video) | Large-file resumable uploads, cheap egress on R2 |
| Video | **Mux** (or Cloudflare Stream) for transcoding + HLS playback with frame-accurate seek; fallback: FFmpeg worker producing 720p proxies | Reviewer needs fast streaming of 1080p/4K |
| Auth | **Auth.js / Clerk / Supabase Auth**: email magic link + Google OAuth + optional phone OTP (MSG91) | Low-friction for clients; no password fatigue |
| Payments | **Razorpay** (primary: UPI, cards, netbanking, e-mandate) + **Stripe** (international clients) | Indian GST-compliant invoicing |
| Email / WhatsApp | **Resend / AWS SES** + **WhatsApp Cloud API** (Gupshup/Interakt as BSP) | Transactional notifications |
| Scheduling | **Cal.com** (self-host or embed) or Google Calendar API | Strategy call scheduler |
| Ads APIs | **Meta Marketing API**, **Google Ads API** (+ GA4 Data API) | KPI widgets |
| Search | Postgres full-text first; Meilisearch later | Command palette |
| Observability | Sentry, PostHog (product analytics), Logtail/Grafana | Debug + feature usage |
| Hosting | Vercel (web) + Railway/Render/AWS ECS (API, workers) | Fast deploy |
| CI/CD | GitHub Actions, preview deploys per PR, Playwright e2e | Reliable releases |

**Non-functional requirements**

- Dashboard LCP \< 2.0s on 4G; API p95 \< 300ms.
- WCAG 2.1 AA contrast; full keyboard navigation.
- Audit log retention 3 years; DB backups daily + PITR.
- All PII encrypted at rest; file links signed with 15-minute expiry.
- India DPDP Act 2023 compliance: consent log, data export, delete-on-request.

---

## 2. INFORMATION ARCHITECTURE

### 2.1 Global Layout (desktop ≥1024px)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ HEADER (64px)                                                                            │
│ [≡] [Client Logo | VERNEX]   [🔍 Search or jump to… ⌘K]    [+ Quick Action ▾] [🔔 3] [👤]│
├───────────────┬──────────────────────────────────────────────────────────────────────────┤
│ SIDEBAR(240px)│ MAIN WORKSPACE                                                           │
│               │                                                                          │
│ ◉ Dashboard   │  Breadcrumb: Dashboard                                                   │
│ ▣ Projects ▾  │  ┌────────────────────────────────────────────────────────────────────┐  │
│   • Website   │  │ ⚠ ACTION REQUIRED (2)  Approve Reel #4 · Upload logo files  [Fix →]│  │
│   • Meta Ads  │  └────────────────────────────────────────────────────────────────────┘  │
│   • POS App   │  ┌──────────────┐ ┌──────────────────┐ ┌─────────────────────────────┐  │
│ ✓ Approvals(2)│  │ Project      │ │ Pipeline         │ │ Your Vernex Lead            │  │
│ ↻ Revisions   │  │ Health       │ │ ●──●──◐──○──○    │ │ [photo] Aarav · PM          │  │
│ 🎬 Reviews    │  └──────────────┘ └──────────────────┘ │ [WhatsApp] [Call] [Book]    │  │
│ 📅 Calendar   │  ┌────────────────────────────────────┐└─────────────────────────────┘  │
│ 📊 Performance│  │ KPI Strip: Spend | Leads | CPL | ROAS│                                │
│ 📁 Vault      │  └────────────────────────────────────┘                                  │
│ 💬 Messages   │  ┌────────────────────────┐ ┌──────────────────────────────────────┐    │
│ 💳 Billing    │  │ Revision Meter         │ │ Activity Feed (live)                 │    │
│ 🚀 Grow       │  └────────────────────────┘ └──────────────────────────────────────┘    │
│ ─────────     │                                                                          │
│ ⚙ Settings    │                                                                          │
│ ❤ Founder Box │                                                                          │
│ ? Help        │                                                                          │
└───────────────┴──────────────────────────────────────────────────────────────────────────┘
```

**Mobile (\<768px):** sidebar becomes a bottom tab bar (Home, Approvals, Reviews, Vault, More). Action Required banner is sticky under the header. Quick Action becomes a floating `+` button.

### 2.2 Header & Global Quick Actions

- **Search / Command Palette (`⌘K`)**: jump to project, deliverable, invoice, file; run actions ("Request revision on…", "Open invoice INV-0042").
- **Quick Action (+) menu:** Request new service · Report a bug / request feature (tech projects) · Upload files · Book strategy call · Message my lead · Send note to Founder.
- **Notifications bell:** unread count, grouped (Needs you / Updates / Billing). Mark all read.
- **Avatar menu:** Profile, Notification preferences, Switch client (Vernex staff only), Theme (light/dark), Sign out.
- **Project switcher** (breadcrumb dropdown) when the client has >1 project.

### 2.3 Navigation Map and Page Index

| Route | Page | Roles | Purpose |
| --- | --- | --- | --- |
| `/login`, `/invite/:token` | Auth | all | Magic link, Google, OTP |
| `/` | Dashboard / Command Center | all | Module A |
| `/projects` | Projects list | all | Cards with health, progress |
| `/projects/:id` | Project overview (tabs: Overview, Timeline, Tasks/Sprint, Deliverables, Files, Activity) | all | Single project hub |
| `/projects/:id/sprint` | Sprint board | all (client read-only) | Tech workflow |
| `/projects/:id/staging` | Staging demo iframe | all | Tech workflow |
| `/projects/:id/issues` | Bug / feature tracker | all | Tech workflow |
| `/projects/:id/delivery` | Code & API delivery vault | admin, tech | Tech workflow |
| `/approvals` | Approval inbox (all pending decisions) | client roles | Module C |
| `/deliverables/:id` | Deliverable detail (preview, versions, approve/revise) | all | Module C |
| `/reviews/:assetId` | Video / design reviewer | all | Module B |
| `/calendar` | Content calendar | all | Module B |
| `/performance` | Ads and analytics KPIs | all | Module B |
| `/revisions` | Revision history and counters | all | Module C |
| `/vault` | Asset & media vault | all | Module E |
| `/messages` | Threads per project | all | Light messaging |
| `/billing` | Invoices, payments, change requests | admin (members optional) | Module F |
| `/grow` | Upsell matrix and referrals | client roles | Module F |
| `/feedback` | CSAT history + Founder box | client roles | Module D |
| `/book` | Strategy call scheduler | all | Module D |
| `/settings/team`, `/settings/profile`, `/settings/notifications`, `/settings/integrations` | Settings | admin (team/integrations), all (profile) |  |
| `/admin/*` | Vernex internal console (clients, projects, templates, upsell rules, founder inbox, analytics) | Vernex roles | Internal |

---

## 3. MODULE SPECIFICATIONS

### A. Dashboard / Command Center (`/`)

**Layout order (top to bottom):**

1. Action Required banner
2. Row: Project Health card · Active Pipeline · Account Lead card
3. KPI strip (if any ad/analytics integration exists)
4. Row: Revision Meter · "Working on now" · Activity feed

**A1. Project Health Badge**

| Field | Spec |
| --- | --- |
| States | `on_track` (green), `in_review` (amber/blue: waiting on client or internal QA), `blocked` (red), plus `completed` (grey) |
| Computation | Computed nightly and on events. `blocked` if any task/deliverable has `blocked_on = 'client'` or `'external'` for > 24h or a milestone is overdue > 2 days. `in_review` if any deliverable has `status = 'in_review'`. Otherwise `on_track`. PM can override with a reason (shown to client). |
| UI | Pill with dot + label + one-line reason ("Waiting on you: approve Reel #4"). Click opens project. |
| Multi-project | Show one pill per project; worst state also appears in the sidebar item. |

**A2. Active Pipeline Progress**

- Horizontal milestone stepper: nodes = milestones, states `done ●`, `current ◐`, `upcoming ○`, `blocked ✕`.
- Under each node: name, due date, % complete (weighted by task completion).
- Overall progress bar = `sum(done milestone weights)` + partial current.
- Hover/tap node: popover with deliverables in that milestone and status chips.
- For dual-service clients, a tab switcher: **Tech** | **Marketing**.
- "Working on now" list: up to 5 tasks with `status = 'in_progress'` and `visibility = 'client'`, each with assignee avatar and "since" time.
- Developer logic: `GET /api/dashboard` returns `{health[], pipeline{milestones[]}, actionItems[], workingNow[], revisionMeter[], kpis[], lead}` in one call, cached 30s, invalidated by realtime events.

**A3. "Action Required by Client" Banner**

- Appears whenever `action_items` has open items for the viewer's client. Hidden when empty (replaced by green "You're all caught up ✓").
- Item types: `approval`, `revision_response`, `missing_asset`, `invoice_due`, `info_request`, `meeting_confirm`.
- Each item: icon, title, project, due date, age, CTA button ("Review", "Upload", "Pay").
- Sort: overdue first, then blocking (`blocks_milestone = true`), then due date.
- Escalation: reminders at 24h, 48h, 72h (email → WhatsApp → PM call task). After 72h the health badge flips to `blocked` with the reason visible.
- Click CTA deep-links; resolving the underlying object auto-closes the item.

**A4. Dedicated Account Lead Card**

- Fields: photo, name, title, availability ("Online · Replies in \~1h" from working-hours config), languages.
- **WhatsApp button:** `https://wa.me/{E164}?text={prefilled: "Hi {lead}, this is {user} from {client} re: {project}"}`.
- **Call button:** `tel:+91…`; on desktop opens a modal with the number and a "Request a callback" form.
- **Book call:** opens scheduler (Module D).
- Click-tracking: each trigger logs an `analytics_events` row (`lead_whatsapp_click`, etc.).

**A5. Revision Meter widget** (summary of Module C): per active deliverable group "Revision 2 of 3 used" with segmented bar.

---

### B. Service-Specific Workflows

#### B1. Software / Web Development

**Sprint Board (`/projects/:id/sprint`)**

- Columns: `Backlog · Planned · In Progress · In QA · Ready for Review · Done`. Client sees a simplified view (Planned / In Progress / In Review / Done), with the mapping stored in config.
- Card fields: key (`VX-123`), title, type (feature/bug/chore), assignee, story points, labels, due date, linked deliverable, client-visible description, attachments.
- Header: sprint name, goal, dates, burndown mini-chart, % complete.
- Interactions: Vernex roles drag-and-drop (optimistic update, realtime broadcast); clients can open a card, comment, and react 👍. Clients cannot move cards.
- Logic: moving to `Ready for Review` auto-creates a `deliverable` approval item if the card has `requires_client_approval = true`. Sprint close generates a "Sprint Summary" posted to the activity feed.

**Staging Demo Embed (`/projects/:id/staging`)**

- Environments table: name (Staging, UAT), URL, version/commit, deployed at, status.
- iframe viewport with device switcher (Desktop / Tablet / Mobile frames) and "Open in new tab".
- Security: only whitelisted domains (`*.staging.vernex.in`) allowed; staging must send `Content-Security-Policy: frame-ancestors https://hub.vernex.in`. Fallback card if the site refuses framing.
- **Pin-point feedback mode:** toggle "Comment" to click an element; a JS snippet (opt-in) captures selector, viewport, screenshot, and creates an issue prefilled. Without the snippet, fall back to screenshot upload.
- Optional basic-auth credentials displayed in a copy-to-clipboard box (stored encrypted).

**Bug / Feature Request Submitter (`/projects/:id/issues` + Quick Action)**

| Field | Type | Rules |
| --- | --- | --- |
| Type | enum: Bug / Feature request / Content change | required |
| Title | text ≤120 | required |
| Description | rich text | required; template: steps to reproduce, expected, actual |
| Priority | Low / Normal / High / Critical | Critical triggers PM WhatsApp alert |
| Environment | Staging / Production | required for bug |
| Browser/device | auto-captured + editable |  |
| Attachments | image/video/log ≤100MB | screen recording supported via `MediaRecorder` |
| Is in scope? | system-computed | If type=Feature and not in the Statement of Work, show "This may need a Change Request" and route to Module F |

Developer logic: bugs against delivered features inside the warranty window (`projects.warranty_days`) are free and do not consume revisions; features outside SOW create a `change_request` draft.

**Source Code / API Delivery Vault (`/projects/:id/delivery`)**

- Items: repository transfer instructions, release zips, Postman collection, OpenAPI spec, env variable template, deployment runbook, DB schema dump, credentials handover checklist.
- **Gate:** visible only when `projects.delivery_unlocked = true`, set automatically when final invoice is `paid` (or manually by PM with reason).
- Release table: version tag, date, changelog (markdown), checksum (SHA-256), download button with logged event.
- Secrets are never stored as plain files: use a one-time-view secret share (expires after view/24h).
- Handover checklist with client acknowledgment checkboxes → final sign-off document.

#### B2. Media & Marketing

**Interactive Content Calendar (`/calendar`)**

- Views: Month, Week, List; filters by platform (Instagram, YouTube, LinkedIn, Meta Ads), status, and content type (Reel, Post, Story, Carousel, Ad).
- Event card: thumbnail, title, platform icon, scheduled datetime, status chip: `idea → scripting → in_production → in_review → approved → scheduled → published`.
- Interactions: click opens side drawer (caption, hashtags, creative preview, approval buttons, comments). Vernex roles can drag to reschedule (client sees change in activity feed); clients can request a date change via comment.
- Bulk approval: select multiple `in_review` posts → "Approve selected".
- Caption editing: client can propose edits (tracked suggestion mode), PM accepts.
- Publishing: optional integration to schedule via Meta Graph API / Buffer; otherwise status set manually.
- Export `.ics` feed per client.

**Frame-by-Frame Video Reviewer (`/reviews/:assetId`)**

UI components:

- Player (HLS via Mux), custom controls: play/pause, ±1 frame (`,` and `.`), ±5s (`J`/`L`), speed 0.5–2x, volume, fullscreen, loop selection.
- Timeline scrubber with comment markers (avatar pins); range-select comments (in/out).
- Right panel: comments list sorted by timecode; status per comment (`open`, `addressed`, `resolved`); filter by "mine / open / by person".
- Version dropdown (v1, v2, v3) with side-by-side compare and "Show previous comments carried over".
- Drawing tool on frame (pen, arrow, rectangle, color) saved as SVG overlay JSON.
- Comment composer: auto-fills current timecode on typing start (pauses video), supports @mention, attachment, "Mark as blocking" toggle.
- Bottom action bar: **\[Approve this version\]** **\[Request revision (n comments)\]**.

Logic:

- Comments store `timecode_ms`, `frame_number` (using video fps), optional `range_end_ms`, `drawing_json`.
- Submitting "Request revision" bundles all open comments into one `revision` record (consumes 1 revision), regardless of the number of comments. The UI states this: "All N comments will be sent as Revision 2 of 3."
- Comments are autosaved as drafts until submitted; drafts are visible only to the author.
- Vernex editor marks each comment addressed in the next version; unaddressed comments carry over.
- Other asset types use the same reviewer shell: images/PDF (pin on coordinates), audio (waveform timestamp), and live link (pin on staging page).

**Ad Performance KPI Widgets (`/performance` + Dashboard strip)**

- Integrations: Meta Marketing API (`/insights`), Google Ads API (GAQL), optional GA4. OAuth connect by Vernex (agency/manager account) with client-account linking; token stored encrypted.
- KPI cards: Spend, Impressions, Reach, Clicks, CTR, CPC, Leads, CPL, Conversions, ROAS, Revenue (if pixel), with delta vs previous period (↑ green / ↓ red; for cost metrics, inverted).
- Controls: date range (7/30/90/custom), platform toggle (All / Meta / Google), campaign table with sort, spark-lines.
- Charts: Spend vs Leads (dual-axis line), Funnel (Impressions → Clicks → Leads → Customers), Top creatives (thumbnail + CPL) linking to the delivered asset in vault.
- Developer logic: nightly + hourly sync jobs (BullMQ) write to `ad_metrics_daily` (fields normalized across platforms); dashboard reads only from our DB, never live from the API. Show "Last synced 14 min ago". Currency stored in minor units with `currency` code (INR default).
- **ROI card:** `ROI = (attributed_revenue − ad_spend − vernex_fee) / (ad_spend + vernex_fee)`; shown only if the client supplies revenue (manual entry or CRM/Shopify hook). Tooltips explain attribution caveats.
- **Software deployment metrics:** uptime %, response time, active users, error rate (from uptime monitor + app analytics via webhook) shown with the same card component.

---

### C. Structured Revision & Approval Engine

**C1. Approval Inbox (`/approvals`)** List of deliverables in `in_review` for this client: thumbnail, title, version, due, days waiting. Filters: project, type. Bulk approve is allowed only for items of type `post`/`creative` flagged `bulk_approvable`.

**C2. Deliverable Detail Actions**

Two prominent buttons on every reviewable deliverable:

- **✅ Approve** → confirmation modal: "Approve *Reel #4 v2*? This confirms the work meets your needs." Checkbox "I understand this will be marked final" (for final milestones only). Records: user, timestamp, IP, version, `approved_via`. Triggers: status → `approved`, notify PM, unlock next milestone/task, generate a signed approval receipt (PDF) for final-stage approvals.
- **✏️ Request Revision** → opens the form below.

**C3. Revision Request Form**

| Field | Type | Validation |
| --- | --- | --- |
| Revision type | Select: Copy/Text · Visual/Design · Video cut/Timing · Audio/Music · Functionality · Bug fix · Content/Data · Other | required |
| Description | Rich text, min 20 chars | required; placeholder with "Be specific: what, where, how" |
| Priority | Normal / Urgent | Urgent shows "may affect timeline" note |
| Visual attachment | Multi-file (png/jpg/pdf/mp4 ≤100MB), screenshot paste, annotate in-browser | optional but encouraged |
| Linked timecode / coordinates | auto from reviewer |  |
| Out-of-scope check | system | If classified `new_work` (by PM triage), converted to Change Request |

Submission flow:

1. Client submits → `revisions` row `status = 'submitted'`, counter incremented (`revisions_used + 1`) **only after PM triage accepts it** if in "triage mode"; default is **optimistic count** at submission, refunded if PM reclassifies as bug/our-error.
2. PM/lead is notified (email + WhatsApp + in-app); SLA clock starts (`sla_due_at = submitted_at + turnaround_hours`).
3. Vernex responds: `accepted` → `in_progress` → `delivered_new_version` (links to a new deliverable version). Client is notified and returned to the reviewer.
4. Client approves or opens another revision.

**C4. Revision Counter Logic**

- Each deliverable (or deliverable group, configured per service package) has `revision_limit` (default from package: e.g. Video 2, Design 3, Web page 2 rounds) and `revisions_used`.
- UI: segmented pill "Revision 2 of 3 used" (filled segments = used). States: 0–50% neutral, 66% amber, 100% red.
- **What counts as a revision:** one submitted batch of feedback per version. Several comments in one submission = 1 revision. Two submissions on the same version = 2.
- **What does not count:** Vernex-side errors (marked `our_error = true` by PM), approved-then-reopened within 24h by mistake (PM discretion), typos found by Vernex QA.
- **At limit:** the "Request Revision" button changes to **"Request extra revision"** which opens a Change Request prefilled with price from rate card (`extra_revision_price`), requires Client Admin acceptance and creates an invoice line. No silent blocking; clarity over friction.
- Override: PM can grant `+n` free revisions with a mandatory reason; logged in `audit_logs` and displayed to the client as a "bonus revision from Vernex 🎁".
- Revision history page: table of all revisions (date, version, type, status, turnaround time) with total counters by project.

Developer rules: increments are done in a DB transaction with `SELECT … FOR UPDATE` on the deliverable row to prevent double counting; idempotency key on submit; all state transitions go through a single state machine (below).

```
Deliverable status machine:
draft → in_review → (approved | revision_requested)
revision_requested → in_progress → in_review (new version)
approved → archived
Any → blocked (needs reason) → previous state
```

---

### D. Feedback, CSAT & Founder Direct Box

**D1. Milestone Micro-Polls**

- Trigger: when a milestone moves to `done` (or a deliverable is `approved` as final). Shown as a non-blocking slide-in card and sent by email/WhatsApp link.
- Content: "How did we do on *{milestone}*?" 1–5 stars (large touch targets) → optional chips (Quality, Speed, Communication, Value) → optional comment (shown after rating ≤3 as "What should we fix?").
- Rules: max 1 poll per milestone; cooldown of 7 days between polls to the same user; dismiss = snooze 3 days, max 2 snoozes.
- Logic: rating ≤2 creates an internal alert to PM + founder with SLA of 24h to respond; rating 5 prompts a testimonial/Google review request (opt-in).
- Metrics: CSAT = % of ratings ≥4; per project, per lead, per service; displayed in admin analytics only (clients see only their own history).

**D2. "Direct to Founder" Box (permanent)**

- Always in the sidebar and in the Quick Action menu (heart icon).
- Form: Category (Praise / Concern / Complaint / Idea / Escalation), Subject, Message, optional attachments, "Keep this private from my project team" toggle (default on).
- Delivered to a separate founder inbox (`/admin/founder-inbox`); PM and leads **cannot** see it unless the founder shares it.
- Founder reply goes back to the client's thread; SLA: acknowledgement within 24h (auto-ack message immediately, "Rishi will personally respond within 24 hours").
- Anti-abuse: rate limit 5/day/user; threads close on resolution with a final "Was this resolved?" thumb.
- Retention triggers: complaint or ≤2 star rating raises a `churn_risk` flag on the client record.

**D3. Strategy Call Scheduler (`/book`, widget on Dashboard)**

- Embed Cal.com (or Google Calendar API). Event types: *Project check-in (30m)*, *Strategy session (45m)*, *Growth audit (60m)*, *Emergency (15m)*.
- Prefill: name, email, client, project, and agenda input. Confirmation by email + WhatsApp; add-to-calendar `.ics`.
- Show upcoming and past calls with notes/recordings (if shared by Vernex).
- Timezone: IST default, detect the browser's.

---

### E. Asset & Media Vault (`/vault`)

**Folder structure (system-created per project, locked names):**

```
/Brand Assets      (logos, fonts, guidelines, product photos; client uploads allowed)
/Raw Video         (client footage; Vernex raw selects; 30-day auto-archive)
/Rendered Ads      (final creatives, versioned, approved only flag)
/Software Builds   (release zips, APKs, staging snapshots)  [tech roles + client read]
/Documents         (SOWs, contracts, reports, meeting notes)
/Invoices          (auto-populated PDFs, GST docs)
```

**File record fields:** name, type, size, version, uploader, uploaded_at, tags, status (`draft/approved/archived`), `expires_at`, `download_count`, `last_downloaded_by`, `checksum`, `preview_status`.

**Features**

- Upload: drag-and-drop, folder upload, resumable (tus), progress, virus scan (ClamAV on ingest, quarantine on fail).
- Previewers: image, PDF (pdf.js), video (HLS), audio, Office docs (via PDF conversion), code files (syntax highlighted), Figma/Canva links (embed).
- **Expiration:** per-file or per-folder policy (e.g., Raw Video = 90 days after project completion). Warning emails at 14 and 3 days; "Extend 30 days" request button; expired files move to cold storage for 30 more days, then deleted. Rendered finals and invoices never expire by default.
- **Download tracking:** every download writes `file_downloads` (user, ip, user_agent, at). "Download all as ZIP" generated asynchronously. File owners see a "Downloaded by 3 people" panel.
- **Share links:** time-limited (24h/7d/30d), optional password, view-only toggle, revocable.
- Versioning: re-upload with the same name creates a new version; version history with restore.
- Search + filters (type, tag, date, uploader), grid and list views, bulk actions.
- Brand Assets checklist: required items (logo SVG/PNG, brand colours, fonts, 5+ product photos) with completion % feeding the "missing_asset" Action Required items.
- Permissions: respects RBAC table; clients cannot delete Vernex-uploaded files.
- Quotas: per-plan storage limit with usage meter.

---

### F. Financials, Invoices & Upsell Ecosystem (`/billing`, `/grow`)

**F1. Invoices**

- List columns: Invoice #, Project, Issue date, Due date, Amount (₹/$), GST, Status (`draft`, `sent`, `viewed`, `partially_paid`, `paid`, `overdue`, `void`), Actions (View PDF, Pay now, Download receipt).
- Summary cards: Outstanding, Overdue, Paid this year, Next due.
- Invoice detail: line items linked to milestones/change requests, GSTIN, HSN/SAC, CGST/SGST/IGST breakdown, TDS note, bank details for NEFT, payment history.
- **Payment:** "Pay now" creates a Razorpay Order (INR; UPI, cards, netbanking) or Stripe Checkout Session (international). Webhook `payment.captured` / `checkout.session.completed` → idempotent handler sets `paid`, generates receipt, unlocks gated items (e.g., delivery vault), notifies PM.
- Payment links (`/pay/:token`) shareable on WhatsApp without login for convenience (limited to that invoice).
- Recurring retainers: Razorpay Subscriptions / e-mandate for monthly marketing retainers; auto-generated invoices on the cycle date; dunning at D+3, D+7, D+14.
- Milestone-linked billing: milestone completion can trigger "invoice ready" for PM approval.

**F2. Scope Expansion / Change Request Engine**

- Entry points: Quick Action "Request new service", feature requests outside SOW, extra revision requests, PM-initiated.
- Form: Title, description, linked project, desired outcome, attachments, desired timeline.
- Vernex workflow: `submitted → estimating → quoted → (accepted | declined | negotiating) → scheduled`.
- Quote document: scope, price (fixed or hours × rate), timeline impact (+X days), revised milestone plan, validity (7 days).
- Client Admin clicks **Accept quote** (typed name e-signature + timestamp + IP) → auto-creates milestone(s), an invoice (or adds to the next), and updates the project timeline. Declines require an optional reason (feeds analytics).
- All CRs listed on `/billing/changes` with cumulative "scope added vs. original SOW" meter. This is the paper trail that kills scope creep.

**F3. Vernex Upsell Matrix (`/grow` + Dashboard card)**

Smart cards recommending complementary services, driven by a rules engine (admin-editable, no deploy needed).

| Trigger (client has/does) | Recommendation | Card message |
| --- | --- | --- |
| Web development project delivered | **Vernex POS / ERP** or **Automation** | "Your site is live. Run sales and inventory from one system." |
| Website, no ads | **Performance Marketing (Meta/Google)** | "Drive traffic to your new site: launch ads in 7 days." |
| Social media management, no video | **Video / Reels production** | "Reels get 2–3x reach. Add a 4-video pack." |
| Ads running, CPL rising 3 weeks | **Creative refresh + landing page CRO** | "Your CPL is up 22%. Fresh creatives can fix that." |
| School / institute client | **School ERP** | "Digitise fees, attendance, and parent comms." |
| Restaurant client | **Restaurant BI + POS** | "See table turnover and best sellers in real time." |
| High CSAT (≥4) after final milestone | **Referral program** + testimonial | "Loved the work? Earn credit by referring a friend." |
| Revisions frequently at limit | **Branding / Brand guidelines package** | "A brand kit reduces revision rounds." |
| Hits 90 days with no strategy call | **Growth strategy audit** | "Book a free 30-minute growth review." |

Card spec: icon, headline, one-line benefit, social-proof snippet, price-from or "Free audit", CTA (**Learn more** → modal with details + **Request quote** → creates CR/lead), **Not now** (snooze 30d), **Never show** (hard dismiss). Rules: max 2 cards visible, no cards when a project is `blocked` or CSAT ≤2 in last 14 days, frequency cap 1 new card/week. Track impressions, clicks, conversions in `upsell_events`.

**F4. Client Referral Program Widget**

- Unique referral code and link (`vernex.in/r/{code}`); copy button, share via WhatsApp/Email/LinkedIn.
- Stats: invited, signed up, converted, credits earned; leaderboard-free (keep private).
- Reward config (admin): e.g., 10% credit on the referred client's first invoice, capped at ₹X, applied automatically as an invoice credit.
- Anti-fraud: no self-referral (same GSTIN/email domain/phone), reward only after the first payment clears.

---

## 4. DATA MODEL & SCHEMA (PostgreSQL)

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ENUMS
CREATE TYPE user_role AS ENUM ('client_admin','client_member','vernex_pm','vernex_tech_lead','vernex_creative_lead','vernex_founder','vernex_finance');
CREATE TYPE health_status AS ENUM ('on_track','in_review','blocked','completed');
CREATE TYPE project_type AS ENUM ('software','web','erp','automation','social_media','video','performance_marketing','branding','consulting');
CREATE TYPE deliverable_status AS ENUM ('draft','in_review','approved','revision_requested','in_progress','blocked','archived');
CREATE TYPE revision_status AS ENUM ('submitted','accepted','in_progress','delivered','rejected_out_of_scope');
CREATE TYPE invoice_status AS ENUM ('draft','sent','viewed','partially_paid','paid','overdue','void');
CREATE TYPE visibility AS ENUM ('internal','client');
CREATE TYPE cr_status AS ENUM ('submitted','estimating','quoted','negotiating','accepted','declined','scheduled');

-- ORGANIZATIONS (tenants)
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug CITEXT UNIQUE NOT NULL,
  logo_url TEXT,
  industry TEXT,
  gstin TEXT,
  billing_email CITEXT,
  billing_address JSONB,
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  plan TEXT DEFAULT 'standard',
  storage_quota_bytes BIGINT DEFAULT 53687091200,
  churn_risk BOOLEAN NOT NULL DEFAULT FALSE,
  referral_code TEXT UNIQUE,
  referred_by_client_id UUID REFERENCES clients(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,   -- NULL for Vernex staff
  email CITEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone_e164 TEXT,
  avatar_url TEXT,
  role user_role NOT NULL,
  can_approve BOOLEAN NOT NULL DEFAULT FALSE,
  timezone TEXT DEFAULT 'Asia/Kolkata',
  notification_prefs JSONB NOT NULL DEFAULT '{"email":true,"whatsapp":true,"in_app":true}',
  last_login_at TIMESTAMPTZ,
  invited_by UUID REFERENCES users(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((role IN ('client_admin','client_member') AND client_id IS NOT NULL)
      OR (role NOT IN ('client_admin','client_member') AND client_id IS NULL))
);

CREATE TABLE client_assignments (   -- which Vernex staff serve which client
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  is_account_lead BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (client_id, user_id)
);
CREATE UNIQUE INDEX one_lead_per_client ON client_assignments(client_id) WHERE is_account_lead;

-- PROJECTS & MILESTONES
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type project_type NOT NULL,
  description TEXT,
  health health_status NOT NULL DEFAULT 'on_track',
  health_reason TEXT,
  health_overridden_by UUID REFERENCES users(id),
  start_date DATE, target_end_date DATE, actual_end_date DATE,
  sow_document_id UUID,
  default_revision_limit SMALLINT NOT NULL DEFAULT 3,
  warranty_days INT NOT NULL DEFAULT 30,
  delivery_unlocked BOOLEAN NOT NULL DEFAULT FALSE,
  budget_minor BIGINT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON projects(client_id);

CREATE TABLE milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id),
  title TEXT NOT NULL,
  description TEXT,
  position INT NOT NULL,
  weight NUMERIC(5,2) NOT NULL DEFAULT 1,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','current','done','blocked')),
  completed_at TIMESTAMPTZ,
  invoice_trigger BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE tasks (   -- sprint board cards / internal tasks
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id),
  milestone_id UUID REFERENCES milestones(id),
  sprint_id UUID,
  key TEXT NOT NULL,                    -- e.g. VX-123
  title TEXT NOT NULL,
  description TEXT,
  type TEXT CHECK (type IN ('feature','bug','chore','content')),
  column_status TEXT NOT NULL DEFAULT 'backlog',
  assignee_id UUID REFERENCES users(id),
  story_points SMALLINT,
  blocked_on TEXT CHECK (blocked_on IN ('client','external','internal')),
  blocked_since TIMESTAMPTZ,
  requires_client_approval BOOLEAN DEFAULT FALSE,
  visibility visibility NOT NULL DEFAULT 'internal',
  due_date DATE,
  position DOUBLE PRECISION,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);

CREATE TABLE sprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT, goal TEXT, starts_on DATE, ends_on DATE,
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned','active','closed'))
);

-- DELIVERABLES, FILES, REVISIONS
CREATE TABLE deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id),
  milestone_id UUID REFERENCES milestones(id),
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('video','image','design','document','post','ad_creative','web_page','software_build','report')),
  status deliverable_status NOT NULL DEFAULT 'draft',
  current_version INT NOT NULL DEFAULT 1,
  revision_limit SMALLINT NOT NULL,
  revisions_used SMALLINT NOT NULL DEFAULT 0 CHECK (revisions_used >= 0),
  bonus_revisions SMALLINT NOT NULL DEFAULT 0,
  due_date DATE,
  is_final BOOLEAN DEFAULT FALSE,
  bulk_approvable BOOLEAN DEFAULT FALSE,
  scheduled_at TIMESTAMPTZ,            -- for content calendar
  platform TEXT,                       -- instagram, youtube...
  caption TEXT,
  assigned_to UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  approved_via TEXT CHECK (approved_via IN ('portal','offline_proxy')),
  approval_ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON deliverables(client_id, status);

CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id),
  deliverable_id UUID REFERENCES deliverables(id),
  folder TEXT NOT NULL CHECK (folder IN ('brand_assets','raw_video','rendered_ads','software_builds','documents','invoices')),
  name TEXT NOT NULL,
  mime_type TEXT, size_bytes BIGINT,
  storage_key TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  parent_file_id UUID REFERENCES files(id),   -- version chain
  checksum_sha256 TEXT,
  mux_asset_id TEXT, duration_ms BIGINT, fps NUMERIC(6,3),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','approved','archived','quarantined')),
  tags TEXT[] DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  download_count INT NOT NULL DEFAULT 0,
  uploaded_by UUID REFERENCES users(id),
  visibility visibility NOT NULL DEFAULT 'client',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE file_downloads (
  id BIGSERIAL PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  ip INET, user_agent TEXT,
  via_share_link UUID,
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  password_hash TEXT, view_only BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id)
);

CREATE TABLE revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id UUID NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id),
  revision_number SMALLINT NOT NULL,
  on_version INT NOT NULL,
  resulting_version INT,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent')),
  status revision_status NOT NULL DEFAULT 'submitted',
  counts_against_limit BOOLEAN NOT NULL DEFAULT TRUE,
  our_error BOOLEAN NOT NULL DEFAULT FALSE,
  requested_by UUID NOT NULL REFERENCES users(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sla_due_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  idempotency_key TEXT UNIQUE,
  UNIQUE (deliverable_id, revision_number)
);

CREATE TABLE comments (   -- reviewer, tasks, deliverables, threads
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  project_id UUID REFERENCES projects(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('deliverable','file','task','project','change_request')),
  target_id UUID NOT NULL,
  file_version INT,
  revision_id UUID REFERENCES revisions(id),
  parent_id UUID REFERENCES comments(id),
  author_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  timecode_ms BIGINT, frame_number BIGINT, range_end_ms BIGINT,
  x_pct NUMERIC(6,3), y_pct NUMERIC(6,3),
  drawing_json JSONB,
  is_blocking BOOLEAN DEFAULT FALSE,
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','open','addressed','resolved')),
  visibility visibility NOT NULL DEFAULT 'client',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at TIMESTAMPTZ
);
CREATE INDEX ON comments(target_type, target_id, timecode_ms);

CREATE TABLE action_items (   -- feeds "Action Required" banner
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  project_id UUID REFERENCES projects(id),
  type TEXT NOT NULL CHECK (type IN ('approval','revision_response','missing_asset','invoice_due','info_request','meeting_confirm','quote_acceptance')),
  title TEXT NOT NULL,
  ref_type TEXT, ref_id UUID,
  assigned_user_id UUID REFERENCES users(id),
  blocks_milestone BOOLEAN DEFAULT FALSE,
  due_at TIMESTAMPTZ,
  last_reminded_at TIMESTAMPTZ, reminder_count SMALLINT DEFAULT 0,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON action_items(client_id) WHERE resolved_at IS NULL;

-- FEEDBACK
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  project_id UUID REFERENCES projects(id),
  milestone_id UUID REFERENCES milestones(id),
  kind TEXT NOT NULL CHECK (kind IN ('csat','founder_box')),
  founder_category TEXT CHECK (founder_category IN ('praise','concern','complaint','idea','escalation')),
  rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  tags TEXT[] DEFAULT '{}',
  subject TEXT,
  message TEXT,
  private_from_team BOOLEAN DEFAULT TRUE,
  status TEXT DEFAULT 'new' CHECK (status IN ('new','acknowledged','in_progress','resolved')),
  submitted_by UUID NOT NULL REFERENCES users(id),
  resolved_helpful BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);

-- BILLING
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  project_id UUID REFERENCES projects(id),
  milestone_id UUID REFERENCES milestones(id),
  change_request_id UUID,
  number TEXT UNIQUE NOT NULL,
  status invoice_status NOT NULL DEFAULT 'draft',
  currency CHAR(3) NOT NULL DEFAULT 'INR',
  subtotal_minor BIGINT NOT NULL,
  cgst_minor BIGINT DEFAULT 0, sgst_minor BIGINT DEFAULT 0, igst_minor BIGINT DEFAULT 0,
  credit_minor BIGINT DEFAULT 0,
  total_minor BIGINT NOT NULL,
  amount_paid_minor BIGINT NOT NULL DEFAULT 0,
  issue_date DATE NOT NULL, due_date DATE NOT NULL,
  razorpay_order_id TEXT, stripe_session_id TEXT,
  pay_token UUID DEFAULT gen_random_uuid(),
  pdf_file_id UUID REFERENCES files(id),
  is_recurring BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL, sac_code TEXT,
  quantity NUMERIC(10,2) DEFAULT 1,
  unit_price_minor BIGINT NOT NULL,
  amount_minor BIGINT NOT NULL
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  provider TEXT CHECK (provider IN ('razorpay','stripe','bank_transfer')),
  provider_payment_id TEXT UNIQUE,     -- idempotency
  amount_minor BIGINT NOT NULL,
  status TEXT NOT NULL, method TEXT,
  paid_at TIMESTAMPTZ, raw_payload JSONB
);

CREATE TABLE change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  project_id UUID REFERENCES projects(id),
  source TEXT CHECK (source IN ('client_request','extra_revision','feature_request','upsell','pm_initiated')),
  title TEXT NOT NULL, description TEXT,
  status cr_status NOT NULL DEFAULT 'submitted',
  quote_amount_minor BIGINT, quote_days_impact INT, quote_valid_until DATE,
  quote_document_id UUID REFERENCES files(id),
  accepted_by UUID REFERENCES users(id), accepted_at TIMESTAMPTZ,
  accepted_ip INET, signature_name TEXT,
  decline_reason TEXT,
  requested_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- UPSELL & REFERRALS
CREATE TABLE upsell_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT, trigger JSONB NOT NULL,         -- e.g. {"has_project_type":"web","lacks_project_type":"performance_marketing"}
  headline TEXT, body TEXT, cta_label TEXT, service_code TEXT,
  priority INT DEFAULT 0, active BOOLEAN DEFAULT TRUE
);
CREATE TABLE upsell_events (
  id BIGSERIAL PRIMARY KEY,
  rule_id UUID REFERENCES upsell_rules(id), client_id UUID REFERENCES clients(id), user_id UUID REFERENCES users(id),
  event TEXT CHECK (event IN ('impression','click','request_quote','snooze','dismiss','converted')),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_client_id UUID NOT NULL REFERENCES clients(id),
  referred_email CITEXT, referred_client_id UUID REFERENCES clients(id),
  status TEXT DEFAULT 'invited' CHECK (status IN ('invited','signed_up','converted','rewarded','rejected')),
  reward_minor BIGINT, rewarded_invoice_id UUID REFERENCES invoices(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ANALYTICS
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  provider TEXT CHECK (provider IN ('meta_ads','google_ads','ga4','uptime','shopify','custom')),
  external_account_id TEXT,
  encrypted_token BYTEA, token_expires_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ, status TEXT DEFAULT 'active'
);

CREATE TABLE ad_metrics_daily (
  client_id UUID NOT NULL REFERENCES clients(id),
  project_id UUID REFERENCES projects(id),
  platform TEXT NOT NULL,
  campaign_id TEXT NOT NULL, campaign_name TEXT,
  date DATE NOT NULL,
  spend_minor BIGINT, impressions BIGINT, reach BIGINT, clicks BIGINT,
  leads INT, conversions INT, revenue_minor BIGINT,
  currency CHAR(3) DEFAULT 'INR',
  PRIMARY KEY (client_id, platform, campaign_id, date)
);

CREATE TABLE analytics_events (   -- product analytics + CRM signals
  id BIGSERIAL PRIMARY KEY,
  client_id UUID REFERENCES clients(id), user_id UUID REFERENCES users(id),
  name TEXT NOT NULL,                -- login, approval_clicked, lead_whatsapp_click, ...
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON analytics_events(client_id, name, created_at);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT, title TEXT, body TEXT, deep_link TEXT,
  channels_sent TEXT[], read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  client_id UUID, actor_id UUID, action TEXT NOT NULL,
  entity_type TEXT, entity_id UUID,
  before JSONB, after JSONB, reason TEXT, ip INET,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ROW LEVEL SECURITY (apply to every tenant table; example)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects
  USING (client_id = ANY (string_to_array(current_setting('app.current_client_ids', true), ',')::uuid[]));
```

**Key relationships:** `clients 1—* users` · `clients 1—* projects 1—* milestones` · `projects 1—* tasks` · `projects 1—* deliverables 1—* revisions` · `deliverables 1—* files (versions)` · `files 1—* comments (reviewer)` · `clients 1—* invoices 1—* invoice_items/payments` · `clients 1—* change_requests` · `clients 1—* feedback` · `clients 1—* ad_metrics_daily`.

**Core API surface (REST, `/api/v1`):** `POST /auth/magic-link` · `GET /dashboard` · `GET/POST /projects` · `GET /projects/:id/pipeline` · `GET/PATCH /tasks` · `POST /deliverables/:id/approve` · `POST /deliverables/:id/revisions` · `GET /files/:id/signed-url` · `POST /uploads/init` · `POST /comments` · `GET /performance?range=` · `GET /invoices` · `POST /invoices/:id/pay` · `POST /webhooks/razorpay|stripe|mux|meta` · `POST /change-requests` · `POST /change-requests/:id/accept` · `POST /feedback` · `GET /upsell/cards` · `GET /admin/founder-inbox`. Realtime channels: `client:{id}`, `project:{id}`, `asset:{id}` (comments/presence).

---

## 5. DEVELOPMENT ROADMAP & SPRINT PLAN

**Team assumption:** 2 full-stack, 1 frontend, 1 designer (part-time), 1 PM/QA. Two-week phases are aggressive: scope is intentionally narrow and each phase ends with a demo to 2 pilot clients.

### Phase 1 — MVP Core (Weeks 1–2)

| Day | Work |
| --- | --- |
| W1 D1–2 | Repo, CI/CD, environments, design tokens, DB schema (users, clients, projects, milestones, files, action_items, audit_logs), RLS |
| W1 D3–5 | Auth (magic link + Google), invites, RBAC middleware, app shell (sidebar, header, ⌘K stub) |
| W2 D1–3 | Dashboard (health badge, pipeline, action banner, account lead card with WhatsApp/Call), `GET /dashboard` |
| W2 D3–5 | Asset Vault v1 (folders, tus uploads, previews, signed URLs, download tracking), admin console to create client/project/milestones; Resend email notifications |

**Exit criteria:** client logs in, sees project status, pending actions, uploads/downloads files; staff can set up a client in \< 10 minutes. Security review of tenant isolation.

### Phase 2 — Interactive Modules (Weeks 3–4)

| Day | Work |
| --- | --- |
| W3 D1–3 | Deliverables + approval flow + revision engine (state machine, counters, form, audit), approval inbox |
| W3 D4–5 | Sprint board (read-only client view), issue submitter, staging iframe |
| W4 D1–4 | Video reviewer (Mux upload, HLS, timecode comments, versions, drawing v1), realtime comments |
| W4 D5 | Content calendar v1 (month/week, status, approve), WhatsApp notifications, e2e test suite |

**Exit criteria:** end-to-end loop: upload → review → comment → revise → new version → approve, with correct counter behaviour and notifications.

### Phase 3 — Analytics, Billing & Upsell (Weeks 5–6)

| Day | Work |
| --- | --- |
| W5 D1–3 | Meta + Google Ads sync jobs, KPI widgets, performance page, ROI card |
| W5 D4–5 | Invoices, Razorpay checkout + webhooks, Stripe fallback, receipts, delivery-vault gate on payment |
| W6 D1–2 | Change Request engine (quote, e-accept, auto milestone/invoice) |
| W6 D3 | CSAT micro-polls, Founder Box + admin inbox, Cal.com scheduler |
| W6 D4 | Upsell rules engine + cards, referral widget |
| W6 D5 | Hardening: load test, accessibility audit, DPDP checklist, docs, launch to pilot clients |

### Post-launch backlog

Mobile PWA push, client-branded subdomains, SSO for enterprise clients, AI weekly summary ("Here's what happened this week"), auto-generated monthly performance PDF, Shopify/CRM revenue hooks, public status page, in-portal contract e-sign.

### Success metrics

Time-to-first-action \< 15s (measured), median approval turnaround −40%, WhatsApp/email back-and-forth −60%, CSAT ≥ 4.5, upsell card click-through ≥ 8%, % extra revisions converted to paid CRs ≥ 50%.

### Key risks

| Risk | Mitigation |
| --- | --- |
| 6 weeks is tight for the video reviewer | Use Mux + off-the-shelf player; ship drawing as v1.1 |
| Ads API approval delays (Meta/Google app review) | Apply in Week 1; manual CSV import fallback |
| Client adoption (habit of WhatsApp) | WhatsApp deep links into the portal, Vernex PMs stop answering approvals on WhatsApp |
| Tenancy bug leaks data | RLS + automated cross-tenant tests in CI |

---

## 6. UI/UX DESIGN SYSTEM

### 6.1 Theme

"**Midnight Signal**": a high-tech, Gen Z agency feel. Dark-first with a light mode. Glassy surfaces, soft glow on primary actions, generous radius, motion kept subtle (150–200ms ease-out). Clients default to light mode (better for business users on mobile outdoors); Vernex staff default to dark.

### 6.2 Colour Palette

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--bg` | `#0B0D17` | `#F7F8FC` | App background |
| `--surface` | `#141828` | `#FFFFFF` | Cards |
| `--surface-2` | `#1C2136` | `#EEF0F8` | Hover / nested |
| `--border` | `#2A3050` | `#E1E4F0` | Dividers |
| `--text` | `#F2F4FF` | `#12152B` | Primary text |
| `--text-muted` | `#9AA3C7` | `#5B6285` | Secondary |
| `--primary` | `#6C5CFF` | `#5B4BFF` | Brand violet; primary buttons |
| `--primary-glow` | `#8F84FF` | `#7C6FFF` | Focus/hover |
| `--accent` | `#00E5C3` | `#00BFA5` | Highlights, live indicators |
| `--hot` | `#FF4D8D` | `#F0286E` | Gen Z accent, upsell highlights |
| `--success` | `#22C55E` | `#16A34A` | Positive |
| `--warning` | `#F59E0B` | `#D97706` | Caution |
| `--danger` | `#EF4444` | `#DC2626` | Blocked / errors |
| `--info` | `#38BDF8` | `#0284C7` | In review |

Brand gradient: `linear-gradient(135deg, #6C5CFF 0%, #00E5C3 100%)` (use sparingly: logo, hero numbers, progress bar). Verify with actual brand assets from vernex.in and adjust tokens; all text/background pairs must hit 4.5:1.

### 6.3 Typography

- **Headings:** *Space Grotesk* (600/700): H1 32/40, H2 24/32, H3 18/28.
- **Body/UI:** *Inter* (400/500/600): 14/22 base, 16/24 on mobile for inputs (prevents iOS zoom).
- **Mono (keys, code, timecodes):** *JetBrains Mono* 13/20.
- **Numbers (KPIs):** Space Grotesk 700, tabular-nums, 32–48px.
- Fallback stack: `system-ui, -apple-system, 'Segoe UI', sans-serif`. Support Devanagari/Tamil via Noto Sans for names and content.

### 6.4 Layout, Cards, Components

- Spacing scale 4/8/12/16/24/32/48. Max content width 1280px. 12-col grid desktop, 4-col mobile.
- **Card:** background `--surface`, 1px `--border`, radius 16px, padding 20px (16px mobile), shadow `0 1px 2px rgba(0,0,0,.2)` (dark) / `0 1px 3px rgba(18,21,43,.08)` (light). Hover (interactive cards): border `--primary` at 40% + translateY(-1px).
- **Action Required banner:** radius 16, background `rgba(245,158,11,.12)`, 1px border `--warning`, left 4px accent bar, CTA button solid warning.
- **Buttons:** Primary (violet fill, white text, 40px height, radius 10), Secondary (outline), Ghost, Danger. Approve = success fill; Request revision = outline amber. Min tap target 44×44.
- **Inputs:** 40px, radius 10, 2px focus ring `--primary-glow`.
- **Modals** on desktop, bottom sheets on mobile. **Toasts** bottom-right, 4s.
- **Empty states:** friendly illustration + single CTA. **Skeleton loaders** over spinners.
- Icons: Lucide, 20px stroke 1.75.

### 6.5 Status Pills

| Status | Background | Text | Dot |
| --- | --- | --- | --- |
| On Track | `#22C55E1F` | `#22C55E` | solid |
| In Review | `#38BDF81F` | `#38BDF8` | pulsing |
| Waiting on You | `#F59E0B1F` | `#F59E0B` | pulsing |
| Blocked | `#EF44441F` | `#EF4444` | solid |
| Approved / Paid | `#22C55E1F` | `#22C55E` | check icon |
| Revision Requested | `#FF4D8D1F` | `#FF4D8D` | pencil icon |
| Draft / Upcoming | `#9AA3C71F` | `#9AA3C7` | hollow |
| Overdue | `#EF444433` | `#FCA5A5` (dark) / `#B91C1C` (light) | solid, bold |

Pill: height 24, radius 999, padding 0 10px, 12px/600 text. Never rely on colour alone: always include a label or icon.

### 6.6 Mobile-First Guidelines

- Design at 360px first; breakpoints: `sm 640`, `md 768`, `lg 1024`, `xl 1280`.
- Bottom tab bar (5 items), thumb-zone primary actions, sticky approve/revise bar on deliverable pages.
- Tables collapse to stacked cards; calendars default to List view on mobile.
- Video reviewer on mobile: player on top, comments in a bottom sheet; tap timeline to add a comment.
- Performance: image lazy loading, `next/image`, route-level code splitting, PWA installable, offline shell + queued uploads.
- Network resilience: retry/resume uploads, optimistic UI with rollback, skeletons.
- Accessibility: focus-visible, reduced-motion support, screen-reader labels on pills and meters, minimum 4.5:1 contrast, keyboard shortcuts documented under `?`.

### 6.7 Microcopy Tone

Warm, direct, bilingual-friendly, never corporate. Examples: "You're all caught up ✓", "2 things need you to keep moving", "Revision 2 of 3 used. One more round included", "Nice, approved! We'll lock this in."

---

## Appendix: Notification Matrix

| Event | In-app | Email | WhatsApp | Recipient |
| --- | --- | --- | --- | --- |
| Deliverable ready for review | ✓ | ✓ | ✓ | Client approvers |
| Approval reminder (24/48/72h) | ✓ | ✓ | ✓ (48h+) | Client approvers, then PM |
| Revision submitted | ✓ | ✓ | ✓ (urgent) | PM, assigned lead |
| New version delivered | ✓ | ✓ | ✓ | Requester |
| Invoice issued / due / overdue | ✓ | ✓ | ✓ | Client admin |
| CSAT ≤ 2 or Founder box complaint | ✓ | ✓ | ✓ | Founder |
| File expiring (14d / 3d) | ✓ | ✓ | – | Client admin |
| Quote ready | ✓ | ✓ | ✓ | Client admin |

*End of specification.*