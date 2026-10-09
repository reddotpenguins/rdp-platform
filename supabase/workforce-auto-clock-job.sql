-- Run after workforce-operations.sql. Supabase Cron runs even when nobody has the app open.
create extension if not exists pg_cron;
select cron.schedule('rdp-auto-clock-out','* * * * *','select public.workforce_auto_close()');
