-- 0004_identity.sql
--
-- Profiles and the follow graph.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- One row per auth.users row, always. The PK *is* auth.users.id rather than an
-- independent surrogate key: it makes every RLS policy in this schema a direct
-- `= (select auth.uid())` comparison with no join, and it makes it structurally
-- impossible to have two profiles for one account.
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,

  -- citext so that @Sophie and @sophie are the same person and cannot both be
  -- registered. The check pins the alphabet: lowercase alphanumerics and
  -- underscore only. No dots (they read as file extensions in URLs), no
  -- hyphens (confusable with the en-dashes French keyboards produce), and a
  -- 3-char floor so the short vanity handles stay reservable for us.
  handle              extensions.citext not null unique
                      check (handle ~ '^[a-z0-9_]{3,24}$'),

  display_name        text not null check (char_length(display_name) between 1 and 60),

  -- 280 chars: same budget as a tweet, which is enough for "Café filtre,
  -- céramique et randonnées" and short enough to render in a card without
  -- truncation logic.
  bio                 text check (char_length(bio) <= 280),
  avatar_url          text,

  -- Birthday drives the single most valuable notification in the product
  -- ("Sophie fête son anniversaire dans 12 jours"), so it is a real date, not a
  -- string. Year is stored when known but is never displayed by default —
  -- people share the day, not the age.
  birthday            date,
  birthday_visibility public.visibility not null default 'friends',

  locale              text not null default 'fr-FR',

  -- Money is integer cents + a currency code everywhere in this schema. This is
  -- the user's display preference; a wish's own currency wins over it.
  currency            char(3) not null default 'EUR',

  -- Free-text interests captured at onboarding ("Céramique", "Café",
  -- "Randonnée", "Design"). Denormalised as an array rather than a join table
  -- because it is written once, read on every reco call, and never queried
  -- relationally. The curated, joinable version is public.tags.
  interests           text[] not null default '{}',

  -- Null until onboarding completes. The client routes to the onboarding flow
  -- on null, so this is load-bearing, not analytics.
  onboarded_at        timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.profiles is
  'Public identity, 1:1 with auth.users. PK is the auth uid so every RLS predicate is a join-free comparison.';
comment on column public.profiles.handle is
  'citext + strict alphabet: case-variant handles must not be separately registrable (impersonation vector).';
comment on column public.profiles.birthday_visibility is
  'Separate from list visibility: people share lists more widely than they share their date of birth.';
comment on column public.profiles.interests is
  'Denormalised onboarding interests. Array because it is read on every reco call and never joined; public.tags is the relational version.';
comment on column public.profiles.onboarded_at is
  'Null routes the client into onboarding. Behavioural, not analytical.';

-- Trigram indexes for people search ("sop" -> Sophie). Trigram rather than
-- tsvector because handles and names are single tokens with typos, not prose,
-- and prefix/substring matching is what the search UI actually does.
create index profiles_handle_trgm_idx
  on public.profiles using gin (handle extensions.gin_trgm_ops);
create index profiles_display_name_trgm_idx
  on public.profiles using gin (display_name extensions.gin_trgm_ops);

-- Birthday reminders scan "whose birthday falls in the next N days", which is a
-- month/day question, not a date question — the stored year is the birth year,
-- so a plain btree on `birthday` is useless for it. Expression index on
-- (month, day) makes the nightly cron job an index scan instead of a seq scan
-- over every profile in the system.
create index profiles_birthday_md_idx
  on public.profiles (
    (extract(month from birthday)),
    (extract(day from birthday))
  )
  where birthday is not null;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- auth.users -> profiles
-- ---------------------------------------------------------------------------
-- Every session must have a profile. If profile creation were done by the
-- client after sign-up, any interruption between "account created" and "profile
-- inserted" would leave a logged-in user with no profile row — and every RLS
-- policy and every join in the app would then behave as though they did not
-- exist. Doing it in a trigger makes it transactional with the account itself.
--
-- The generated handle must be unique on the first try, because a failure here
-- fails the whole sign-up. We derive from the email local-part, strip it to the
-- legal alphabet, pad it to the 3-char minimum, and append a random suffix on
-- collision. The user renames it during onboarding.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base      text;
  candidate text;
  n         integer := 0;
