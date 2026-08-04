import { cn } from '../ui';

/**
 * Stand-in artwork. The prototype ships no images: every photo slot is a
 * diagonal hatch with its label in monospace, so the layout reads as
 * "image goes here" without pretending to be final.
 *
 * The hatch is now the `hatch` utility from global.css. `hatch` (the prop) sets
 * the stripe period; the default 4px matches stripes()'s default.
 */
export function PlaceholderArt({
  label,
  className,
  hatch = 4,
  round,
}: {
  label?: string;
  className?: string;
  hatch?: number;
  /** Circular variant used for avatars. */
  round?: boolean;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'hatch flex items-center justify-center bg-chip text-center',
        round && 'rounded-full',
        className,
      )}
      style={{
        // The stripe period varies per call site (3 to 6px), which Tailwind
        // cannot express as a static class.
        backgroundSize: `${hatch * 2.83}px ${hatch * 2.83}px`,
      }}
    >
      {label && (
        <span className="font-mono text-[0.5rem] leading-normal font-medium tracking-[.06em] text-fg3">
          {label}
        </span>
      )}
    </div>
  );
}
