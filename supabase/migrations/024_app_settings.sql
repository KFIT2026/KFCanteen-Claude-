-- General-purpose settings store (key -> value) so new admin-configurable
-- settings don't each need their own dedicated table. Starts with two
-- settings:
--   menu_cutoffs               -- per-category (BREAKFAST/LUNCH/SNACK) same-day
--                                  ordering cutoff: {enabled, time}. All start
--                                  disabled -- deploying this does not change
--                                  ordering behavior until an admin turns one on.
--   allow_outside_registration -- {enabled} whether the "Are you an employee
--                                  of Kou Fu / Colortree?" question is asked
--                                  at signup, or skipped straight to employee
--                                  registration. Starts enabled (today's
--                                  behavior, unchanged).
--
-- app_settings_log is an append-only audit trail: every change to any
-- setting adds one row (who changed what, when) and nothing is ever
-- deleted, so there's a permanent record even if a setting gets flipped
-- back and forth.
--
-- Run this once in the Supabase SQL Editor.

create table if not exists app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

create table if not exists app_settings_log (
  id          text primary key,
  setting_key text not null,
  summary     text not null,
  changed_by  text not null,
  created_at  timestamptz not null default now()
);

insert into app_settings (key, value) values
  ('menu_cutoffs', '{"BREAKFAST":{"enabled":false,"time":"09:00"},"LUNCH":{"enabled":false,"time":"10:30"},"SNACK":{"enabled":false,"time":"14:00"}}'::jsonb),
  ('allow_outside_registration', '{"enabled":true}'::jsonb)
on conflict (key) do nothing;

alter publication supabase_realtime add table app_settings;
alter publication supabase_realtime add table app_settings_log;
