-- Adds Department and Position fields to employee records, to match
-- the real HR spreadsheet columns (SECTION/DEPT., POSITION).
-- Run this once in the Supabase SQL Editor.
alter table users add column if not exists department text;
alter table users add column if not exists position text;
