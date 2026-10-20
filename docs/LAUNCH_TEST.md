# Vernex Hub: launch test

Run this once on the real Supabase project before giving anyone a login. It takes about 90 minutes.
Tick each box. If any "Expect" is wrong, stop and fix it before launch.

## 0. Before you start

- [ ] SQL files `01` to `07` have run, in order, and every row of `07_check.sql` says OK. Also run `08_integrity.sql` (hardening).
- [ ] `.env.local` (or the host's settings) has `VITE_DATA_SOURCE=supabase`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The key is the anon / publishable key, never the service_role key.
- [ ] Supabase: Authentication, URL Configuration lists your site address and `<site>/auth/callback` as redirect URLs. Google provider is on if you use it.
- [ ] Open the app in 4 separate browser profiles (or private windows in different browsers) so sessions do not mix:
  **F** = founder, **P** = PM, **A** = Client A, **B** = Client B.
- [ ] You need 6 working inboxes. Plus-addresses work (`you+pm@gmail.com`).

| Person | Role | Client |
| --- | --- | --- |
| Founder | vernex_founder | none (added by `06_first_admin.sql`) |
| PM | vernex_pm | assigned to Client A only |
| A-admin | client_admin | Test Co A |
| A-member | client_member, can approve **off** | Test Co A |
| B-admin | client_admin | Test Co B |

## 1. Sign-in

1. **F:** open `/admin/login`, enter the founder email, click **Send me a sign-in link**.
   - Expect: "Check your email". No "Open the link (development)" button and no "Sign in as" list.
2. Open the link from the inbox.
   - Expect: you land in `/admin/clients`.
3. **F:** sign out from the user menu, open `/admin/login`, enter `nobody-invited@example.com`.
   - Expect: "This email isn't on the Vernex Hub list yet. Ask your Vernex contact to add you."
4. Click **Send me a sign-in link** many times in a row with a valid email.
   - Expect: Supabase's rate-limit message is shown as written, the button is disabled while sending.
5. Sign in again as **F** with Google (if enabled). Expect: same landing page.

## 2. Set up the two test clients (as F)

1. **Clients, New client**: create "Test Co A", then "Test Co B".
2. In Test Co A, **Team, Invite user**: A-admin (Client admin) and A-member (Client member).
3. In Test Co B, **Team, Invite user**: B-admin (Client admin).
4. **Staff** (sidebar, founder only): **Add PM**, name "Test PM", the PM email.
   Tick **Test Co A** for that PM. Leave Test Co B unticked.
   - Expect: Test Co A's account lead stays as set; the PM row shows only Test Co A ticked after a reload.
5. In each client create one project ("Launch") with two milestones.
6. In Test Co A open **Team** and set A-member's approve permission **off** (if shown). Expect: A-member cannot approve later (section 7).

## 3. PM scope

1. **P:** sign in at `/admin/login` with the PM email.
   - Expect: **Clients** shows only Test Co A. Test Co B is absent.
2. Paste Test Co B's address (`/admin/clients/<B id>`, copied from **F**).
   - Expect: "We can't find that client".
3. **P:** look at the sidebar. Expect: **Staff** and **Founder Inbox** are not there. **Templates** and **Pipeline** are.
4. **P:** open `/admin/staff` and `/admin/founder-inbox` by typing the address.
   - Expect: no staff list, no Founder Box messages.
5. **P:** open Test Co A, the delete button on the client page.
   - Expect: not offered. (Only the founder deletes clients.)

## 4. Onboarding checklist and gates

1. **F:** Test Co A, **Onboarding** tab, choose **Both**, **Create checklist**.
   - Expect: 48 items in stages; banner says "Don't start work yet" with both gates unticked.
2. **F:** tick one Vernex item. Expect: progress bar moves, count changes.
3. **F:** **Documents** tab, add an **Agreement** (Drive link `https://drive.google.com/file/d/test/view`), status **Draft**.
   Click **Mark sent**, then **Mark signed**.
   - Expect: back on **Onboarding**, "Agreement signed" is ticked. Banner still says "Don't start work yet".
4. **F:** **Invoices**, create an invoice (status **Sent**), then set it **Paid**.
   - Expect: "First invoice paid" ticked and the banner says **Ready to start**.
5. **A-admin:** sign in at `/login`.
   - Expect: you are taken to **Let's get set up** (the checklist exists, answers are empty).
6. **A-admin:** tick two items, fill one answer, **Save and continue to dashboard**.
   - Expect: dashboard opens. **F** sees those two items ticked in Test Co A's checklist.
7. **A-admin:** open **Setup** again. Expect: only client-owned items, no Vernex items.
8. **B-admin:** sign in. Expect: no setup form (Test Co B has no checklist yet).

## 5. Documents

1. **F:** Test Co A, **Documents**, add a **Proposal** with status **Draft** by **File upload** (any small PDF).
2. **A-admin:** **Vault, Documents**.
   - Expect: the signed agreement is listed. The draft proposal is **not**.
3. **F:** click **Mark sent** on the proposal.
4. **A-admin:** reload **Vault, Documents**.
   - Expect: the proposal appears with a Sent pill and an **Open** button that downloads the PDF.
5. **B-admin:** **Vault, Documents**. Expect: nothing of Test Co A.

## 6. Message templates

1. **F:** **Templates**, choose **Test Co A** under "Merge with client".
   - Expect: 11 templates; `{{client_name}}` and `{{contact_name}}` are filled; `{{kickoff_time}}` stays as typed.
2. Click **Copy text**, **Send on WhatsApp** (needs a phone number on the contact), **Open in email**.
   - Expect: clipboard text, a wa.me page, a mail draft with the subject.
3. Edit one template and **Save changes**; reload. Expect: the edit stays.
4. **A-admin:** type `/admin/templates`. Expect: you are sent back to the client portal.

## 7. Deliverables: publish, approve, request revision, limit

1. **F:** Test Co A, **Deliverables, New deliverable**: title "Reel 1", project Launch, **Revision limit 1**, visibility **Internal**.
2. **A-admin:** **Approvals**. Expect: "Reel 1" is **not** listed.
3. **F:** **Publish version** on Reel 1: upload a small PNG, visibility **Client**.
   - Expect: toast "Version 2 published"; status In review.
4. **A-admin:** **Approvals** or the dashboard.
   - Expect: "Review Reel 1 (version 2)" and a preview image that loads.
5. **A-member (approve off):** open Reel 1.
   - Expect: no Approve button; text says the admin approves.
6. **A-admin:** **Request a revision** with fewer than 20 characters.
   - Expect: refused, message asks for at least 20 characters.
7. **A-admin:** request a revision with 20+ characters, then double-click **Send**.
   - Expect: **one** revision is recorded (1 of 1 used). Status Revision requested.
8. **F:** publish version 3 (upload another PNG, visibility Client).
   - Expect: status In review again; the old revision shows Delivered.
9. **A-admin:** try **Request a revision** again.
   - Expect: refused: "No revisions are left on this deliverable. Submit a service request for further changes."
10. **F:** **Grant bonus revision** with a reason. **A-admin:** request again. Expect: accepted (2 of 2).
11. **A-admin:** **Approve**, confirm. Expect: status Approved, approval line in the activity feed.
12. **F:** reload Reel 1 after 20 minutes. Expect: the preview image still loads.

## 8. Brand assets: upload and download

1. **A-admin:** **Vault, Brand Assets**, upload a small PNG.
   - Expect: it appears and opens/downloads.
2. **A-admin:** upload a file over 50 MB.
   - Expect: "Files over 50 MB go on Google Drive". Nothing is uploaded.
3. **F:** Test Co A's files show the PNG. Download it.
4. **A-member:** sees the PNG. **B-admin:** `Vault, Brand Assets` is empty.
5. **A-admin:** in the browser, copy the PNG's link, wait 16 minutes, open it.
   - Expect: it no longer works (links last 15 minutes). Reload the page for a fresh link.

## 9. Invoices

1. **F:** create invoice #2 for Test Co A with status **Draft**.
   - Expect: number looks like `VX/26-27/000N` (assigned by the database).
2. **A-admin:** **Billing**. Expect: the draft is **not** listed.
3. **F:** change it to **Sent**. **A-admin:** reload **Billing**. Expect: it is listed with the right total and GST.
4. **B-admin:** **Billing**. Expect: nothing of Test Co A.

## 10. Founder Box

1. **A-admin:** **Founder Box**, send a message ("Test praise").
2. **F:** **Founder Inbox**. Expect: the message is there; **Reply**. Expect: status Acknowledged.
3. **A-admin:** **Founder Box**. Expect: the reply is shown.
4. **P:** `/admin/founder-inbox` (typed). Expect: empty or no access; the message is **never** shown.
5. **A-member:** Founder Box. Expect: their own messages only, not A-admin's.

## 11. Client A never sees Client B

Do these as **A-admin**, with ids copied from **F**'s Test Co B pages:

- [ ] Type `/deliverables/<a Test Co B deliverable id>`. Expect: "can't find".
- [ ] Billing, Vault, Approvals, Requests, Performance show nothing of Test Co B.
- [ ] The dashboard shows only Test Co A's account lead and activity.
- [ ] Type `/admin/clients` and `/admin/clients/<B id>`. Expect: sent back to the portal; no admin screens.
- [ ] Post a comment on a Test Co A deliverable; **B-admin** never sees it.
- [ ] (Developer check) In the browser console on Test Co A's session, run a query for another client's rows through the app's own Supabase session: the result must be empty.

As **B-admin**, repeat the first four checks the other way round.

## 12. Shared computer and sign-out

1. **A-admin:** open Billing, Vault and a deliverable, then **Sign out**.
2. Press the browser Back button several times.
   - Expect: you land on the login page; none of A's data appears, even for a moment.
3. On the same browser, sign in as **B-admin**.
   - Expect: only Test Co B's data; no flash of Test Co A's screens.
4. Open the browser's Application tab, Local storage: the `sb-...-auth-token` entry belongs to B-admin only, and `vx.returnTo` is empty.
5. Sign in on two tabs, sign out in tab 1.
   - Expect: tab 2 returns to the login screen within a few seconds of its next action.

## 13. Removing access

1. **F:** Test Co A, **Team**: remove A-member (or switch them off).
2. **A-member** (still signed in): reload.
   - Expect: signed out, login page says "Your access has been removed. Contact Vernex."
3. **F:** **Staff**, **Deactivate** the PM. **P** reloads.
   - Expect: signed out with the same message; the PM cannot read any client.

## 14. After the test

- [ ] Delete Test Co A and Test Co B as **F** (also removes their stored files).
- [ ] In Supabase, Storage, `vault`: confirm no `clients/<test ids>` folders remain.
- [ ] In Authentication, Users: delete the test users.
- [ ] Check Supabase's logs and the Security Advisor for warnings.
