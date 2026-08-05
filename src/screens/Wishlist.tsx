import { useParams } from 'react-router-dom';
import { GiftCard } from '../components/GiftCard';
import { PlaceholderArt } from '../components/Placeholder';
import { useQuery } from '@tanstack/react-query';
import { useStore, useViewerRole } from '../state/store';
import { useReservations } from '../api/useReservations';
import { wishItemsQuery } from '../api/wishlists';
import { BackButton } from '../components/BackButton';
import { Skeleton } from '../components/Skeleton';
import { Eyebrow, ScreenShell, cn } from '../ui';

/**
 * The seeded fixture list.
 *
 * Resolving `:slug` to a list id needs the wishlist query, which needs the
 * embed the mock transport does not model yet. Until then the screen addresses
 * the one seeded list directly — the id is the same one supabase/seed.sql uses,
 * so it means the same thing against a real backend.
 */
const LIST_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

export function Wishlist() {
  const { handle = 'sophie', slug = 'anniversaire' } = useParams();
  const { state, dispatch } = useStore();
  const role = useViewerRole(handle);
  const owner = role === 'owner';
  const items = useQuery(wishItemsQuery(LIST_ID));
  const reservations = useReservations(LIST_ID);
  const grid = state.layout === 'grid';
  const gifts = items.data ?? [];

  return (
    <ScreenShell flushTop className="px-0 sm:px-0">
      <div className="relative h-56 sm:h-72">
        <PlaceholderArt hatch={6} className="absolute inset-0" />
        <BackButton to={`/u/${handle}`} label="Retour au profil" />
        <div className="absolute bottom-5 left-5 sm:left-6">
          <Eyebrow className="mb-2 text-fg2">
            Liste de {owner ? 'Sophie (vous)' : 'Sophie Marchand'}
          </Eyebrow>
          <h2 className="text-4xl leading-none font-bold tracking-tighter text-fg">
            Anniversaire
          </h2>
        </div>
      </div>

      <div className="flex items-center gap-2 px-5 pt-4 pb-3.5 sm:px-6">
        <span className="font-mono text-sm leading-none text-fg2">
          {/*
            The owner is told how many wishes exist, never how many are taken.
            A "2 réservées" counter would leak the very thing this app hides.

            There is no `owner ?` here and there does not need to be: the count
            comes from an RPC that refuses an owner outright, so their map is
            empty and the number is 0. The absence of a guard is the point —
            a guard is something a future edit can invert.
          */}
          {gifts.length} envies
          {reservations.count > 0 && ` · ${reservations.count} réservées`}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => dispatch({ type: 'toggleLayout' })}
          aria-pressed={!grid}
          className="rounded-md bg-accent-soft px-2.5 py-1.5 text-xs leading-none font-medium text-accent transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {grid ? 'Vue liste' : 'Vue grille'}
        </button>
      </div>

      <div
        className={cn(
          'px-5 sm:px-6',
          grid
            ? 'grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-4'
            : 'flex flex-col gap-2.5',
        )}
      >
        {items.isLoading
          ? // Cards, not a spinner: the list's shape is known before its
            // contents are, so reserving the space stops the page jumping when
            // the answer lands.
            Array.from({ length: 4 }, (_, i) => (
              <Skeleton
                key={i}
                className={cn('rounded-3xl', grid ? 'aspect-[3/4]' : 'h-24')}
              />
            ))
          : gifts.map((g) => (
              <GiftCard
                key={g.id}
                gift={g}
                grid={grid}
                reservation={reservations.get(g.id)}
                to={`/u/${handle}/listes/${slug}/${g.id}${
                  g.is_pot ? '/cagnotte' : ''
                }`}
              />
            ))}
      </div>
    </ScreenShell>
  );
}
