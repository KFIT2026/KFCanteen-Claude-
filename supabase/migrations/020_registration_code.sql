-- Registration code: a short system-generated code shown only to admins in
-- Personnel > Unregistered, which an employee must obtain from admin (in
-- person / by asking) and enter correctly to complete self-registration.
-- Closes the gap where anyone who knew/guessed a coworker's ID number could
-- register an account as them -- ID numbers turned out not to be a secret
-- either, so this is a value that's never displayed anywhere except to admin.
-- Run this once in the Supabase SQL Editor.

alter table users add column if not exists reg_code text;
