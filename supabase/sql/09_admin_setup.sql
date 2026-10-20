-- ===========================================================================
-- Vernex Hub: Setup Admin Account (admin@vernex.in)
-- ===========================================================================
-- Run this script in your Supabase project's SQL Editor (https://supabase.com/dashboard/project/zvueqcqhobqfoquyxjkx/sql)

-- 1. Insert or update the administrator profile
insert into public.profiles (email, full_name, role, is_active)
values ('admin@vernex.in', 'Boss Anandaa', 'vernex_founder', true)
on conflict ((lower(email))) do update 
set role = 'vernex_founder', is_active = true;

-- 2. Verify it's set
select id, email, role, user_id, is_active 
from public.profiles 
where lower(email) = 'admin@vernex.in';

