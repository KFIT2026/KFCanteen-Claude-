-- Adds a free-text field for the specific store/supplier name
-- (e.g. "SM Supermarket" or "ABC Meat Supplier"), alongside the
-- existing Grocery/Supplier category.
-- Run this once in the Supabase SQL Editor.
alter table receipts add column if not exists source_name text;
