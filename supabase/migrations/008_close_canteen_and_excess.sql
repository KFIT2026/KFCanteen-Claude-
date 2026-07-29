-- Close Canteen (end-of-day per plant) + excess repurpose/waste tracking.
-- Run this once in the Supabase SQL Editor.
--
-- Design:
-- - daily_menu_prep: how much of a dish (by weight, grams) staff prepared
--   for a given plant+date+menu item. Compared against that day's sold
--   weight (computed from orders, not stored) to get excess.
-- - plant_closes: marks a plant+date as closed for the day. Reversible via
--   reopened_at — reopening does not undo repurpose/waste decisions already
--   made, it just unlocks the close state so staff can act again.
-- - dish_excess_decisions: one row per excess dish per close, recording
--   whether staff chose to repurpose it into raw materials or waste it.
--   This is also the source for the Raw Materials "Waste" log tab.
-- - raw_materials.excess_stock: a separate bucket from the purchased
--   `stock` column. Repurposed excess adds here, not to `stock`, so it
--   doesn't inflate Total Stock Value (which is stock * buy_price) with
--   quantity that was never actually purchased. It's still real, usable
--   stock for future dish prep — just tracked distinctly.
-- - raw_material_log gains `source` + `note` so excess-origin log entries
--   are traceable ("Excess from Tinola with Rice · Jul 29 · KF-Main")
--   separately from ordinary purchase/consumption entries.

create table if not exists daily_menu_prep (
  id              text primary key,
  plant           text not null,
  date            text not null,           -- YYYY-MM-DD
  menu_item_id    text not null references menu_items(id) on delete cascade,
  prepared_grams  numeric not null default 0,
  updated_by      text,
  updated_at      timestamptz not null default now(),
  unique (plant, date, menu_item_id)
);

create table if not exists plant_closes (
  id            text primary key,
  plant         text not null,
  date          text not null,             -- YYYY-MM-DD
  closed_by     text,
  closed_at     timestamptz not null default now(),
  reopened_by   text,
  reopened_at   timestamptz,
  unique (plant, date)
);

create table if not exists dish_excess_decisions (
  id                text primary key,
  plant             text not null,
  date              text not null,
  menu_item_id      text references menu_items(id) on delete set null,
  dish_name         text not null,         -- snapshot, survives menu item edits/deletes
  excess_grams      numeric not null,
  decision          text not null check (decision in ('repurpose','waste')),
  decided_by        text,
  decided_at        timestamptz not null default now()
);
create index if not exists idx_dish_excess_plant_date on dish_excess_decisions(plant, date);

alter table raw_materials add column if not exists excess_stock numeric not null default 0;

alter table raw_material_log add column if not exists source text default 'purchase' check (source in ('purchase','consumption','excess'));
alter table raw_material_log add column if not exists note text;
