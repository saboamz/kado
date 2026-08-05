import { useLocation, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BackButton } from '../components/BackButton';
import { PlaceholderArt } from '../components/Placeholder';
import { Skeleton } from '../components/Skeleton';
import { Pot } from '../components/Pot';
import { PRIO_LABEL, stars } from '../data/fixtures';
import { wishItemsQuery } from '../api/wishlists';
import { formatMoney } from '../lib/money';
import { useStore, useViewerRole } from '../state/store';
import { useReservations } from '../api/useReservations';
import {
  contributeToPot,
  invalidatePot,
  invalidateReservations,
  releaseItem,
  reserveItem,
} from '../api/reservations';
import { Button, Card, Tag, cn } from '../ui';

/** The seeded fixture list. Replaced by the wishlist query in P6d. */
const LIST_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

export function GiftDetail() {
  const { handle = 'sophie', slug = 'anniversaire', itemId } = useParams();
  const { pathname } = useLocation();
  const { state, flash } = useStore();
  const queryClient = useQueryClient();
  const role = useViewerRole(handle);
  const owner = role === 'owner';

  // `/…/:itemId/cagnotte` is the pot view of a gift. It always lands on a
  // collaborative gift, even when the user arrived from a feed entry whose
  // target has no pot of its own.
  const items = useQuery(wishItemsQuery(LIST_ID));
  const gifts = items.data ?? [];

  const isPotRoute = pathname.endsWith('/cagnotte');
  const fallback = gifts.find((g) => g.is_pot) ?? gifts[0];
  const selected = gifts.find((g) => g.id === itemId) ?? gifts[0];
  const gift = isPotRoute && !selected?.is_pot ? fallback : selected;

  const reservations = useReservations(LIST_ID);
  const reservation = gift ? reservations.get(gift.id) : null;

  // The array is empty until the query lands, so `gifts[0]` is undefined on
  // the first paint. TypeScript does not catch this — indexing an array is
  // typed as if it always hits — so the guard is manual and everything below
  // may assume a gift.
  if (!gift) {
    return (
      <div className="pb-36" aria-busy="true">
        <Skeleton className="h-80 w-full sm:h-96" />
        <div className="mx-auto w-full max-w-screen-sm space-y-3 px-5 pt-5.5 sm:px-6">
          <Skeleton className="h-8 w-3/4 rounded-lg" />
          <Skeleton className="h-4 w-1/3 rounded-sm" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  const label = owner
    ? 'Modifier ce cadeau'
    : gift.is_pot
      ? `Participer avec ${state.contrib} €`
      : reservation === 'you'
        ? 'Annuler ma réservation'
        : reservation
          ? 'Déjà réservé par un proche'
          : 'Réserver ce cadeau';

  const taken = !!reservation && reservation !== 'you' && !gift.is_pot;

  async function act() {
    if (owner)
      return flash('Édition — le propriétaire ne voit aucune réservation');
    if (gift.is_pot) {
      await contributeToPot(gift.id, state.contrib * 100);
      await invalidatePot(queryClient, gift.id);
      return flash(
        `+${state.contrib} € — merci, votre participation est anonyme`,
      );
    }
    if (reservation) {
      if (reservation !== 'you') return flash("Un autre proche l'a déjà réservé");
      await releaseItem(gift.id);
      await invalidateReservations(queryClient, LIST_ID);
      return flash('Réservation annulée');
    }
    await reserveItem(gift.id);
    await invalidateReservations(queryClient, LIST_ID);
    flash('Réservé — Sophie ne verra rien');
  }

  return (
    <>
      <div className="pb-36 motion-safe:animate-[kFadeUp_.35s_both]">
        <div className="relative h-80 sm:h-96">
          <PlaceholderArt
            label={gift.art ?? 'PHOTO PRODUIT'}
            hatch={6}
            className="absolute inset-0"
          />
          <BackButton
            to={`/u/${handle}/listes/${slug}`}
            label="Retour à la liste"
          />
        </div>

        <div className="mx-auto w-full max-w-screen-sm px-5 pt-5.5 sm:px-6">
          <div className="flex items-start gap-3.5">
            <h2 className="flex-1 text-pretty text-3xl leading-tight font-bold tracking-tighter text-fg">
              {gift.title}
            </h2>
            <span className="font-mono text-xl leading-snug font-semibold whitespace-nowrap text-fg">
              {formatMoney(gift.price_cents, gift.currency)}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <span
              aria-label={`Priorité ${gift.priority} sur 3`}
              className="text-[0.8125rem] leading-none tracking-[.12em] text-accent"
            >
              {stars(gift.priority as 1 | 2 | 3)}
            </span>
            <span className="text-xs leading-none text-fg2">
              {PRIO_LABEL[gift.priority as 1 | 2 | 3]}
            </span>
            <span aria-hidden className="h-[3px] w-[3px] rounded-full bg-fg3" />
            <Tag tone="neutral" size="sm">
              {gift.cat ?? 'Cadeau'}
            </Tag>
          </div>

          <p className="mt-4.5 text-pretty leading-relaxed text-fg2">
            {gift.note}
          </p>

          <a
            href={`https://${gift.url ?? ''}`}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-5 flex items-center gap-3 rounded-xl bg-surface p-3.5 transition-colors hover:bg-chip focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span
              aria-hidden
              className="flex h-8.5 w-8.5 flex-none items-center justify-center rounded-lg bg-bg font-mono text-sm leading-none font-semibold text-fg2"
            >
              ↗
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.8125rem] leading-snug font-semibold text-fg">
                {gift.merchant ?? 'Lien'}
              </span>
              <span className="mt-0.5 block truncate text-xs leading-tight text-fg3">
                {gift.url ?? ''}
              </span>
            </span>
          </a>

          {/*
            No `!owner &&` guard: Pot renders nothing when the server declines
            to describe the pot, which it always does for an owner. The
            condition that used to live here — `!!gift.is_pot && !owner` — was a
            guard someone could forget or invert.
          */}
          <Pot itemId={gift.id} />

          <Card tone="surface" radius="lg" className="mt-4.5 px-3.5 py-3.5">
            <p className="text-pretty text-xs leading-relaxed font-medium text-fg2">
              {owner
                ? "Vue propriétaire : aucune information de réservation n'existe sur cet écran."
                : reservation
                  ? 'Sophie ne verra jamais cette réservation, ni votre nom.'
                  : 'Votre réservation restera invisible pour Sophie.'}
            </p>
          </Card>
        </div>
      </div>

      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-30 border-t border-line bg-glass backdrop-blur-[20px]',
          'px-5 pt-3.5 pb-[max(1.875rem,env(safe-area-inset-bottom))] sm:px-6',
          // Matches AppLayout's symmetric rail padding so the CTA stays
          // centred under the content rather than shifted by the nav width.
          'md:px-20',
        )}
      >
        <div className="mx-auto w-full max-w-screen-sm">
          <Button
            block
            size="lg"
            variant={owner ? 'secondary' : 'primary'}
            onClick={act}
            disabled={taken}
          >
            {label}
          </Button>
        </div>
      </div>
    </>
  );
}
