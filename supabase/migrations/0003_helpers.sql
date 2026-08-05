-- 0003_helpers.sql
--
-- Pure helper functions. Every one of them sets `search_path = ''` and calls
-- everything fully qualified.
--
-- That is not cargo cult. Two of these functions are used in GENERATED ALWAYS
-- columns on public.products, and Postgres refuses to build a generated column
-- from a function whose behaviour could depend on a session setting. More
-- practically: a function with a mutable search_path is a privilege-escalation
-- primitive the moment anything calls it as SECURITY DEFINER, because the
-- caller controls which schema `digest` resolves to.

-- ---------------------------------------------------------------------------
-- unaccent wrapper
-- ---------------------------------------------------------------------------
-- extensions.unaccent(text) is STABLE, not IMMUTABLE, because it reads the
-- `unaccent` dictionary, which could in principle be redefined. That makes it
-- unusable in a generated column or a functional index.
--
-- The two-argument form unaccent(regdictionary, text) IS immutable, because the
-- dictionary is named explicitly. We wrap that form and re-declare the wrapper
-- immutable. This is the standard workaround and it is sound as long as nobody
-- redefines the `unaccent` dictionary — if someone does, reindex.
create or replace function public.immutable_unaccent(t text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, t)
$$;

comment on function public.immutable_unaccent(text) is
  'IMMUTABLE unaccent. The 1-arg extensions.unaccent is only STABLE and cannot be used in generated columns or functional indexes.';

-- ---------------------------------------------------------------------------
-- normalize_url
-- ---------------------------------------------------------------------------
-- Product deduplication turns entirely on this function. The same physical
-- product arrives from a share sheet, a browser extension and an affiliate feed
-- with three different URLs that differ only in tracking noise. If we do not
-- collapse them, one product becomes three catalogue rows, and the recommender
-- splits its signal three ways.
--
-- Rules, in order:
--   * lowercase (hostnames are case-insensitive; paths technically are not, but
--     merchant slugs are lowercase in practice and case-sensitivity here costs
--     us far more duplicates than it saves)
--   * drop scheme (http vs https is not a different product)
--   * drop a leading `www.`
--   * drop the #fragment (client-side anchors, never identity)
--   * drop tracking query params by prefix/name
--   * SORT the surviving params, so ?color=noir&size=m and ?size=m&color=noir
--     hash identically. Without the sort the whole exercise is pointless.
--   * strip trailing slashes
--
-- IMMUTABLE and used in a generated column, so it must never depend on locale
-- or session state. `lower()` is locale-dependent in theory; for ASCII URL text
-- it is not in practice, and Postgres accepts it as immutable.
create or replace function public.normalize_url(raw text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  work    text;
  base    text;
  qs      text;
  kept    text;
begin
  if raw is null then
    return null;
  end if;

  work := lower(btrim(raw));
  if work = '' then
    return null;
  end if;

  -- Scheme. Also tolerates protocol-relative //host/path.
  work := regexp_replace(work, '^[a-z][a-z0-9+.-]*://', '');
  work := regexp_replace(work, '^//', '');

  -- Fragment. Done before query splitting so that a #frag containing a '?'
  -- cannot fool the split.
  work := split_part(work, '#', 1);

  -- Leading www.
  work := regexp_replace(work, '^www\.', '');

  -- Split off the query string.
  base := split_part(work, '?', 1);
  qs   := nullif(substring(work from position('?' in work) + 1), work);
  if position('?' in work) = 0 then
    qs := null;
  end if;

  -- Trailing slashes (and a trailing slash left behind by an empty path).
  base := regexp_replace(base, '/+$', '');

  if qs is null or qs = '' then
    return nullif(base, '');
  end if;

  -- Drop tracking params, keep the rest, sorted by the full "k=v" text so the
  -- ordering is total and stable even for repeated keys.
  select string_agg(p, '&' order by p)
    into kept
  from (
    select param as p
    from unnest(string_to_array(qs, '&')) as param
    where param <> ''
      and split_part(param, '=', 1) !~
          -- Prefix-matched families (these genuinely are namespaces):
          --   utm_*, mc_* (Mailchimp), _branch*
          -- and exact-matched individual params. The distinction matters:
          -- a bare `^ref` prefix also eats `refresh`, `reference`,
          -- `refurbished` and `ref_page`, which are real product params on
          -- real merchant sites. Anchor the exact ones with $.
          '^(utm_|mc_|_branch)|^(gclid|fbclid|ref|referrer|source|igshid|srsltid|th|psc)$'
  ) survivors;

  if kept is null or kept = '' then
    return nullif(base, '');
  end if;

  return nullif(base, '') || '?' || kept;
end;
$$;

comment on function public.normalize_url(text) is
  'Canonical URL form for product dedup: scheme/www/fragment/tracking-params removed, remaining params sorted. Sorting is the point — unsorted params defeat the hash.';

-- ---------------------------------------------------------------------------
-- title_key
-- ---------------------------------------------------------------------------
-- Second dedup axis, for merchants whose URLs are unstable (session ids in the
-- path, regional redirects). Within one merchant, a normalised title is a good
-- enough identity.
--
-- unaccent is not optional for a French catalogue: "Cafetière Chemex" typed by
-- a user and "Cafetiere Chemex" scraped from a feed must land on the same key,
-- and so must "Sessùn" / "Sessun".
create or replace function public.title_key(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      lower(public.immutable_unaccent(coalesce(t, ''))),
      '[^a-z0-9]+',
      '',
      'g'
    ),
    ''
  )
