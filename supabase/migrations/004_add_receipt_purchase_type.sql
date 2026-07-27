-- Adds a "purchase_type" field to receipts: what the purchase was FOR
-- (Raw Materials for cooking dishes, vs Grocery for resale snacks/drinks).
-- Distinct from "source" (Grocery/Supplier), which tracks WHERE it was bought.
-- Run this once in the Supabase SQL Editor.
alter table receipts add column if not exists purchase_type text check (purchase_type in ('Raw Materials','Grocery'));
