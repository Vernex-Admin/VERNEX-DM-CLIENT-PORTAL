-- Vernex Hub: 07 health check. Run any time; it changes nothing.
-- Every row should say OK.

select 'RLS on: ' || c.relname as check,
       case when c.relrowsecurity then 'OK' else 'PROBLEM: row-level security is OFF' end as result
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
union all
select 'Message templates', case when count(*) = 11 then 'OK' else 'PROBLEM: expected 11, found ' || count(*) end
  from public.message_templates
union all
select 'Checklist templates', case when count(*) >= 40 then 'OK' else 'PROBLEM: found ' || count(*) end
  from public.onboarding_item_templates
union all
select 'Founder profile', case when count(*) >= 1 then 'OK' else 'PROBLEM: run 06_first_admin.sql' end
  from public.profiles where role = 'vernex_founder'
union all
select 'Vault bucket is private', case when bool_and(not public) then 'OK' else 'PROBLEM: bucket is public' end
  from storage.buckets where id = 'vault'
union all
select 'Sign-in trigger', case when count(*) = 1 then 'OK' else 'PROBLEM: run 02_security.sql' end
  from pg_trigger where tgname = 'on_auth_user_created'
order by 2 desc, 1;
