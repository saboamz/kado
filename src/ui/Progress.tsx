import { cn } from './cn';

/**
 * Determinate progress bar. Used by the collaborative pot and the onboarding
 * dots' underlying value.
 *
 * Always renders the full ARIA trio (valuemin/valuemax/valuenow) — the
 * prototype did this correctly and it is worth preserving: a bar that animates
 * its width but reports nothing is decoration, not information.
 *
 * NOTE for the pot: whether this component renders at all is a server
 * decision, never a render-time one. An owner must not receive pot state from
 * the API in the first place — see the P5 RPCs. Do not reintroduce a
 * `{!isOwner && <Progress/>}` guard as the thing standing between the owner
 * and the secret.
 */
export function Progress({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number;
  /** Accessible name, e.g. "Progression de la cagnotte". */
  label: string;
  className?: string;
}) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.min(100, Math.max(0, (value / safeMax) * 100));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-chip', className)}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out-soft motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
