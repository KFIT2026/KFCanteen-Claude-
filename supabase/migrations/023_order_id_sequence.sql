-- Order IDs were generated client-side as "highest KF number this browser
-- has seen, plus one." Two people placing orders around the same moment
-- could compute the same "next" id before either insert was visible to the
-- other -- the second insert then silently failed (orders.id is the
-- primary key), with no error shown and no rollback of the "Order placed!"
-- confirmation the person had already seen. This makes id assignment
-- atomic in Postgres via a sequence, so concurrent orders can never
-- collide, and the app now calls next_order_id() to get one before
-- inserting instead of computing it itself.
--
-- Run this once in the Supabase SQL Editor.

create sequence if not exists orders_id_seq;

-- Seed the sequence past every order id already in use, so numbering
-- continues from history instead of colliding with it.
select setval('orders_id_seq', greatest(22, (
  select coalesce(max(substring(id from 3)::int), 22) from orders
)));

create or replace function next_order_id() returns text as $$
  select 'KF' || lpad(nextval('orders_id_seq')::text, 6, '0');
$$ language sql;

grant execute on function next_order_id() to anon, authenticated;