begin
  base := regexp_replace(
            lower(coalesce(split_part(new.email, '@', 1), 'kado')),
            '[^a-z0-9_]', '', 'g'
          );
  base := substring(base from 1 for 16);
  if char_length(base) < 3 then
    base := base || 'kado';
    base := substring(base from 1 for 16);
  end if;

  candidate := base;
  -- Bounded retry, then fall back to something that cannot collide.
  while exists (select 1 from public.profiles p where p.handle = candidate) and n < 5 loop
    n := n + 1;
    candidate := substring(base from 1 for 16) || floor(random() * 10000)::int::text;
  end loop;
  if exists (select 1 from public.profiles p where p.handle = candidate) then
    candidate := 'k' || replace(new.id::text, '-', '');
    candidate := substring(candidate from 1 for 24);
  end if;

  insert into public.profiles (id, handle, display_name)
  values (
    new.id,
    candidate,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, 'Invité'), '@', 1)
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates the profile inside the same transaction as the account. A session without a profile would silently fail every RLS predicate and join in the app.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- follows
-- ---------------------------------------------------------------------------
-- Directed edges. Friendship = both directions present and accepted. Modelling
-- it this way (rather than a single undirected row with an ordered pair) keeps
-- "request sent" and "request received" distinguishable, which the UI needs,
-- and lets one side block without consulting the other's row.
create table public.follows (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  followee_id  uuid not null references public.profiles (id) on delete cascade,
  state        public.follow_state not null default 'pending',
  created_at   timestamptz not null default now(),

  -- When the followee acted on it. Null while pending; used to expire stale
  -- requests and to rate-limit re-requests after a decline.
  responded_at timestamptz,

  primary key (follower_id, followee_id),
  constraint no_self_follow check (follower_id <> followee_id)
);

comment on table public.follows is
  'Directed follow edges; friendship is the mutual-accepted case. Directed rather than undirected so "sent" vs "received" stays distinguishable and either side can block unilaterally.';
comment on column public.follows.responded_at is
  'Null while pending. Drives request expiry and re-request rate limiting after a decline.';

-- Both directions, filtered to accepted. is_friend() self-joins this table on
-- every list read, so these two partial indexes are what keep RLS cheap: the
-- planner gets an index-only lookup on each side of the join and never touches
-- pending or blocked rows.
create index follows_follower_accepted_idx
  on public.follows (follower_id, followee_id)
  where state = 'accepted';
create index follows_followee_accepted_idx
  on public.follows (followee_id, follower_id)
  where state = 'accepted';

-- Inbound request inbox: "who is waiting on me".
create index follows_pending_inbox_idx
  on public.follows (followee_id, created_at desc)
  where state = 'pending';

-- ---------------------------------------------------------------------------
-- is_friend (see the placement note in 0003_helpers.sql)
-- ---------------------------------------------------------------------------
-- STABLE, not VOLATILE: a VOLATILE function in an RLS predicate is re-evaluated
-- per candidate row, so reading a friend's 40-item list would run 40 follow
-- lookups and feed queries would degrade quadratically. STABLE lets the planner
-- treat it as constant within the statement for fixed arguments.
--
-- SECURITY DEFINER: the caller cannot SELECT the other party's follow rows
-- under the follows RLS policy, so without DEFINER this returns false and
-- friends' lists render empty.
create or replace function public.is_friend(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.follows f1
    join public.follows f2
      on f2.follower_id = f1.followee_id
     and f2.followee_id = f1.follower_id
    where f1.follower_id = a
      and f1.followee_id = b
      and f1.state = 'accepted'
      and f2.state = 'accepted'
  )
$$;

comment on function public.is_friend(uuid, uuid) is
  'Mutual accepted follow. STABLE on purpose: a VOLATILE function in an RLS predicate re-runs per row and turns list reads quadratic. SECURITY DEFINER because the caller cannot SELECT the other party''s follow rows.';

revoke all on function public.is_friend(uuid, uuid) from public;
grant execute on function public.is_friend(uuid, uuid) to authenticated, service_role;
