/**
 * Transient confirmation. Announced politely so the reservation feedback
 * reaches screen readers, which the prototype's visual-only toast did not.
 *
 * The background was a hardcoded '#111114' that happened to equal ACCENTS[3]
 * without being linked to it — and, being fixed, rendered a near-black toast on
 * the near-black dark background. It now inverts with the theme.
 *
 * Centring is left to `translate(-50%, …)` inside the kToast keyframes rather
 * than a `-translate-x-1/2` class, because the animation writes `transform`
 * wholesale and would drop a class-applied translate the moment it starts.
 * Under prefers-reduced-motion the animation is neutralised by global.css, so
 * the inline transform supplies the same centring.
 */
export function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ transform: 'translateX(-50%)' }}
      className="fixed bottom-26 left-1/2 z-60 max-w-[19rem] rounded-2xl bg-fg px-4.5 py-3.5 text-center text-[0.8125rem] leading-snug font-medium text-bg shadow-[0_16px_34px_-12px_rgba(0,0,0,.5)] motion-safe:animate-[kToast_2.6s_both]"
    >
      {message}
    </div>
  );
}
