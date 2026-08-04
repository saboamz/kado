-- 0002_enums.sql
--
-- Enums rather than text + check constraints. Two reasons that matter here:
-- adding a value later is `alter type ... add value` (no table rewrite, no
-- exclusive lock on a large table), and the generated TypeScript types come out
-- as real string unions instead of `string`, which is how we catch a typo'd
-- reservation state at compile time rather than in production.
--
-- Enum values are ordered deliberately: several of these represent a lifecycle
-- and Postgres orders enums by declaration, so `state < 'purchased'` sorts the
-- way a reader expects.

-- Who can see a list. `link` is deliberately distinct from `public`: a link list
-- is unlisted, not open — it is reachable only by presenting the share token,
-- and it must never appear in search or in a friend's feed.
create type public.visibility as enum ('private', 'friends', 'link', 'public');

-- Follow edges are directed and stored once per direction; friendship is the
-- mutual-accepted case (see public.is_friend). `blocked` lives here rather than
-- in a separate table so that a block and a follow cannot coexist for a pair.
create type public.follow_state as enum ('pending', 'accepted', 'blocked');

-- `fulfilled` is set BY THE OWNER when they have received the thing. It is not
-- set by a reservation or a purchase — a wish silently flipping to `fulfilled`
-- after a friend buys it would be the loudest possible leak.
create type public.wish_status as enum ('active', 'fulfilled', 'archived');

-- P5 types. Declared here so the whole vocabulary of the app is in one file and
-- so P5 is a pure `create table` migration.
-- `held` is a soft claim with an expiry; `purchased` is a hard claim.
create type public.reservation_state as enum ('held', 'purchased', 'released');

-- A pot is `funded` once contributions reach the target; `closed` once the
-- organiser has actually bought the gift; `refunded` if it collapses.
create type public.pot_state as enum ('open', 'funded', 'closed', 'refunded');

-- Mirrors the payment provider's lifecycle. `pending` means authorised but not
-- captured — we only capture when the pot funds, so a failed pot costs nobody.
create type public.contribution_state as enum ('pending', 'captured', 'refunded', 'failed');

-- Notification kinds. Note what is absent: there is no `wish_reserved`, no
-- `pot_contribution_received`, no `gift_purchased` addressed to an owner.
-- `pot_progress` and `pot_funded` go to CONTRIBUTORS only, never to the
-- recipient. The enum is the first place someone adding a feature will look, so
-- the omission is the documentation.
create type public.notif_kind as enum (
  'friend_request',
  'friend_accepted',
  'list_created',
  'wish_added',
  'birthday_soon',
  'pot_progress',
  'pot_funded',
  'reco_digest',
  'system'
);

-- Interaction events feeding the recommender (P6). These land in `reco`, never
-- in `public`, because `reserve`/`unreserve`/`purchase` identify both the actor
-- and the wish — an owner reading their own event stream would learn everything
-- the reservation table hides.
create type public.event_kind as enum (
  'view_product',
  'view_wish',
  'like_wish',
  'add_wish',
  'reserve',
  'unreserve',
  'purchase',
  'click_out',
  'contribute',
  'dismiss_reco'
);

-- Which algorithm produced a recommendation. Stored per candidate so we can A/B
-- strategies and so `manual` (editorial/ops picks) is auditable and separable
-- from model output.
create type public.reco_strategy as enum (
  'cf_item',
  'cf_user',
  'content_vector',
  'content_facet',
  'popularity',
  'onboarding',
  'manual'
);

comment on type public.visibility is
  'List audience. `link` is unlisted-with-token, deliberately not a weaker `public`.';
comment on type public.notif_kind is
  'Structured notification kinds. No owner-facing reservation or purchase kind exists, by design.';
comment on type public.event_kind is
  'Recommender interaction events. Reserve/purchase kinds are why reco tables live outside `public`.';
