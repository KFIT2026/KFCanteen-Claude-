-- KFCanteen seed data — clean start
-- Run this AFTER schema.sql, in the same SQL Editor.
--
-- This creates ONE real admin account and nothing else. Products, menu
-- items, employees, orders, and receipts all start empty — add your real
-- people and catalog through the app itself (Personnel / Manage Products /
-- Manage Menu) once you're logged in.

insert into users (id, username, password, role, name, avatar, plant, id_number, phone, credit_limit, credit_balance, registered, is_employee) values
('u1', 'admin', 'Koufu@2026++', 'admin', 'Admin', 'AD', 'KF-Main', '', '', 0, 0, true, true)
on conflict (id) do nothing;
