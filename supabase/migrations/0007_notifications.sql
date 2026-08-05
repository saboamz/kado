-- 0007_notifications.sql
--
-- Structured notifications. The shape of this table is a secrecy control, not
-- just a schema preference — see the block comment below.

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),

  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind         public.notif_kind not null,

  -- Who caused it. Null for system/digest notifications with no human actor.
  actor_id     uuid references public.profiles (id) on delete set null,

  -- Polymorphic target. Not a foreign key: the subject may live in `private`
  -- (a pot), and a real FK from a `public` table to a `private` one would leak
  -- existence through constraint violations and through pg_depend, which is
  -- readable by anyone. Referential integrity here is deliberately traded away
  -- for non-disclosure.
  subject_type text check (subject_type is null or subject_type in
                 ('profile', 'wishlist', 'wish_item', 'pot', 'follow')),
  subject_id   uuid,

  -- Structured parameters for the client-side template, e.g.
  --   {"list_title": "Noël", "wish_count": 4}
  --   {"days_until": 12}
  -- Never a rendered sentence.
  payload      jsonb not null default '{}'::jsonb,

  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- ===========================================================================
--  WHY THERE IS NO `message` / `body` / `text` COLUMN
--  =========================================================================
--
--  A free-text notification column is the easiest way to leak a reservation,
--  and it leaks it in the one place the user is guaranteed to look.
--
--  The moment the schema can hold an arbitrary sentence addressed to a user,
--  the secrecy rule stops being a database property and becomes a code-review
--  property: every future writer — a new feature, a batch job, an admin tool,
--  a well-meaning "let's tell Sophie her pot is nearly funded!" — is one
--  string interpolation away from delivering "Thomas a réservé ton cadeau" to
--  the person who must never learn it. Nothing in the database can inspect
--  that string and stop it.
--
--  So notifications are STRUCTURED: a `kind` from a closed enum, plus a
--  `payload` of parameters. The client owns a template map from kind to French
--  copy and renders it locally.
--
--  What that buys, concretely:
--
--    * The set of sentences the system can ever produce is finite, reviewable,
--      and lives in one file. "Someone reserved X" is not in the enum, so it
--      is not expressible — a writer would have to add an enum value in a
--      migration, which is exactly the visible, reviewable act we want.
--    * The notification fan-out for reservations simply does not exist. P5's
--      pot notifications (`pot_progress`, `pot_funded`) are addressed to
--      CONTRIBUTORS, never to the recipient of the gift, and because they carry
--      no prose there is no path by which a mis-targeted row becomes a
--      readable sentence — a leaked row is `{"pct": 41}`, not an explanation.
--    * Copy changes ship with the client instead of requiring a data migration,
--      and localisation is free.
--
--  If you need to say something new, add a `notif_kind`. Do not add a column.
-- ===========================================================================

comment on table public.notifications is
  'Structured notifications: closed-enum kind + payload params, rendered client-side. Deliberately has NO free-text message column — see the block comment in 0007_notifications.sql; prose is the leak vector.';
comment on column public.notifications.kind is
  'Closed enum. The set of sentences the system can produce is exactly this set; "someone reserved X" is not expressible without a reviewable migration.';
comment on column public.notifications.payload is
  'Template parameters only, never a rendered sentence. A leaked row must read as {"pct":41}, not as an explanation.';
comment on column public.notifications.subject_type is
  'Polymorphic and intentionally NOT a foreign key: a real FK from public to a `private` subject (a pot) would leak its existence via constraint errors and pg_depend.';

-- The notification bell: unread first, newest first. Partial so the index stays
-- small — read notifications are the overwhelming majority over time and are
-- only ever fetched by explicit pagination.
create index notifications_unread_idx
  on public.notifications (recipient_id, created_at desc)
  where read_at is null;

-- Full history pagination.
create index notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);
