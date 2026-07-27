-- Adds a "source" field to receipts: where the supplies were purchased.
-- Run this once in the Supabase SQL Editor.
alter table receipts add column if not exists source text check (source in ('Grocery','Supplier'));
