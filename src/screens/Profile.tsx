import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PlaceholderArt } from '../components/Placeholder';
import { Skeleton } from '../components/Skeleton';
import { profileQuery, wishlistsOfUserQuery } from '../api/wishlists';
import { useStore, useViewerRole } from '../state/store';
import { useViewer } from '../auth/SessionContext';
import { Button, Eyebrow, ScreenShell, Tag, cn } from '../ui';

/** First name, for the second-person copy: "Sophie (vous)", "Vous suivez Sophie". */
const firstName = (displayName: string) => displayName.split(' ')[0];

export function Profile() {
  const { handle } = useParams();
  const { state, dispatch, flash } = useStore();
  const viewer = useViewer();
  // `/moi` has no :handle and always means the viewer's own profile, so it
  // falls back to their handle rather than to a literal. With a hardcoded
  // session that literal was right by coincidence; against a real one it meant
  // anyone but Sophie saw a "Suivre" button on their own profile.
  const profileHandle = handle ?? viewer?.handle;
  const role = useViewerRole(profileHandle);
  const owner = role === 'owner';

  const profile = useQuery(profileQuery(profileHandle));
  /*
    Keyed by the profile's id, not its handle.

    wishlistsOfUserQuery takes a parameter named `handle` and filters
    `.eq('owner_id', ...)` with it — owner_id is a uuid, so passing an actual
    handle matches nothing and the grid comes back empty. Passing the id we
    just fetched is correct against both the mock and a real PostgREST; the
    misleading parameter name is reported rather than renamed, since
    src/api/wishlists.ts is outside this change.
  */
  const collections = useQuery(wishlistsOfUserQuery(profile.data?.id));

  // Whose profile this is, in the third person, until the fetch settles.
  const displayName = profile.data?.display_name;
  const heading = displayName
    ? owner
      ? `${firstName(displayName)} (vous)`
      : displayName
    : null;

  return (
    <ScreenShell className="px-0 sm:px-0">
      <div className="px-5 sm:px-6">
        <div className="mb-4 flex items-center gap-4.5">
          <PlaceholderArt
            label="PHOTO"
            hatch={5}
            round
            className="h-22 w-22 flex-none bg-surface"
          />
          {/*
            The fixture showed 6 listes / 41 envies / 12 reçus. Only the first
            is countable from anything we fetch — it is the length of the
            collections below. "Envies" would need an aggregate over items in
            every list, and "Reçus" has no table at all behind it, so both are
            dropped rather than shown as a plausible-looking invention.
          */}
          <dl className="flex flex-1 justify-around">
            <div className="text-center">
              <dd className="text-xl leading-none font-bold text-fg">
                {collections.isPending ? (
                  <Skeleton className="mx-auto h-5 w-6 rounded-sm" />
                ) : (
                  collections.data?.length ?? 0
                )}
              </dd>
              <dt className="mt-1.5 text-xs leading-none text-fg2">
                {collections.data?.length === 1 ? 'Liste' : 'Listes'}
              </dt>
            </div>
          </dl>
        </div>

        <h2 className="text-xl leading-snug font-bold tracking-tight text-fg">
          {heading ?? <Skeleton className="h-6 w-44 rounded-sm" />}
        </h2>
        {profile.isPending ? (
          <div className="mt-1.5 flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-full rounded-sm" />
            <Skeleton className="h-3.5 w-2/3 rounded-sm" />
          </div>
        ) : (
          profile.data?.bio && (
            <p className="mt-1.5 text-pretty text-[0.84375rem] leading-relaxed text-fg2">
              {profile.data.bio}
            </p>
          )
        )}

        <ul className="mt-3 flex list-none flex-wrap gap-1.5 p-0">
          {profile.data?.interests?.map((label) => (
            <li key={label}>
              <Tag tone="neutral">{label}</Tag>
            </li>
          ))}
        </ul>

        <div className="mt-4.5 flex gap-2">
          <Button
            block
            onClick={() =>
              flash(
                owner
                  ? 'Édition du profil'
                  : `Vous suivez ${displayName ? firstName(displayName) : 'ce profil'}`,
              )
            }
          >
            {owner ? 'Modifier mon profil' : 'Suivre'}
          </Button>
          <Button
            variant="secondary"
            aria-label="Partager le profil"
            onClick={() => flash('Lien de partage copié')}
            className="w-11 flex-none px-0"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M8 10.5V2m0 0L4.8 5.2M8 2l3.2 3.2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M2.5 9.5v3a1.5 1.5 0 001.5 1.5h8a1.5 1.5 0 001.5-1.5v-3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between px-5 pt-6.5 pb-3 sm:px-6">
        <Eyebrow as="h3">Collections</Eyebrow>
        <span className="text-xs leading-none text-fg2">Tout voir</span>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5 sm:px-6 md:grid-cols-3 lg:grid-cols-4">
        {collections.isPending &&
          Array.from({ length: 6 }, (_, i) => (
            <div key={i}>
              <Skeleton className="aspect-[1.05] w-full rounded-xl" />
              <Skeleton className="mt-2.5 ml-1 h-3.5 w-2/3 rounded-sm" />
            </div>
          ))}
        {collections.data?.map((c) => {
          // Every collection is a list belonging to this profile, addressed by
          // its own slug now rather than by a fixture id.
          const to = `/u/${profileHandle ?? 'sophie'}/listes/${c.slug ?? c.id}`;
          return (
            /*
              Card and heart are siblings, not nested buttons: a button inside a
              button is invalid markup and browsers disagree on how to focus it.
              The heart is positioned against the cover wrapper so it stays put
              regardless of how tall the caption below runs.
            */
            <div key={c.id}>
              <div className="relative">
                <Link
                  to={to}
                  aria-label={`Ouvrir la collection ${c.title}`}
                  className="block w-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <PlaceholderArt
                    label="COUVERTURE"
                    hatch={5}
                    className="aspect-[1.05] w-full overflow-hidden rounded-xl transition-transform hover:scale-[1.01]"
                  />
                </Link>
                <button
                  aria-label={`Aimer ${c.title}`}
                  aria-pressed={!!state.liked[c.id]}
                  onClick={() => dispatch({ type: 'toggleLike', id: c.id })}
                  className={cn(
                    'absolute right-2 bottom-2 flex h-6.5 w-6.5 items-center justify-center rounded-full bg-glass text-xs leading-none backdrop-blur-[10px]',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                    state.liked[c.id]
                      ? 'text-accent motion-safe:animate-[kBeat_.4s]'
                      : 'text-fg3 hover:text-fg2',
                  )}
                >
                  ♥
                </button>
              </div>
              <Link
                to={to}
                className="block w-full rounded-sm px-1 pt-2.5 pb-0.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span className="block text-[0.84375rem] leading-snug font-semibold text-fg">
                  {c.title}
                </span>
                {/*
                  The fixture captioned each cover with "8 envies". That count
                  is an aggregate over wish_items which this query does not
                  select and cannot cheaply add, and a wrong count under a
                  cover is worse than none — so the caption carries the
                  occasion, which the row actually has, and nothing when it
                  has none.
                */}
                {c.occasion && (
                  <span className="mt-1 block font-mono text-xs leading-none text-fg3">
                    {c.occasion}
                  </span>
                )}
              </Link>
            </div>
          );
        })}
      </div>
    </ScreenShell>
  );
}