$$;

comment on function public.title_key(text) is
  'Merchant-scoped title identity: unaccented, lowercased, alphanumerics only. French accents must not fork the catalogue.';

-- ---------------------------------------------------------------------------
-- price_band
-- ---------------------------------------------------------------------------
-- Coarse price bucket, stored generated on products and used for faceting and
-- as a recommender feature. Bucketing rather than raw price because a filter on
-- "around 50 euros" should not thrash the index every time a merchant moves a
-- price by 2 cents, and because band is stable enough to key a cached candidate
-- set on.
--
-- Band 0 means "price unknown", deliberately distinct from band 1 ("cheap") —
-- an unpriced free-text wish is not a cheap wish.
create or replace function public.price_band(cents integer)
returns smallint
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when cents is null    then 0::smallint  -- unknown
    when cents < 2000     then 1::smallint  -- < 20 EUR
    when cents < 5000     then 2::smallint  -- < 50 EUR
    when cents < 10000    then 3::smallint  -- < 100 EUR
    when cents < 20000    then 4::smallint  -- < 200 EUR
    when cents < 50000    then 5::smallint  -- < 500 EUR
    when cents < 100000   then 6::smallint  -- < 1000 EUR
    else                       7::smallint  -- >= 1000 EUR
  end
$$;

comment on function public.price_band(integer) is
  'Price bucket 0-7 in cents thresholds. Band 0 is "unknown", not "free" — an unpriced wish must not sort with cheap ones.';

-- ---------------------------------------------------------------------------
-- parse_price_fr
-- ---------------------------------------------------------------------------
-- Parses the price strings that arrive from French merchant pages and from our
-- own prototype fixtures ('279 €', '1 599 €', '1 240,50 €').
--
-- The trap, and the reason this is a function and not an inline regexp: French
-- typography uses THREE different space characters as the thousands separator
-- and they are visually identical.
--
--   U+0020 SPACE                  — what a human types
--   U+00A0 NO-BREAK SPACE         — what most CMSes emit (&nbsp;)
--   U+202F NARROW NO-BREAK SPACE  — what the Unicode CLDR French locale
--                                   actually specifies, and therefore what
--                                   Intl.NumberFormat('fr-FR') produces in the
--                                   browser. Our own frontend `euros()` helper
--                                   emits this one.
--
-- A regexp that only handles U+0020 parses '1 599 €' as 1 euro. That is not a
-- hypothetical: it is what happens the first time a price copied out of our own
-- UI is pasted back in. All three are stripped below.
--
-- Comma is the decimal separator. A '.' is treated as a thousands separator
-- too, since French pages that use it use it that way ('1.599 €'), never as a
-- decimal point.
create or replace function public.parse_price_fr(s text)
returns integer
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  cleaned  text;
  int_part text;
  dec_part text;
