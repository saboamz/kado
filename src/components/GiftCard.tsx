import { Link } from 'react-router-dom';
import { PlaceholderArt } from './Placeholder';
import type { Gift, Role } from '../data/types';
import { stars } from '../data/fixtures';
import { useReservation } from '../state/store';
import { cn } from '../ui';

/**
 * A gift in a wishlist.
 *
 * The reservation flag comes from useReservation, which returns null for the
 * owner. That is the whole enforcement: there is no `owner &&` guard here to
 * forget, because an owner is never given a value to render.
 *
 * A Link rather than a button: opening a gift is navigation, so middle-click,
 * cmd-click and "open in new tab" should all work.
 */
export function GiftCard({
  gift,
  grid,
  role,
  to,
}: {
  gift: Gift;
  grid: boolean;
  role: Role;
  to: string;
}) {
  const reservation = useReservation(gift.id, role);

  const flag = gift.pot
    ? 'Cagnotte'
    : reservation === 'you'
      ? 'Réservé par vous'
      : reservation
        ? 'Déjà réservé'
        : null;

  return (
    <Link
      to={to}
      className={cn(
        'group overflow-hidden rounded-3xl bg-surface text-left transition-transform',
        'hover:bg-chip focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'active:scale-[.99]',
        grid ? 'block' : 'flex items-center',
      )}
    >
      <div
        className={cn(
          'relative',
          grid ? 'aspect-square w-full' : 'h-24 w-24 flex-none',
        )}
      >
        <PlaceholderArt label={gift.art} hatch={5} className="absolute inset-0" />
        {flag && (
          <span
            className={cn(
              'absolute top-2 left-2 rounded-sm px-2 py-1.5 text-[0.625rem] leading-none font-medium backdrop-blur-[10px]',
              gift.pot
                ? 'bg-accent text-on-accent'
                : // Was a manual `theme.dark ? 'rgba(16,16,19,.8)' : ...` branch
                  // retyping DARK.glass by hand. It is just the glass token.
                  'bg-glass text-fg2',
            )}
          >
            {flag}
          </span>
        )}
      </div>

      <div className={cn('min-w-0 flex-1', grid ? 'px-3.5 pt-3 pb-3.5' : 'px-3.5')}>
        <p className="text-pretty text-[0.84375rem] leading-tight font-semibold text-fg">
          {gift.name}
        </p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="font-mono text-sm leading-none font-medium text-fg">
            {gift.price}
          </span>
          <span
            aria-label={`Priorité ${gift.prio} sur 3`}
            className="text-xs leading-none tracking-eyebrow text-accent"
          >
            {stars(gift.prio)}
          </span>
        </div>
        {reservation && (
          <p className="mt-2 font-mono text-[0.65625rem] leading-tight text-fg3">
            Le propriétaire ne le voit pas
          </p>
        )}
      </div>
    </Link>
  );
}
