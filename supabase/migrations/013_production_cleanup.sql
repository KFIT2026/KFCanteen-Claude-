-- Production cleanup: wipe all demo/seed data and leave a single fresh admin account.
-- Run this ONCE in the Supabase SQL Editor when you're ready to go live.
-- This is IRREVERSIBLE -- it deletes every order, user, menu item, dish,
-- raw material, product, receipt, and log row currently in the database.
--
-- Deletes run in FK-safe order (children before parents).

delete from dish_ingredients;
delete from daily_menu_prep;
delete from dish_excess_decisions;
delete from suggestions;
delete from orders;
delete from raw_material_log;
delete from inventory_log;
delete from receipts;
delete from plant_closes;
delete from menu_items;
delete from dishes;
delete from raw_materials;
delete from other_products;
delete from users;

-- Single production admin account. CHANGE THIS PASSWORD after first login --
-- it's stored in plaintext (see the security note at the top of schema.sql),
-- so treat it as temporary.
insert into users (
  id, username, password, role, name, avatar, plant,
  credit_limit, credit_balance, registered, is_employee
) values (
  'u-admin-prod-1',
  'kfadmin_a82qfd',
  'wb%ho%tdgQXjqfv%Un*2',
  'admin',
  'Administrator',
  'AD',
  'KF-Main',
  0, 0, true, true
);
