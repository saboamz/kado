import { useStore } from '../state/store';
import { usePot } from '../api/useReservations';
import { Chip, Progress } from '../ui';
import { PlaceholderArt } from './Placeholder';

const AMOUNTS_CENTS = [2000, 5000, 10000, 20000];

const euros = (cents: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

/**
 * Collaborative gift pot.
 *
 * Contributions are anonymous by the same rule as reservations: the pot shows
 * a total and a bucketed participant count, never who gave what.
 *
 * This renders nothing at all for an owner — not an empty section, nothing —
 * because the server refuses to describe the pot to them and usePot therefore
 * hands back null. The caller needs no `!owner &&` guard, which is the point:
 * a guard is something a later edit can invert.
 */
export function Pot({ itemId }: { itemId: string }) {
  const { state, dispatch } = useStore();
  const { pot } = usePot(itemId);

  if (!pot) return null;

  const pct = Math.min(100, Math.round((pot.raised_cents / pot.target_cents) * 100));
  const remaining = Math.max(0, pot.target_cents - pot.raised_cents);

  return (
    <section
      aria-label="Cagnotte"
      className="mt-4.5 rounded-2xl border border-line bg-bg p-4.5"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-2xl leading-none font-bold tracking-tight text-fg">
          {euros(pot.raised_cents)} récoltés
        </span>
        <span className="font-mono text-sm leading-none text-fg2">
          sur {euros(pot.target_cents)}
        </span>
      </div>

      <Progress
        value={pot.raised_cents}
        max={pot.target_cents}
        label={`Cagnotte à ${pct} %`}
        className="h-2"
      />

      <div className="mt-3.5 flex items-center gap-2.5">
        <div className="flex" aria-hidden>
          {[0, 1, 2].map((i) => (
            <PlaceholderArt
              key={i}
              round
              hatch={3}
              className={`h-6 w-6 border-2 border-bg ${i ? '-ml-2' : ''}`}
            />
          ))}
        </div>
        <span className="text-sm leading-tight text-fg2">
          {/*
            A bucket ('2-5'), not a number. An exact count that ticks upward is
            a channel of its own, and the server never sends one.
          */}
          {pot.contributors} amis participent · il reste {euros(remaining)}
        </span>
      </div>

      <div
        role="group"
        aria-label="Montant de la participation"
        className="mt-4 flex flex-wrap gap-2"
      >
        {AMOUNTS_CENTS.map((cents) => (
          <Chip
            key={cents}
            selected={state.contrib * 100 === cents}
            onClick={() =>
              dispatch({ type: 'setContrib', amount: cents / 100 })
            }
          >
            {euros(cents)}
          </Chip>
        ))}
      </div>
    </section>
  );
}
