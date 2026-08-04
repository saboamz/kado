import { PlaceholderArt } from '../components/Placeholder';
import { NOTIFICATIONS } from '../data/social';
import { ScreenShell, cn } from '../ui';

export function Notifications() {
  return (
    <ScreenShell>
      <h2 className="mb-5 text-4xl leading-tight font-bold tracking-tighter text-fg">
        Notifications
      </h2>

      <ul className="flex list-none flex-col gap-1 p-0">
        {NOTIFICATIONS.map((n) => (
          <li
            key={`${n.who}-${n.time}`}
            className={cn(
              'flex items-start gap-3 rounded-xl px-2.5 py-3.5',
              // Unread rows are raised onto a surface; read rows sit flat on the
              // page. Colour alone carries this, so the dot below is what a
              // screen reader actually gets.
              n.unread ? 'bg-surface' : 'bg-transparent',
            )}
          >
            <span
              // Only the unread dot is named. A read row has no marker to
              // announce, and labelling it "Lue" would add noise to five of six
              // rows for no gain.
              aria-label={n.unread ? 'Non lue' : undefined}
              role={n.unread ? 'img' : undefined}
              aria-hidden={n.unread ? undefined : true}
              className={cn(
                'mt-4 h-2.25 w-2.25 flex-none rounded-full',
                n.unread ? (n.hot ? 'bg-accent' : 'bg-fg') : 'bg-transparent',
              )}
            />
            <PlaceholderArt className="h-10 w-10 flex-none rounded-lg" />
            <div className="min-w-0 flex-1">
              <div className="text-base leading-snug text-pretty text-fg">
                <span className="font-semibold">{n.who}</span> {n.text}
              </div>
              <div className="mt-1.5 font-mono text-xs leading-none text-fg3">
                {n.time}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </ScreenShell>
  );
}
