-- Raw materials inventory + dish recipes.
-- Run this once in the Supabase SQL Editor.
--
-- Design: dishes are reusable recipe templates, decoupled from the weekly
-- menu_items (which are recreated per week/day). A menu_item can optionally
-- link to a dish via dish_id — if linked, placing an order automatically
-- deducts the recipe's raw materials, same way "other_products" stock
-- already deducts today. Menu items with no dish_id keep working exactly
-- as before (no raw material tracking) — this is additive, not a breaking
-- change.

create table if not exists raw_materials (
  id          text primary key,
  name        text not null,
  unit        text not null default 'pcs',   -- kg, g, L, ml, pcs
  stock       numeric not null default 0,
  buy_price   numeric not null default 0,     -- cost per unit
  created_at  timestamptz not null default now()
);

create table if not exists dishes (
  id          text primary key,
  name        text not null,
  cat         text,                           -- BREAKFAST | LUNCH | SNACK
  price       numeric not null,
  img         text,
  is_photo    boolean not null default false,
  grams       numeric,
  created_at  timestamptz not null default now()
);

create table if not exists dish_ingredients (
  id                text primary key,
  dish_id           text not null references dishes(id) on delete cascade,
  raw_material_id   text not null references raw_materials(id) on delete cascade,
  quantity          numeric not null           -- amount of raw material per single serving
);
create index if not exists idx_dish_ingredients_dish on dish_ingredients(dish_id);

alter table menu_items add column if not exists dish_id text references dishes(id);

create table if not exists raw_material_log (
  id            text primary key,
  raw_material  text not null,
  unit          text,
  type          text not null check (type in ('IN','OUT')),
  qty           numeric not null,
  before        numeric not null,
  after         numeric not null,
  by            text,
  time          text,
  created_at    timestamptz not null default now()
);
