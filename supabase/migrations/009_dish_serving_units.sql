-- Support per-piece / per-cup measurement for dishes, not just weight.
-- Run this once in the Supabase SQL Editor.
--
-- Design: dishes/menu_items keep the existing numeric "grams" column (holds
-- the serving size in whatever unit is chosen — literal grams, a piece
-- count, or a cup count) and gain a serving_unit column that says how to
-- interpret that number. All the excess-repurpose math in Close Canteen is
-- already a straight proportion (excess / serving_size * ingredient qty),
-- so it works identically regardless of unit — nothing there needs to
-- change, only labels/inputs. daily_menu_prep and dish_excess_decisions
-- columns are renamed from *_grams to *_qty since they're no longer
-- weight-specific, and dish_excess_decisions gets its own serving_unit
-- snapshot so the Waste Log still displays correctly even if a dish's
-- unit is changed or the dish itself is deleted later.

alter table dishes add column if not exists serving_unit text not null default 'g' check (serving_unit in ('g','pcs','cup'));
alter table menu_items add column if not exists serving_unit text not null default 'g' check (serving_unit in ('g','pcs','cup'));

alter table daily_menu_prep rename column prepared_grams to prepared_qty;
alter table dish_excess_decisions rename column excess_grams to excess_qty;
alter table dish_excess_decisions add column if not exists serving_unit text not null default 'g' check (serving_unit in ('g','pcs','cup'));
