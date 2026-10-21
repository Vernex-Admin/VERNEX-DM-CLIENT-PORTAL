# Vernex Hub: Supabase SQL

Put this folder in the repo as `supabase/sql/`. Claude Code reads it to match the app to the database.

Run each file once, in order, in Supabase: SQL Editor -> New query -> paste the whole file -> Run.

| File | What it does |
| --- | --- |
| 01_schema.sql | All tables (matches src/types/db.ts, plus onboarding tables) |
| 02_security.sql | Invite-only sign-in, row-level security on every table, invoice numbers |
| 03_functions.sql | Actions the app calls with supabase.rpc(): create_client, approve_deliverable, request_revision, publish_version, grant_bonus_revision, set_account_lead, reorder_milestones, update_me, convert_lead_to_client, generate_onboarding, submit_onboarding, onboarding_gates |
| 04_storage.sql | Private "vault" bucket and its access rules |
| 05_onboarding_seed.sql | Playbook checklists (48 items) and the 11 message templates |
| 06_first_admin.sql | Adds you as founder. Edit the email first. |
| 07_check.sql | Health check. Every row should say OK. |
| 08_integrity.sql | Hardening: refuses rows that point at another client's project, milestone, deliverable or comment target |
| 10_client_code_login.sql | Private Client Code hashes and server-side sign-in attempt limits |
| `../migrations/20261022120000_agreement_signing.sql` | Agreement templates, draft/sign/send lifecycle, private signatures, audit events, RLS, and onboarding gate integration |
| `../migrations/20261023120000_invoice_generator.sql` | Invoice Generator: editable invoice documents, server-side totals, draft/issue/revision lifecycle, manual payment status with audit history, company defaults, templates, private logo/QR images, disabled payment-gateway hook |
| `../migrations/20261024120000_invoice_generator_issue_and_audit.sql` | Invoice Generator part 2: client notice (Action Required) on issue, resolved when paid or cancelled; names in the audit history; description limits so a row fits one A4 page; no duplicated rows or line items |

Rules the database enforces:
- Only emails with a profile row can sign in. Staff add people from the admin console.
- Founder sees all clients; a PM sees assigned clients; client users see only their own client.
- Clients never see internal deliverables or comments, draft invoices or documents, leads, templates, or other clients.
- Founder Box messages are visible to the founder and the sender only.
- Clients approve and request revisions only through the functions, which check can_approve and the revision limit.
- Deleting a client is founder-only.

Tested on Postgres with 45 checks before delivery.

## Shared identifier sign-in

After running `10_client_code_login.sql`, deploy the Edge Function from the repository root with
`supabase functions deploy login-with-identifier`. Set `SUPABASE_SERVICE_ROLE_KEY` as an Edge
Function secret; never add that key to a browser `.env` file. Client Codes are looked up by private
hash, and email identifiers are resolved against active profiles. The function then asks Supabase
Auth to verify the actual password. The browser receives only the normal Supabase auth session and
loads the signed-in profile under that user's RLS permissions.

## Admin account

`09_admin_setup.sql` is read-only. To create or verify `admin@vernex.in`, first verify the correct
Supabase project and set `SUPABASE_URL`, matching `SUPABASE_PROJECT_REF`, and
`SUPABASE_SERVICE_ROLE_KEY` in a trusted shell. Run `npm run setup:admin`. Set
`ADMIN_INITIAL_PASSWORD` only when the Auth account does not exist yet. The script preserves an
existing password, refuses an inactive or non-founder profile, and verifies the Auth/profile link.
The service-role key and initial password must never be placed in frontend environment variables or
committed to the repository.

Assign or rotate each person's code in the Supabase SQL Editor using the example at the end of
`10_client_code_login.sql`. Codes are case-insensitive and 6-64 letters, numbers, or hyphens.
Users still need an Auth account and password. Existing email-only users must set a password through
the existing Supabase account recovery process before using this form.

## Digital agreements and e-signatures

