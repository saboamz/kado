import type { ReactNode } from 'react';

/**
 * Full-screen message with artwork, title, body and one action. The empty and
 * error screens are the same layout with different content — the cleanest
 * abstraction the prototype had, kept as-is and moved onto the token scale.
 *
 * `minHeight: 852` was the device height hardcoded from DEVICE.height; it is
 * now `min-h-dvh`, which is what it always meant.
 */
export function CenteredState({
  art,
  title,
  body,
  action,
  footnote,
}: {
  art: ReactNode;
  title: string;
  body: string;
  action: ReactNode;
  footnote?: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8 py-16 text-center motion-safe:animate-[kFadeUp_.4s_both]">
      {art}
      <h3 className="mb-2.5 text-2xl leading-tight font-bold tracking-tight text-fg">
        {title}
      </h3>
      <p className="mb-6 max-w-[16rem] text-pretty text-fg2">{body}</p>
      {action}
      {footnote && (
        <p className="mt-4.5 font-mono text-xs leading-none text-fg3">
          {footnote}
        </p>
      )}
    </div>
  );
}
