import { euros, POT_TOTAL } from '../data/fixtures';
import type { Role } from '../data/types';
import { usePotState, useStore } from '../state/store';
import { Chip, Progress } from '../ui';
import { PlaceholderArt } from './Placeholder';

const AMOUNTS = [20, 50, 100, 200];

/**
 * Collaborative gift pot.
 *
 * Contributions are anonymous by the same rule as reservations: the pot shows
 * a total and an avatar count, never who gave what.
 *
 * This renders nothing at all for an owner — not an empty section, nothing —
 * because usePotState hands them null rather than numbers to hide. The caller
 * no longer needs a `!owner &&` guard for correctness.
 */
export function Pot({ role }: { role: Role }) {
  const { dispatch } = useStore();
  const pot = usePotState(role);

  if (!pot) return null;

  const pct = Math.min(100, Math.round((pot.total / POT_TOTAL) * 100));
  const remaining = POT_TOTAL - pot.total;

  return (
    <section
      aria-label="Cagnotte"
      className="mt-4.5 rounded-2xl border border-line bg-bg p-4.5"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-2xl leading-none font-bold tracking-tight text-fg">
          {euros(pot.total)} récoltés
        </span>
        <span className="font-mono text-sm leading-none text-fg2">
          sur {euros(POT_TOTAL)}
        </span>
      </div>

      <Progress
        value={pot.total}
        max={POT_TOTAL}
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
          {pot.contributors} amis participent · il reste {euros(remaining)}
        </span>
      </div>

      <div
        role="group"
        aria-label="Montant de la participation"
        className="mt-4 flex flex-wrap gap-2"
      >
        {AMOUNTS.map((v) => (
          <Chip
            key={v}
            selected={pot.contrib === v}
            onClick={() => dispatch({ type: 'setContrib', amount: v })}
          >
            {euros(v)}
          </Chip>
        ))}
      </div>
    </section>
  );
}
