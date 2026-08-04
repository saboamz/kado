-- seed.sql
--
-- Development seed, derived from the prototype fixtures in
--   src/data/fixtures.ts  (GIFTS, POT_TOTAL)
--   src/data/social.ts    (PEOPLE, INTERESTS, COLLECTIONS, BIRTHDAYS)
--
-- Every id below is a literal UUID rather than gen_random_uuid(). That is
-- deliberate: tests assert against these ids, the seed must produce byte-
-- identical output on every run, and re-seeding must be idempotent. Random ids
-- would mean tests that pass locally and fail in CI for no visible reason.
--
-- UUID convention, so a stray id in a log is identifiable at a glance:
--   1111...  profiles          4444...  categories
--   2222...  wishlists         5555...  tags
--   3333...  wish_items        6666...  merchants   7777...  products
--
-- Sophie Marchand (1111...0001) is the primary owner: the prototype UI copy
-- names her explicitly ("Sophie fête son anniversaire dans 12 jours"), so tests
-- that exercise the owner's own view should use her.
--
-- NOT SEEDED: reservations, pots, contributions. Those tables live in the
-- `private` schema and do not exist until P5. This file must not reference them.

begin;

-- ---------------------------------------------------------------------------
-- auth.users
-- ---------------------------------------------------------------------------
-- Profiles are created by the on_auth_user_created trigger, so we insert the
-- accounts first and then UPDATE the generated profile rows below rather than
-- inserting profiles directly. Seeding profiles directly would bypass the
-- trigger and let the seed drift from what real sign-up produces — which is
-- exactly the kind of divergence that hides a bug until production.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-000000000001', 'sophie@kado.test', '{"display_name":"Sophie Marchand"}'),
  ('11111111-1111-4111-8111-000000000002', 'thomas@kado.test', '{"display_name":"Thomas Bel"}'),
  ('11111111-1111-4111-8111-000000000003', 'emma@kado.test',   '{"display_name":"Emma Roux"}'),
  ('11111111-1111-4111-8111-000000000004', 'lucas@kado.test',  '{"display_name":"Lucas Ferrand"}'),
  ('11111111-1111-4111-8111-000000000005', 'paul@kado.test',   '{"display_name":"Paul Nguyen"}'),
  ('11111111-1111-4111-8111-000000000006', 'elise@kado.test',  '{"display_name":"Élise Fabre"}')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- Birthdays: Sophie's 14 March is fixed by the prototype copy ("anniversaire le
-- 14 mars" appears in both PROFILE_BIO and her PEOPLE meta). The others are
-- spread across the year so the birthday-reminder cron has something to find in
-- any month. Years are plausible adult birth years; the app never displays them.
update public.profiles p set
  handle       = v.handle,
  display_name = v.display_name,
  bio          = v.bio,
  birthday     = v.birthday,
  interests    = v.interests,
  onboarded_at = now() - interval '30 days'
from (values
  ('11111111-1111-4111-8111-000000000001'::uuid, 'sophie',  'Sophie Marchand',
   'Café filtre, céramique et randonnées. Anniversaire le 14 mars.',
   date '1992-03-14', array['Céramique','Café','Randonnée','Design']),
  ('11111111-1111-4111-8111-000000000002'::uuid, 'thomas',  'Thomas Bel',
   'Toujours une liste Maison en cours.',
   date '1990-06-08', array['Design','Café']),
  ('11111111-1111-4111-8111-000000000003'::uuid, 'emma',    'Emma Roux',
   'Mariage en préparation.',
   date '1994-09-02', array['Céramique','Design']),
  ('11111111-1111-4111-8111-000000000004'::uuid, 'lucas',   'Lucas Ferrand',
   'Geek assumé, listes trop longues.',
   date '1996-11-21', array['Randonnée']),
  ('11111111-1111-4111-8111-000000000005'::uuid, 'paul',    'Paul Nguyen',
   'Randonneur du dimanche.',
   date '1988-05-30', array['Randonnée','Café']),
  ('11111111-1111-4111-8111-000000000006'::uuid, 'elise',   'Élise Fabre',
   'La cagnotte MacBook, c''est moi.',
   date '1993-01-17', array['Design','Café'])
) as v(id, handle, display_name, bio, birthday, interests)
where p.id = v.id;

