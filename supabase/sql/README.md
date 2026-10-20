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

Rules the database enforces:
- Only emails with a profile row can sign in. Staff add people from the admin console.
- Founder sees all clients; a PM sees assigned clients; client users see only their own client.
- Clients never see internal deliverables or comments, draft invoices or documents, leads, templates, or other clients.
- Founder Box messages are visible to the founder and the sender only.
- Clients approve and request revisions only through the functions, which check can_approve and the revision limit.
- Deleting a client is founder-only.

Tested on Postgres with 45 checks before delivery.
