-- Vernex Hub: 06 first admin (you)
-- Run last. Sign-in is invite-only, so the very first person must be added here by hand.
-- 1. Replace the email below with the email Boss Anandaa will sign in with (Google or magic link).
-- 2. Run it. Then sign in to the portal with that email; you'll land in the admin console.
-- Everyone after you (PMs, client users) is added from the admin console, not here.

insert into public.profiles (email, full_name, role)
values ('REPLACE-WITH-YOUR-EMAIL@example.com', 'Boss Anandaa', 'vernex_founder')
on conflict ((lower(email))) do update set role = 'vernex_founder', is_active = true;

-- Check it worked: should show one row with role vernex_founder.
select id, email, role, user_id from public.profiles where role = 'vernex_founder';