-- ---------------------------------------------------------------------------
-- follows
-- ---------------------------------------------------------------------------
-- Sophie is mutually friends with Thomas, Emma and Élise, so her friends-only
-- lists are readable by them and is_friend() has real data to exercise.
--
-- Lucas follows Sophie WITHOUT a return edge on purpose: he is the negative
-- case. is_friend(sophie, lucas) must be false, and any test that accidentally
-- starts passing for Lucas has broken the friendship check.
--
-- Paul is fully unconnected: the stranger case for RLS denial tests.
insert into public.follows (follower_id, followee_id, state, responded_at)
values
  -- Sophie <-> Thomas
  ('11111111-1111-4111-8111-000000000001','11111111-1111-4111-8111-000000000002','accepted', now()),
  ('11111111-1111-4111-8111-000000000002','11111111-1111-4111-8111-000000000001','accepted', now()),
  -- Sophie <-> Emma
  ('11111111-1111-4111-8111-000000000001','11111111-1111-4111-8111-000000000003','accepted', now()),
  ('11111111-1111-4111-8111-000000000003','11111111-1111-4111-8111-000000000001','accepted', now()),
  -- Sophie <-> Élise
  ('11111111-1111-4111-8111-000000000001','11111111-1111-4111-8111-000000000006','accepted', now()),
  ('11111111-1111-4111-8111-000000000006','11111111-1111-4111-8111-000000000001','accepted', now()),
  -- Thomas <-> Emma
  ('11111111-1111-4111-8111-000000000002','11111111-1111-4111-8111-000000000003','accepted', now()),
  ('11111111-1111-4111-8111-000000000003','11111111-1111-4111-8111-000000000002','accepted', now()),
  -- One-directional: NOT a friendship. Negative test fixture.
  ('11111111-1111-4111-8111-000000000004','11111111-1111-4111-8111-000000000001','accepted', now()),
  -- Pending inbound request for Sophie (the "Ajouter" badge in the UI).
  ('11111111-1111-4111-8111-000000000005','11111111-1111-4111-8111-000000000003','pending', null)
