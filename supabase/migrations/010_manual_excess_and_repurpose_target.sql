-- Close Canteen: excess is now logged manually by staff at closing time
-- (a physical count) instead of computed from a daily prepared-quantity
-- entry, and repurposing now records WHERE the excess went — either into
-- Raw Materials (proportional ingredient breakdown, as before) or into
-- another dish (a logged transformation only, no inventory recalculation
-- since there's no "prepared stock" concept for dishes anymore).
--
-- Run this once in the Supabase SQL Editor.

alter table dish_excess_decisions add column if not exists repurpose_target_type text check (repurpose_target_type in ('raw_materials','dish'));
alter table dish_excess_decisions add column if not exists repurpose_target_id text;
alter table dish_excess_decisions add column if not exists repurpose_target_name text;

-- daily_menu_prep is no longer used by the app (excess is now a manual
-- entry at close time, not prepared-minus-sold) but is left in place
-- rather than dropped, in case you want the historical record.