The agreement lifecycle is managed by the versioned migration in `supabase/migrations/`. After
confirming the target project and reviewing the migration, apply it with `supabase db push`. It
creates the private `agreements` bucket, RLS policies, audit history, templates, and server-timestamped
RPCs. Authenticated clients can only read agreements assigned to their own client after the founder
has signed and sent them. Signature uploads are writable only while the matching signer is pending;
the signing RPC freezes the signed content and rejects subsequent edits or duplicate signatures.

Deploy PDF generation after the migration with `supabase functions deploy generate-agreement-pdf`.
The function uses Supabase's server-side `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secrets to
read private signatures and save the final PDF; neither secret belongs in the browser `.env` file.
The agreement history is the existing in-app status/audit feed. This project has no general email or
push notification delivery service to send agreement notifications.

## Invoice Generator

Apply `../migrations/20261023120000_invoice_generator.sql` and then
`../migrations/20261024120000_invoice_generator_issue_and_audit.sql` with `supabase db push` after the
earlier migrations, once you have confirmed the target project. The second file only adds to the first,
so it is safe whether or not the first was applied earlier. It extends `invoices` and `invoice_items`
(existing invoices are kept and marked as CGST 9% + SGST 9%, which is what the quick form charged) and adds
`invoice_settings`, `invoice_templates`, `invoice_events`, `invoice_payments` and the private
`invoice-assets` storage bucket.

What the database enforces:
- Generator invoices are written only through `save_invoice_draft`, `issue_invoice`, `revise_invoice` and
  `set_invoice_payment_status`. Totals are always recomputed from the document (`invoice_compute`, the same
  arithmetic as `src/lib/invoiceMath.ts`); GST rates must be in the configured list, GST applies only to
  INR invoices, and discounts cannot be negative or exceed the subtotal.
- An issued invoice is frozen: content, totals, dates and number cannot change and it cannot be deleted.
  Changes go into a revision (`VX/26-27/0049-R2`); issuing the revision cancels the original.
- Payment status moves only along allowed paths (issued to part-paid, paid, overdue or cancelled, and so on)
  and every change is written to `invoice_events` with who made it and an optional note.
- Clients read only their own non-draft invoices and only the logo/QR images those invoices use. They cannot
  read the history, settings or templates. Every write function requires staff.
- Issuing puts "Invoice VX/26-27/0049 is due on 5 Nov 2026" on that client's Action Required list (the
  portal's in-app notifications; there is no email or push service). Paying or cancelling resolves it.
- Every event records the person's name (`invoice_events.actor_name`) and the database time in UTC; the
  app shows times in IST.
- A row's description is limited to 1,500 characters and 30 lines so it always fits on one A4 page, and
  duplicated rows are refused. Line items are unique per position.

The A4 preview, the printout and the downloaded PDF use the same page plan
(`src/lib/invoicePagination.ts`). The PDF is drawn in the browser from the laid-out pages with the same
self-hosted fonts (`@fontsource/arimo`, `@fontsource/cormorant-garamond`), so no server set-up is needed
for it.

Payments stay in **Mock Payment** mode. The QR code is a picture: showing or scanning it never marks an
invoice paid, and the app cannot switch Gateway Integration on. To connect a provider later:
1. Build a webhook Edge Function that verifies the provider's signature over the raw request body, using a
   webhook secret stored as an Edge Function secret.
2. From that function, with the service-role key, call
   `record_gateway_payment(invoice_id, provider, provider_payment_id, amount_minor, currency)`. It is
   executable only by `service_role`, refuses overpayments and currency mismatches, and counts each
   provider payment id once, so replayed webhooks change nothing.
3. Only then set `gateway_configured = true` on the `invoice_settings` row in the SQL Editor. Staff can
   then choose Gateway Integration under Invoice Generator > Defaults.

Uploaded logos and QR images are never overwritten or deleted, because issued invoices may still show
them. Replacing or removing one only changes what new invoices use.
