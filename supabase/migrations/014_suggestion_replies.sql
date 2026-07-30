-- Back-and-forth reply threads on suggestions.
-- Run this once in the Supabase SQL Editor.
--
-- Design: the original suggestions.content stays the first message. Every
-- reply after that (from the submitter continuing the conversation, or an
-- admin/superadmin responding) is a row here, ordered by created_at.
--
-- Visibility (enforced client-side, same pattern as the existing suggestion
-- anonymization):
-- - Replies authored by admin/superadmin are shown as "Administrator" to
--   everyone except superadmin, who sees the real author_name.
-- - Replies authored by the original submitter are shown as "Anonymous" to
--   admin, the real author_name to superadmin, and "You" to the submitter
--   viewing their own thread.

create table if not exists suggestion_replies (
  id            text primary key,
  suggestion_id text not null references suggestions(id) on delete cascade,
  author_id     text not null,
  author_name   text not null,   -- snapshot, same rationale as suggestions.user_name
  author_role   text not null,
  content       text not null,
  created_at    timestamptz not null default now()
);
create index if not exists idx_suggestion_replies_suggestion on suggestion_replies(suggestion_id);
