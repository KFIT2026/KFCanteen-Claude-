-- Over-the-counter orders: staff can encode a walk-up sale for an employee
-- (searched by ID number, can pay Cash or Credit) or a visitor/guard (typed
-- name only, Cash only — they have no account to search or charge credit
-- to). These are regular orders under the hood, just tagged so they're
-- clearly labeled everywhere order history shows up.
--
-- Run this once in the Supabase SQL Editor.

alter table orders add column if not exists source text not null default 'app' check (source in ('app','otc'));
alter table orders add column if not exists encoded_by text;
alter table orders add column if not exists guest_type text check (guest_type in ('visitor','guard'));
