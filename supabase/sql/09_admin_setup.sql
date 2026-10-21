-- Admin provisioning is intentionally not performed from SQL.
-- Use `npm run setup:admin` from a trusted shell with SUPABASE_URL,
-- SUPABASE_PROJECT_REF, SUPABASE_SERVICE_ROLE_KEY and (only for a new Auth
-- account) ADMIN_INITIAL_PASSWORD set in the environment. The script uses the
-- Supabase Auth Admin API, verifies the project ref, preserves existing Auth
-- passwords, and only accepts an active vernex_founder profile.
--
-- Read-only verification:
select id, email, role, user_id, is_active
from public.profiles
where lower(email) = lower('admin@vernex.in');
