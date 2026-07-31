-- The orders.source check constraint (added in 012_over_the_counter_orders.sql)
-- only allowed 'app' and 'otc', so it silently rejected every order placed
-- through the new Short Order and Visitor Menu tabs — the app's own
-- fire-and-forget insert calls failed against this constraint while the UI
-- still showed "order placed" from local state. Widen it to also allow the
-- two new source tags.
-- Run this once in the Supabase SQL Editor.

alter table orders drop constraint if exists orders_source_check;
alter table orders add constraint orders_source_check check (source in ('app','otc','short-order','visitor-menu'));
