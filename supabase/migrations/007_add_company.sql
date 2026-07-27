-- Adds a Company field to employee records, separate from Plant.
-- Company comes from the HR Excel export (COMPANY column) and is informational.
-- Plant is a separate, admin-assigned value (e.g. which physical canteen/site
-- an employee draws lunch from) and is NOT derived from Company.
-- Run this once in the Supabase SQL Editor.
alter table users add column if not exists company text;
