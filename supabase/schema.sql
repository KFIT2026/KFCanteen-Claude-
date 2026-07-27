-- KFCanteen database schema
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query -> paste -> Run)
--
-- SECURITY NOTE (read before running in a public-facing app):
-- Row Level Security (RLS) is left OFF below so the app's existing client-side
-- role checks keep working without a bigger auth rewrite. That means anyone who
-- has your anon key (which ships inside the public JS bundle, visible in
-- browser devtools) can read/write every table directly via the Supabase API,
-- including plaintext passwords and credit balances. That's an acceptable
-- starting point for an internal tool, but NOT safe once this is reachable
-- from the open internet with real people's data. Treat "add RLS policies /
-- move to Supabase Auth / hash passwords" as an immediate follow-up, not
-- optional polish.

-- ── USERS (employees + outside customers) ──
create table if not exists users (
  id            text primary key,
  username      text unique,
  password      text,                    -- plaintext for now — see security note above
  role          text not null default 'user' check (role in ('admin','staff-admin','staff','user')),
  name          text not null,
  avatar        text,
  plant         text,
  id_number     text,
  department    text,
  position      text,
  company       text,                    -- from HR export; distinct from plant, which admin assigns
  phone         text,
  email         text,
  credit_limit  numeric not null default 0,
  credit_balance numeric not null default 0,
  registered    boolean not null default false,
  is_employee   boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ── WEEKLY MENU ITEMS (keyed by traditional calendar week + weekday) ──
create table if not exists menu_items (
  id          text primary key,
  week_key    text not null,             -- e.g. "2026-30"
  day         text not null check (day in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday')),
  name        text not null,
  price       numeric not null,
  available   boolean not null default true,
  img         text,                      -- emoji, or base64 photo data URL
  is_photo    boolean not null default false,
  cat         text,                      -- BREAKFAST | LUNCH | SNACK
  grams       numeric,
  created_at  timestamptz not null default now()
);
create index if not exists idx_menu_items_week_day on menu_items(week_key, day);

-- ── OTHER PRODUCTS (snacks/drinks inventory) ──
create table if not exists other_products (
  id          text primary key,
  name        text not null,
  category    text,
  buy_price   numeric not null default 0,
  price       numeric not null,
  emoji       text,
  photo       text,
  is_photo    boolean not null default false,
  stock       integer not null default 0,
  available   boolean not null default true
);

-- ── ORDERS ──
create table if not exists orders (
  id            text primary key,        -- e.g. "KF000001"
  user_id       text references users(id),
  user_name     text not null,
  date          date not null,
  plant         text,
  items         jsonb not null,          -- [{name, qty, price, grams, buyPrice, scheduledDate}]
  total         numeric not null,
  payment_type  text check (payment_type in ('Cash','Credit')),  -- null = unpaid
  time          text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_orders_date on orders(date);
create index if not exists idx_orders_user on orders(user_id);

-- ── RECEIPTS (staff-admin purchase receipts) ──
create table if not exists receipts (
  id            text primary key,
  photo         text not null,           -- base64 data URL for now (see note below)
  date          date not null,
  amount        numeric,
  note          text,
  source        text check (source in ('Grocery','Supplier')),
  source_name   text,                    -- e.g. "SM Supermarket" or "ABC Meat Supplier"
  purchase_type text check (purchase_type in ('Raw Materials','Grocery')),
  uploaded_by   text,
  uploaded_at   text,
  created_at    timestamptz not null default now()
);
-- NOTE: storing photos as base64 text works but bloats the database fast.
-- Once this is live, moving receipt photos to Supabase Storage (a bucket)
-- and storing just the URL here is a worthwhile follow-up.

-- ── INVENTORY LOG (stock in/out history for other_products) ──
create table if not exists inventory_log (
  id          text primary key,
  product     text not null,
  emoji       text,
  type        text not null check (type in ('IN','OUT')),
  qty         integer not null,
  before      integer not null,
  after       integer not null,
  by          text,
  time        text,
  created_at  timestamptz not null default now()
);
