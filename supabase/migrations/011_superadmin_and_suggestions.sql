-- Suggestion box (every role can submit) + a superadmin role that can see
-- who wrote a suggestion (for moderating foul language), while regular
-- admin sees the same suggestion list but anonymized.
--
-- Run this once in the Supabase SQL Editor.

alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('admin','superadmin','staff-admin','staff','user'));

create table if not exists suggestions (
  id          text primary key,
  user_id     text not null references users(id) on delete cascade,
  user_name   text not null,   -- snapshot so it still reads correctly if the user is later renamed/removed
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_suggestions_user on suggestions(user_id);

-- demo superadmin account, mirroring the existing admin/staffadmin demo users
insert into users (id, username, password, role, name, avatar, plant, credit_limit, credit_balance, registered, is_employee)
values ('u-superadmin-1', 'superadmin', 'Koufu@2026++', 'superadmin', 'Super Admin', 'SU', 'KF-Main', 1000, 1000, true, true)
on conflict (id) do nothing;
