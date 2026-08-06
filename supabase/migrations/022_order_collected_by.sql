-- Tracks who collected payment on an order and when, so both My Orders and
-- Manage Orders can show "Collected by [name] on [date/time]" below the
-- order. Orders confirmed before this migration simply won't have these
-- columns populated -- the UI just omits the note for those, no backfill
-- attempted since the real collector/time was never recorded.
--
-- Run this once in the Supabase SQL Editor.

alter table orders add column if not exists collected_by text;
alter table orders add column if not exists collected_at timestamptz;
