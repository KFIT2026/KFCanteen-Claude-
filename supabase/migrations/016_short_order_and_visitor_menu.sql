-- Short Order (self-service, fixed daily menu) and Special Menu for Visitor
-- (Admin/Staff-Admin only, own inline checkout) tables.
-- Run this once in the Supabase SQL Editor.
--
-- Design: both mirror menu_items minus week_key/day, since these are fixed
-- lists that don't rotate by date. dish_id optionally links to a Manage
-- Dishes recipe so ordering deducts raw materials the same way linked
-- weekly-menu items already do. No new column is needed on orders for
-- per-item remarks or the source tag — orders.items is jsonb (remarks is
-- just an extra key per item) and orders.source already accepts free text
-- (used today for "otc"; this adds "short-order" and "visitor-menu").

create table if not exists short_order_items (
  id           text primary key,
  name         text not null,
  cat          text,
  price        numeric not null,
  img          text,
  is_photo     boolean not null default false,
  grams        numeric,
  serving_unit text not null default 'g' check (serving_unit in ('g','pcs','cup')),
  dish_id      text references dishes(id),
  available    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists visitor_menu_items (
  id           text primary key,
  name         text not null,
  cat          text,
  price        numeric not null,
  img          text,
  is_photo     boolean not null default false,
  grams        numeric,
  serving_unit text not null default 'g' check (serving_unit in ('g','pcs','cup')),
  dish_id      text references dishes(id),
  available    boolean not null default true,
  created_at   timestamptz not null default now()
);

alter publication supabase_realtime add table short_order_items;
alter publication supabase_realtime add table visitor_menu_items;
