-- Optional size/price variants for Short Order items only (Visitor Menu
-- stays single-price/fixed, per explicit product decision).
-- Run this once in the Supabase SQL Editor.
--
-- Design: sizes is a jsonb array of {label, price}. Empty/null means the
-- item behaves exactly as before (flat item.price, no size selection
-- required). When sizes is non-empty, the customer must pick one before
-- adding to cart, and that size's price is what's actually charged --
-- item.price is kept in sync to the cheapest size purely so existing
-- code that reads price for display/sort has a sensible "starting from"
-- number.

alter table short_order_items add column if not exists sizes jsonb not null default '[]'::jsonb;
