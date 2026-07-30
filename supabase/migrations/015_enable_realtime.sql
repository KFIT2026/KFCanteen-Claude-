-- Enable Supabase Realtime so the app updates instantly across every open
-- session when data changes (orders, suggestions, inventory, etc.) instead
-- of only refreshing on a manual page reload.
-- Run this once in the Supabase SQL Editor.
--
-- This adds each table to the `supabase_realtime` publication, which is
-- what lets the client subscribe to postgres_changes events on it. If a
-- table is already in the publication (e.g. you enabled it by hand in the
-- Table Editor UI first), its ADD TABLE line below will error — just
-- delete that one line and re-run.

alter publication supabase_realtime add table users;
alter publication supabase_realtime add table menu_items;
alter publication supabase_realtime add table other_products;
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table receipts;
alter publication supabase_realtime add table inventory_log;
alter publication supabase_realtime add table raw_materials;
alter publication supabase_realtime add table dishes;
alter publication supabase_realtime add table dish_ingredients;
alter publication supabase_realtime add table raw_material_log;
alter publication supabase_realtime add table plant_closes;
alter publication supabase_realtime add table dish_excess_decisions;
alter publication supabase_realtime add table suggestions;
alter publication supabase_realtime add table suggestion_replies;