on conflict (follower_id, followee_id) do nothing;

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
-- Exactly the distinct `cat` values in GIFTS, plus 'Mode' so the tree has a
-- branch the fixtures do not use (a category with zero products is a real state
-- the UI must survive).
insert into public.categories (id, slug, label_fr, parent_id, sort)
values
  ('44444444-4444-4444-8444-000000000001','tech',   'Tech',   null, 1),
  ('44444444-4444-4444-8444-000000000002','maison', 'Maison', null, 2),
  ('44444444-4444-4444-8444-000000000003','voyage', 'Voyage', null, 3),
  ('44444444-4444-4444-8444-000000000004','sport',  'Sport',  null, 4),
  ('44444444-4444-4444-8444-000000000005','mode',   'Mode',   null, 5),
  -- One child, to prove the self-reference works and that the UI handles depth.
  ('44444444-4444-4444-8444-000000000006','audio',  'Audio',
   '44444444-4444-4444-8444-000000000001', 1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------
-- The INTERESTS array from social.ts, which is also what profiles.interests
-- holds. Slugs are unaccented so they are URL-safe ('ceramique', not
-- 'céramique').
insert into public.tags (id, slug, label_fr)
values
  ('55555555-5555-4555-8555-000000000001','ceramique','Céramique'),
  ('55555555-5555-4555-8555-000000000002','cafe',     'Café'),
  ('55555555-5555-4555-8555-000000000003','randonnee','Randonnée'),
  ('55555555-5555-4555-8555-000000000004','design',   'Design')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- merchants
-- ---------------------------------------------------------------------------
-- Derived from the `merchant` / `url` pairs in GIFTS. Domains are stored in
-- normalize_url form (no scheme, no www) so an ingested URL can be matched
-- against them directly.
--
-- 'Idée libre' from GIFTS g4 is NOT a merchant — it is the prototype's marker
-- for a wish with no product at all ("aucun lien"). Seeding it as a merchant
-- would invent a retailer that does not exist; g4 is seeded as a free-text wish
-- with product_id null instead, which is the case wish_items was designed for.
insert into public.merchants (id, slug, name, domains, affiliate_program)
values
  ('66666666-6666-4666-8666-000000000001','apple',      'Apple Store',  '{apple.com}',      null),
  ('66666666-6666-4666-8666-000000000002','la-brulerie','La Brûlerie',  '{labrulerie.fr}',  null),
  ('66666666-6666-4666-8666-000000000003','sessun',     'Sessùn',       '{sessun.com}',     null),
  ('66666666-6666-4666-8666-000000000004','decathlon',  'Décathlon',    '{decathlon.fr}',   'awin')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
-- The five GIFTS entries that have a real merchant URL. Prices go through
-- parse_price_fr on the ORIGINAL fixture strings rather than being hand-
-- converted to cents: that keeps the seed honest about the parser (if
-- parse_price_fr regresses on the NBSP in '1 599 €', this seed produces wrong
-- data and the tests catch it) and it documents where the numbers came from.
--
-- Note '1 599 €' below uses a REGULAR space, matching fixtures.ts. The narrow
-- NBSP variant is exercised in the test file.
insert into public.products
  (id, merchant_id, title, description, source_url, price_cents, currency, category_id, status)
values
  ('77777777-7777-4777-8777-000000000001','66666666-6666-4666-8666-000000000001',
   'AirPods Pro 3',
   'Réduction de bruit active. Taille d''embouts M, version USB-C de préférence.',
   'https://apple.com/fr/airpods-pro',
   public.parse_price_fr('279 €'), 'EUR',
   '44444444-4444-4444-8444-000000000006', 'active'),

  ('77777777-7777-4777-8777-000000000002','66666666-6666-4666-8666-000000000002',
   'Cafetière Chemex 6 tasses',
   'Modèle classique en verre, avec les filtres blancs si possible.',
   'https://labrulerie.fr/chemex-6',
   public.parse_price_fr('52 €'), 'EUR',
   '44444444-4444-4444-8444-000000000002', 'active'),

  ('77777777-7777-4777-8777-000000000003','66666666-6666-4666-8666-000000000001',
   'MacBook Air 15″ M4',
   'Pour remplacer le vieux modèle 2018. Couleur minuit, 16 Go de mémoire.',
   'https://apple.com/fr/macbook-air',
   public.parse_price_fr('1 599 €'), 'EUR',
   '44444444-4444-4444-8444-000000000001', 'active'),

  ('77777777-7777-4777-8777-000000000005','66666666-6666-4666-8666-000000000003',
   'Vase en grès émaillé',
   'Atelier français, teinte sable. Environ 25 cm de haut.',
   'https://sessun.com/vase-gres',
   public.parse_price_fr('68 €'), 'EUR',
   '44444444-4444-4444-8444-000000000002', 'active'),

  ('77777777-7777-4777-8777-000000000006','66666666-6666-4666-8666-000000000004',
   'Sac de randonnée 30 L',
   'Dos ventilé, coloris sombre. Pour les sorties à la journée.',
   'https://decathlon.fr/mh500-30l',
   public.parse_price_fr('135 €'), 'EUR',
   '44444444-4444-4444-8444-000000000004', 'active')
on conflict (id) do nothing;

-- Id ...004 is intentionally absent: GIFTS g4 ("Week-end en Islande") has no
-- product. The gap keeps the wish-to-product id mapping readable.

-- ---------------------------------------------------------------------------
-- product_tags
-- ---------------------------------------------------------------------------
-- Weight 1.0 = editorial/known-good. The reco pipeline writes lower weights.
insert into public.product_tags (product_id, tag_id, weight)
values
  ('77777777-7777-4777-8777-000000000001','55555555-5555-4555-8555-000000000004', 0.6),  -- AirPods / Design
  ('77777777-7777-4777-8777-000000000002','55555555-5555-4555-8555-000000000002', 1.0),  -- Chemex / Café
  ('77777777-7777-4777-8777-000000000002','55555555-5555-4555-8555-000000000004', 0.7),
  ('77777777-7777-4777-8777-000000000003','55555555-5555-4555-8555-000000000004', 0.5),
  ('77777777-7777-4777-8777-000000000005','55555555-5555-4555-8555-000000000001', 1.0),  -- Vase / Céramique
  ('77777777-7777-4777-8777-000000000005','55555555-5555-4555-8555-000000000004', 0.8),
  ('77777777-7777-4777-8777-000000000006','55555555-5555-4555-8555-000000000003', 1.0)   -- Sac / Randonnée
on conflict (product_id, tag_id) do nothing;

-- ---------------------------------------------------------------------------
-- wishlists
-- ---------------------------------------------------------------------------
-- The six COLLECTIONS from social.ts, all owned by Sophie (the prototype's
-- profile screen shows all six under one profile, and PROFILE_STATS says
-- "6 Listes").
--
-- 'Noël' is seeded deliberately EMPTY: COLLECTIONS marks it `to: 'empty'` and
-- "0 envie", and the empty-state screen needs a real list to render. Do not
-- "fix" it by adding wishes.
--
-- Visibility is varied on purpose so RLS tests have all three non-token cases:
-- friends (the default and most common), public, and private.
insert into public.wishlists
  (id, owner_id, title, slug, occasion, event_date, visibility, share_token)
values
  ('22222222-2222-4222-8222-000000000001','11111111-1111-4111-8111-000000000001',
   'Anniversaire','anniversaire','Anniversaire',
   -- Matches the prototype copy "dans 12 j". Relative to seed time so the
   -- countdown stays correct however long after seeding the app is opened.
   (current_date + 12), 'friends', null),

  ('22222222-2222-4222-8222-000000000002','11111111-1111-4111-8111-000000000001',
   'Maison','maison',null,null,'friends', null),

  ('22222222-2222-4222-8222-000000000003','11111111-1111-4111-8111-000000000001',
   'Voyage','voyage',null,null,'public', null),

  -- Empty by design; see note above.
  ('22222222-2222-4222-8222-000000000004','11111111-1111-4111-8111-000000000001',
   'Noël','noel','Noël',null,'friends', null),

  ('22222222-2222-4222-8222-000000000005','11111111-1111-4111-8111-000000000001',
   'Sport','sport',null,null,'private', null),

  -- The one 'link' list, so the token path is exercised. Token is a fixed
  -- literal ONLY because this is a dev seed; production tokens come from a
  -- CSPRNG and must never be predictable.
  ('22222222-2222-4222-8222-000000000006','11111111-1111-4111-8111-000000000001',
   'Geek','geek',null,null,'link','seed-link-token-geek-do-not-use-in-prod'),

  -- Élise's MacBook list: the collaborative-pot scenario from FEED and
  -- NOTIFICATIONS ("La cagnotte du MacBook d'Élise atteint 650 € sur 1 599 €").
  -- The pot ITSELF is P5 and is not seeded here; only the wish marked is_pot.
  ('22222222-2222-4222-8222-000000000007','11111111-1111-4111-8111-000000000006',
   'Ma liste','ma-liste',null,null,'friends', null),

  -- Emma's wedding list, from FEED ("Emma a créé une nouvelle liste : Mariage").
  ('22222222-2222-4222-8222-000000000008','11111111-1111-4111-8111-000000000003',
   'Mariage','mariage','Mariage',(current_date + 90),'friends', null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- wish_items
-- ---------------------------------------------------------------------------
-- The GIFTS array. owner_id is set to the parent list's owner, but note that
-- sync_wish_owner() overwrites whatever we supply — it is listed here only so
-- the NOT NULL column has a value at insert time; the trigger is the authority.
--
-- Prices are snapshotted from the fixture strings through parse_price_fr, the
-- same as products. In the real app the snapshot happens at add time, which is
-- why a wish carries its own price rather than reading the product's.
insert into public.wish_items
  (id, wishlist_id, owner_id, product_id, title, note, price_cents, currency,
   priority, quantity, status, is_pot, position)
values
  -- g1: AirPods Pro 3, prio 3
  ('33333333-3333-4333-8333-000000000001','22222222-2222-4222-8222-000000000001',
   '11111111-1111-4111-8111-000000000001','77777777-7777-4777-8777-000000000001',
   'AirPods Pro 3',
   'Réduction de bruit active. Taille d''embouts M, version USB-C de préférence.',
   public.parse_price_fr('279 €'),'EUR',3,1,'active',false,1),

  -- g2: Chemex, prio 2
  ('33333333-3333-4333-8333-000000000002','22222222-2222-4222-8222-000000000002',
   '11111111-1111-4111-8111-000000000001','77777777-7777-4777-8777-000000000002',
   'Cafetière Chemex 6 tasses',
   'Modèle classique en verre, avec les filtres blancs si possible.',
   public.parse_price_fr('52 €'),'EUR',2,1,'active',false,1),

  -- g3: MacBook Air, prio 3, pot:true. POT_TOTAL in fixtures.ts is 1599, which
  -- is this wish's price in euros — the pot target is the wish price.
  -- On Élise's list, matching the FEED copy about "la cagnotte du MacBook
  -- d'Élise". is_pot is the owner's INTENT only; no pot row exists until P5.
  ('33333333-3333-4333-8333-000000000003','22222222-2222-4222-8222-000000000007',
   '11111111-1111-4111-8111-000000000006','77777777-7777-4777-8777-000000000003',
   'MacBook Air 15″ M4',
   'Pour remplacer le vieux modèle 2018. Couleur minuit, 16 Go de mémoire.',
   public.parse_price_fr('1 599 €'),'EUR',3,1,'active',true,1),

  -- g4: Week-end en Islande, pot:true, NO PRODUCT. This is the free-text wish
  -- case: product_id null, and pot_needs_price is satisfied by the wish's own
  -- price rather than a catalogue price.
  ('33333333-3333-4333-8333-000000000004','22222222-2222-4222-8222-000000000003',
   '11111111-1111-4111-8111-000000000001', null,
   'Week-end en Islande',
   'Trois nuits près de Reykjavík, plutôt en février pour les aurores.',
   public.parse_price_fr('1 240 €'),'EUR',2,1,'active',true,1),

  -- g5: Vase, prio 1
  ('33333333-3333-4333-8333-000000000005','22222222-2222-4222-8222-000000000002',
   '11111111-1111-4111-8111-000000000001','77777777-7777-4777-8777-000000000005',
   'Vase en grès émaillé',
   'Atelier français, teinte sable. Environ 25 cm de haut.',
   public.parse_price_fr('68 €'),'EUR',1,1,'active',false,2),

  -- g6: Sac de randonnée, prio 2. On the 'private' Sport list, so it doubles as
  -- the fixture for "even a friend must not see this".
  ('33333333-3333-4333-8333-000000000006','22222222-2222-4222-8222-000000000005',
   '11111111-1111-4111-8111-000000000001','77777777-7777-4777-8777-000000000006',
   'Sac de randonnée 30 L',
   'Dos ventilé, coloris sombre. Pour les sorties à la journée.',
   public.parse_price_fr('135 €'),'EUR',2,1,'active',false,1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
-- Structured only: kind + payload. Compare against the NOTIFICATIONS array in
-- social.ts, which stores rendered French sentences — that is a prototype
-- shortcut, and reproducing it in the database is exactly what 0007 forbids.
-- The client renders these from a template map keyed on `kind`.
--
-- Note what is NOT here and cannot be: any notification telling Sophie that one
-- of her wishes was reserved. There is no kind for it.
insert into public.notifications
  (id, recipient_id, kind, actor_id, subject_type, subject_id, payload, read_at)
values
  -- "Emma a créé une liste Noël."
  ('88888888-8888-4888-8888-000000000001','11111111-1111-4111-8111-000000000001',
   'list_created','11111111-1111-4111-8111-000000000003',
   'wishlist','22222222-2222-4222-8222-000000000008',
   '{"list_title":"Mariage"}'::jsonb, null),

  -- "Lucas vient d'ajouter 5 envies à sa liste Geek."
  ('88888888-8888-4888-8888-000000000002','11111111-1111-4111-8111-000000000001',
   'wish_added','11111111-1111-4111-8111-000000000004',
   'wishlist','22222222-2222-4222-8222-000000000006',
   '{"list_title":"Geek","wish_count":5}'::jsonb, null),

  -- "Paul fête son anniversaire dans 6 jours."
  ('88888888-8888-4888-8888-000000000003','11111111-1111-4111-8111-000000000001',
   'birthday_soon','11111111-1111-4111-8111-000000000005',
   'profile','11111111-1111-4111-8111-000000000005',
   '{"days_until":6}'::jsonb, now() - interval '1 day'),

  -- Pot progress, addressed to a CONTRIBUTOR (Thomas), never to Élise, who is
  -- the person the MacBook is for. This asymmetry is the whole product rule.
  ('88888888-8888-4888-8888-000000000004','11111111-1111-4111-8111-000000000002',
   'pot_progress', null,
   'pot', null,
   '{"pct":41,"remaining_cents":94900}'::jsonb, null),

  -- Inbound friend request (Paul -> Emma).
  ('88888888-8888-4888-8888-000000000005','11111111-1111-4111-8111-000000000003',
   'friend_request','11111111-1111-4111-8111-000000000005',
   'follow', null, '{}'::jsonb, null)
on conflict (id) do nothing;

commit;
