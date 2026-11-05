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
| `../migrations/20261025120000_client_management.sql` | Client Codes (VXC-1001...), login codes, staff-readable passwords, the client details form with Vernex lock |
| `../migrations/20261022120000_agreement_signing.sql` | Agreement templates, draft/sign/send lifecycle, private signatures, audit events, RLS, and onboarding gate integration |
| `../migrations/20261023120000_invoice_generator.sql` | Invoice Generator: editable invoice documents, server-side totals, draft/issue/revision lifecycle, manual payment status with audit history, company defaults, templates, private logo/QR images, disabled payment-gateway hook |
| `../migrations/20261024120000_invoice_generator_issue_and_audit.sql` | Invoice Generator part 2: client notice (Action Required) on issue, resolved when paid or cancelled; names in the audit history; description limits so a row fits one A4 page; no duplicated rows or line items |
| `../migrations/20261105230000_finance_admin_agreement_invoice.sql` | Restricted finance admin role for agreement and invoice workflows |

Rules the database enforces:
- Only emails with a profile row can sign in. Staff add people from the admin console.
- Founder sees all clients; a PM sees assigned clients; finance can read client/project details only
  for agreement and invoice workflows; client users see only their own client.
- Clients never see internal deliverables or comments, draft invoices or documents, leads, templates, or other clients.
- Founder Box messages are visible to the founder and the sender only.
- Clients approve and request revisions only through the functions, which check can_approve and the revision limit.
- Deleting a client is founder-only.

Tested on Postgres with 45 checks before delivery.

## Shared identifier sign-in

After running `10_client_code_login.sql`, deploy the Edge Function from the repository root with
`supabase functions deploy login-with-identifier`. Set `SUPABASE_SERVICE_ROLE_KEY` as an Edge
Function secret; never add that key to a browser `.env` file. Client Codes are looked up by private
hash by the function, which asks Supabase Auth to verify the password. Vernex staff email sign-in
uses Supabase Auth directly, then reads only the signed-in user's profile under RLS and accepts only
active staff profiles. The browser receives the normal Supabase auth session and loads the signed-in
profile under that user's RLS permissions.

## Client Management (Client Codes, logins, client details)

Apply `../migrations/20261025120000_client_management.sql` with `supabase db push` after the earlier
migrations, once you have confirmed the target project, then deploy both functions:

```
supabase functions deploy client-credentials
supabase functions deploy login-with-identifier
```

What it does:
- Every client gets a Client Code from a sequence: `VXC-1001`, `VXC-1002`, ... Existing clients are
  numbered in the order they were created. A trigger assigns the code on insert (a supplied one is
  ignored) and refuses any change to it.
- Clients sign in with their Client Code and password only. Email sign-in is limited to Vernex staff.
  A client's first person signs in with the Client Code itself; further people get `VXC-1001-2`, `-3`, ...
- Staff set up a login or reset a password from Client Management (or a client's Login tab). The
  `client-credentials` Edge Function sets the Supabase Auth password, the login code and its lookup hash.
  People added without an email get a reserved `@clients.vernex.invalid` address for Supabase Auth;
  it can never receive mail and the app never shows it.
- **Passwords are stored readable** in `client_credentials` so staff can look them up, as requested.
  No browser role can read that table; staff read it only through `list_client_credentials()`, which
  checks they are staff and the client is theirs. Anyone with the service-role key or database access
  can read these passwords, so keep that access tight. A client can change their own password from
  Profile; Vernex then sees the new one.
- `clients.details` holds the client's answers to the details form and `clients.detail_fields` the
  questions for that client (null means the app's standard form). Clients write only through
  `save_client_details()`, which refuses once Vernex has locked the details
  (`set_client_details_lock()`). Staff can edit the answers at any time.

People who already had a Client Code from `10_client_code_login.sql` keep signing in with it, but
Client Management shows them as "No login yet" because only a hash of that code was stored. Use
"Set up login" to give them a new code and password that staff can see.

## Admin account

`09_admin_setup.sql` is read-only. To create or verify `admin@vernex.in`, first verify the correct
Supabase project and set `SUPABASE_URL`, matching `SUPABASE_PROJECT_REF`, and
`SUPABASE_SERVICE_ROLE_KEY` in a trusted shell. Run `npm run setup:admin`. Set
`ADMIN_INITIAL_PASSWORD` only when the Auth account does not exist yet. The script preserves an
existing password, refuses an inactive or non-founder profile, and verifies the Auth/profile link.
The service-role key and initial password must never be placed in frontend environment variables or
committed to the repository.

## Finance and agreements admin

Apply `../migrations/20261105230000_finance_admin_agreement_invoice.sql` with `supabase db push`
after the earlier migrations. It adds `vernex_finance` with read access to client and project details
needed to prepare agreements and invoices, but no client-management permissions. The role can create,
edit and manage agreements and invoices; only the founder can approve and send an agreement.

To create or verify the finance admin, confirm the Supabase project and set `SUPABASE_URL`,
`SUPABASE_PROJECT_REF`, and `SUPABASE_SERVICE_ROLE_KEY` in a trusted shell. Set
`FINANCE_ADMIN_INITIAL_PASSWORD` there only if the Auth account does not exist yet, then run
`npm run setup:finance-admin`. The script preserves an existing password and verifies the active
finance profile is linked to the Auth user. Never put the service-role key or password in frontend
environment variables or commit them.

To deliberately reset the existing finance admin password, set
`FINANCE_ADMIN_RESET_PASSWORD` to a new password of at least 12 characters in the trusted shell and
rerun `npm run setup:finance-admin`. This variable changes the existing Auth password only when
explicitly provided; do not put it in `.env.local`.

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
