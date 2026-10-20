-- Vernex Hub: 05 onboarding seed (the playbook's checklists and 11 message templates)
-- Run after 04_storage.sql. Safe to re-run: it replaces the master lists, not any client's data.

begin;

-- ---------------------------------------------------------------------------
-- Master checklist. service: common | social | website. owner: vernex | client.
-- due_offset_days: days after the checklist is generated.
-- ---------------------------------------------------------------------------

delete from public.onboarding_item_templates;

insert into public.onboarding_item_templates (service, stage, title, owner, position, due_offset_days) values
-- Common to every client (playbook: Step by step)
('common', 'Sign-up',   'Proposal sent',                                         'vernex',  1, 0),
('common', 'Sign-up',   'Agreement sent',                                        'vernex',  2, 1),
('common', 'Sign-up',   'Agreement signed',                                      'client',  3, 3),
('common', 'Sign-up',   'First invoice sent',                                    'vernex',  4, 1),
('common', 'Sign-up',   'First invoice paid',                                    'client',  5, 7),
('common', 'Welcome',   'Welcome message and portal invite sent',                'vernex',  6, 7),
('common', 'Welcome',   'Onboarding form and access request sent',               'vernex',  7, 8),
('common', 'Welcome',   'Setup form completed in the portal',                    'client',  8, 10),
('common', 'Kickoff',   'Kickoff call held (45 min)',                            'vernex',  9, 12),
('common', 'Kickoff',   'Kickoff summary sent and milestones added',             'vernex', 10, 13),
('common', 'Kickoff',   'First deliverables sent for approval',                  'vernex', 11, 21),

-- Social media clients (playbook: Social media client checklist)
('social', 'Access',    'Instagram switched to Professional and linked to the Facebook Page', 'client', 1, 10),
('social', 'Access',    'Vernex added as partner in Meta Business Settings (Page, Instagram, ad account, pixel)', 'client', 2, 10),
('social', 'Access',    'Ad account set up with the client''s own payment method', 'client', 3, 10),
('social', 'Access',    'Meta Pixel or Conversions API on the website',          'vernex',  4, 14),
('social', 'Access',    'Google Business Profile manager access',               'client',  5, 10),
('social', 'Access',    'Instagram and Facebook connected in the portal',       'client',  6, 10),
('social', 'Brand',     'Logo, brand colours and fonts uploaded to Brand Assets', 'client', 7, 10),
('social', 'Brand',     '20+ real photos and videos uploaded',                  'client',  8, 12),
('social', 'Brand',     'Offers, prices and USPs shared; what never to say',     'client',  9, 10),
('social', 'Brand',     'Top 3 competitors and 3 admired accounts shared',       'client', 10, 10),
('social', 'Brand',     'Approver named; 3-working-day turnaround agreed',       'client', 11, 10),
('social', 'Brand',     'Shoot day booked (if Vernex creates video)',            'vernex', 12, 14),
('social', 'Month 1',   'Baseline recorded: followers, reach, leads, CPL, Google rating', 'vernex', 13, 10),
('social', 'Month 1',   'Account audit with the top 5 fixes',                    'vernex', 14, 14),
('social', 'Month 1',   'Bio, highlights and link in bio cleaned up',           'vernex', 15, 14),
('social', 'Month 1',   'Content pillars and 30-day calendar sent for approval', 'vernex', 16, 17),
('social', 'Month 1',   'Ad campaign structure and first creatives sent for approval', 'vernex', 17, 17),
('social', 'Month 1',   'Lead handling agreed: who answers enquiries, how fast', 'vernex', 18, 14),
('social', 'Month 1',   'KPI targets agreed in writing against the baseline',   'vernex', 19, 14),

-- Website clients (playbook: Website client checklist)
('website', 'Discovery', 'Discovery questionnaire completed',                    'client',  1, 7),
('website', 'Discovery', 'Brief signed off',                                     'vernex',  2, 9),
('website', 'Access',    'Domain registrar or DNS access shared',                'client',  3, 10),
('website', 'Access',    'Hosting or platform account set up in the client''s name', 'client', 4, 10),
('website', 'Access',    'Business email set up for enquiry forms',             'client',  5, 10),
('website', 'Access',    'GA4 and Search Console owned by client, Vernex added', 'client',  6, 10),
('website', 'Access',    'Third-party tools in the client''s name (booking, payments, WhatsApp)', 'client', 7, 12),
('website', 'Content',   'Sitemap and page list agreed',                         'vernex',  8, 12),
('website', 'Content',   'Copy supplied or Vernex copy approved',                'client',  9, 14),
('website', 'Content',   'Photos supplied',                                      'client', 10, 14),
('website', 'Design',    'Home page design approved',                            'client', 11, 21),
('website', 'Design',    'Inner pages approved; design-approval invoice paid',   'client', 12, 24),
('website', 'Build',     'Staging site reviewed; bug list in the portal',        'client', 13, 32),
('website', 'Build',     'Staging approved; launch invoice paid',                'client', 14, 35),
('website', 'Launch',    'Launch checklist passed (mobile, speed, forms, SSL, redirects, GA4, pixel, backup)', 'vernex', 15, 38),
('website', 'Launch',    'Site live and DNS switched',                           'vernex', 16, 40),
('website', 'Launch',    'Credentials and how-to video handed over',             'vernex', 17, 41),
('website', 'Launch',    'Maintenance plan offered; 30-day warranty started',    'vernex', 18, 41);

-- ---------------------------------------------------------------------------
-- The 11 playbook messages. Merge fields the app fills from the client record:
-- {{contact_name}} {{client_name}} {{lead_name}} {{pm_name}} {{portal_link}} {{kickoff_time}}
-- {{invoice_number}} {{amount}} {{due_date}} {{payment_link}} {{month}}
-- Square-bracket text like [Problem 1] is for the sender to fill by hand.
-- ---------------------------------------------------------------------------

delete from public.message_templates;

insert into public.message_templates (key, title, channel, subject, body, position) values
('proposal', 'Proposal', 'email', '{{client_name}} growth plan: next 90 days', $t$Hi {{contact_name}},

Thank you for the time on [day]. As promised, the plan is attached.

What we heard:
- [Problem 1, in their words]
- [Problem 2]

What we'll do:
- Month 1: audit, strategy and setup ([key items])
- Month 2: launch and optimise ([key items])
- Month 3 onward: scale what works

What we'll measure: [KPI 1], [KPI 2], against your current baseline of [baseline].

Investment: {{amount}}/month + GST, for a [6]-month term. Ad spend is paid directly to Meta/Google and is separate.

The proposal is valid until [date]. Happy to walk through it on a 15-minute call this week.

Boss Anandaa
Founder, Vernex · vernex.in$t$, 1),

('proposal_follow_up', 'Proposal follow-up', 'whatsapp', null, $t$Hi {{contact_name}}, Boss from Vernex. Did you get a chance to look at the plan? Happy to adjust the scope if anything doesn't fit. Is a 15-minute call on [day] at [time] okay?$t$, 2),

('agreement', 'Agreement', 'email', 'Agreement: Vernex x {{client_name}}', $t$Hi {{contact_name}},

Great to have you on board. Attached is our services agreement, covering the scope, fees and terms we discussed.

Once it's signed and the first invoice is cleared, we start the same week. The invoice is also attached, with a payment link.

Any questions on the agreement, just reply here.

Boss Anandaa$t$, 3),

('welcome_whatsapp', 'Welcome (WhatsApp)', 'whatsapp', null, $t$Welcome to Vernex, {{contact_name}}! We're excited to grow {{client_name}} with you.

Here's what happens next:
1. You'll get an email to sign in to your Vernex portal. Everything lives there: approvals, files, reports and invoices.
2. Tomorrow we'll send a short onboarding form and the access we need.
3. Kickoff call: {{kickoff_time}}. 45 minutes.

Your account lead is {{lead_name}}, reachable on this number.$t$, 4),

('welcome_email', 'Welcome email with portal invite', 'email', 'Welcome to Vernex: your client portal is ready', $t$Hi {{contact_name}},

Your Vernex portal is live: {{portal_link}}
Sign in with this email address. No password needed; we send you a link.

In the portal you can:
- approve or request changes on every post, ad and page
- see your leads, reach and spend in one place
- download your files and invoices
- write to me directly through "Note to the founder"

Kickoff: {{kickoff_time}}, [Google Meet link].

Boss Anandaa$t$, 5),

('onboarding_access', 'Onboarding form and access request', 'email', 'Before kickoff: 15 minutes of setup', $t$Hi {{contact_name}},

To hit the ground running, please complete this before [date]:

1. Setup form (10 min): sign in at {{portal_link}} and fill in "Let's get set up".
2. Access: the step-by-step list is in the same form.
3. Upload your logo, brand colours and 10+ photos to Brand Assets in the portal.

We never ask for your passwords. All access is given through Meta Business, Google and your hosting account's own sharing.

Thanks,
{{pm_name}}, Vernex$t$, 6),

('kickoff_summary', 'Kickoff summary', 'email', 'Kickoff summary and next steps', $t$Hi {{contact_name}},

Thank you for today. What we agreed:
- Goals for 90 days: [goal 1], [goal 2]
- Baseline today: [numbers]
- First deliverables: [items], for your approval by [date]
- Your actions: [items], by [date]
- Our next check-in: [day, time]

The full plan is in your portal under Dashboard.

{{pm_name}}$t$, 7),

('invoice', 'Invoice', 'email', 'Invoice {{invoice_number}}: Vernex, {{month}}', $t$Hi {{contact_name}},

Please find invoice {{invoice_number}} for {{amount}}, due on {{due_date}}.

Pay online: {{payment_link}}
Or bank transfer: [Account name], A/c [no.], IFSC [code], UPI [id]

Thank you,
Vernex Accounts$t$, 8),

('payment_reminder', 'Payment reminder', 'whatsapp', null, $t$Hi {{contact_name}}, a quick note that invoice {{invoice_number}} for {{amount}} is due on {{due_date}}. Pay here: {{payment_link}}. Thank you!$t$, 9),

('monthly_report', 'Monthly report', 'email', '{{client_name}}: {{month}} results and next month''s plan', $t$Hi {{contact_name}},

The headline: [one sentence with the main number].

What worked: [1-2 points]
What we're changing: [1-2 points]
Next month: [plan]

Full report in your portal: {{portal_link}}

{{pm_name}}$t$, 10),

('renewal', 'Renewal', 'email', 'The next 6 months for {{client_name}}', $t$Hi {{contact_name}},

Thanks for the chat. Since we started: [baseline] -> [current numbers].

For the next term we recommend: [plan], at {{amount}}/month + GST. The new term would start on [date]. If you're happy, I'll send the renewal agreement this week.

Boss Anandaa$t$, 11);

commit;
