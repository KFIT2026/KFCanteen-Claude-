-- Employees can cancel or move the plant of their own self-placed orders
-- (Weekly Menu / Short Order -- not OTC or Visitor Menu, which staff
-- already completed in person) within 2 hours of placing. Cancelled orders
-- are kept, not deleted, so they still show up in order history/records --
-- just labeled and timestamped.
--
-- Run this once in the Supabase SQL Editor.

alter table orders add column if not exists placed_at timestamptz;
alter table orders add column if not exists status text not null default 'active' check (status in ('active','cancelled'));
alter table orders add column if not exists cancelled_at timestamptz;

-- Backfill placed_at for existing rows from created_at so old orders don't
-- all read as "just placed" -- they're outside the 2-hour edit window
-- either way, but keeps the data honest for reporting.
update orders set placed_at = created_at where placed_at is null;