begin
  if s is null then
    return null;
  end if;

  cleaned := btrim(s);
  if cleaned = '' then
    return null;
  end if;

  -- Strip currency symbols, ISO codes and every flavour of space.
  cleaned := replace(cleaned, '€', '');
  cleaned := replace(cleaned, U&'\00A0', '');  -- NBSP
  cleaned := replace(cleaned, U&'\202F', '');  -- narrow NBSP
  cleaned := replace(cleaned, U&'\2009', '');  -- thin space, seen in the wild
  cleaned := replace(cleaned, ' ', '');
  cleaned := regexp_replace(cleaned, '(?i)eur', '', 'g');

  -- '.' as a thousands separator: 1.599 -> 1599. Only when it is NOT acting as
  -- a decimal point, i.e. when followed by exactly three digits and not the
  -- last separator in a comma-decimal number. Simplest safe rule for fr-FR:
  -- a dot followed by exactly 3 digits that are not the end of a 1-2 decimal
  -- tail is a grouping dot.
  cleaned := regexp_replace(cleaned, '\.(?=\d{3}(\D|$))', '', 'g');

  -- Anything else non-numeric is noise ("à partir de", "TTC", nbsp leftovers).
  cleaned := regexp_replace(cleaned, '[^0-9,.-]', '', 'g');

  if cleaned = '' or cleaned !~ '\d' then
    return null;
  end if;

  -- Normalise the decimal separator to '.'.
  cleaned := replace(cleaned, ',', '.');

  if position('.' in cleaned) > 0 then
    int_part := split_part(cleaned, '.', 1);
    dec_part := split_part(cleaned, '.', 2);
  else
    int_part := cleaned;
    dec_part := '';
  end if;

  if int_part = '' or int_part = '-' then
    int_part := '0';
  end if;

  -- Pad/truncate the decimal tail to exactly two digits: '5' -> 50 cents,
  -- '5' vs '50' is a factor of ten and a very expensive bug.
  dec_part := rpad(regexp_replace(dec_part, '\D', '', 'g'), 2, '0');
  dec_part := substring(dec_part from 1 for 2);

  return (int_part::bigint * 100 + dec_part::int)::integer;
exception
  when others then
    -- A malformed price must not abort an ingestion batch. Unknown price is a
    -- supported state everywhere downstream (price_band 0).
    return null;
end;
$$;

comment on function public.parse_price_fr(text) is
  'French price string -> integer cents. Handles U+0020 / U+00A0 / U+202F thousands separators; Intl.NumberFormat(fr-FR) emits U+202F, so an ASCII-only regexp parses "1 599 €" as 1.';

-- ---------------------------------------------------------------------------
-- is_friend
-- ---------------------------------------------------------------------------
-- NOTE ON PLACEMENT: the body of is_friend reads public.follows, which does not
-- exist until 0004. plpgsql bodies are not parsed at creation time, but an SQL
-- function body IS (it is parsed and its dependencies recorded), so declaring
-- this as `language sql` here would fail with "relation public.follows does not
-- exist". Rather than weaken it to plpgsql or reorder the table, the definition
-- lives at the end of 0004_identity.sql, immediately after `follows` is
-- created. It is documented here because this is the file a reader greps for
-- helpers.
--
-- Mutual accepted follow. Called from RLS predicates on wishlists and
-- wish_items.
--
-- PERFORMANCE, and this is load-bearing: this function is STABLE, not VOLATILE.
-- The default for plpgsql/sql functions is VOLATILE, and a VOLATILE function in
-- an RLS predicate is re-executed for EVERY CANDIDATE ROW, because the planner
-- may not cache it or hoist it out of the scan. Reading a friend's 40-item list
-- would then run 40 follow lookups; a feed query over many lists degrades
-- quadratically. Marked STABLE, the planner treats it as constant within the
-- statement for a fixed pair of arguments and evaluates it once per distinct
-- pair.
--
-- SECURITY DEFINER as well: the caller must be able to evaluate "are these two
-- people friends" for a pair that includes someone whose follow rows they
-- cannot themselves SELECT under the follows RLS policy. Without DEFINER the
-- predicate silently returns false and friends' lists appear empty.
--
-- >>> Defined in 0004_identity.sql. See placement note above. <<<

-- ---------------------------------------------------------------------------
-- touch_updated_at
-- ---------------------------------------------------------------------------
-- One trigger function, reused by every table with an updated_at. Assigning to
-- NEW and returning it is the only correct shape for a BEFORE trigger; an AFTER
-- trigger doing an UPDATE would recurse.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.touch_updated_at() is
  'Shared BEFORE UPDATE trigger. Clients must not be trusted to set updated_at; sync and cache invalidation depend on it being server time.';
