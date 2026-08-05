import { useQuery } from '@tanstack/react-query';
import { PlaceholderArt } from '../components/Placeholder';
import { Skeleton } from '../components/Skeleton';
import {
  NOTIF_TEMPLATES,
  notificationsQuery,
  type NotificationRow,
} from '../api/social';
import { ScreenShell, cn } from '../ui';

/**
 * Kinds whose copy is a whole sentence rather than a verb phrase.
 *
 * "a créé une nouvelle liste" needs an actor in front of it; "La cagnotte est
 * complète" does not, and prefixing one with a name would produce nonsense.
 * The distinction is a property of the template, so it is declared next to the
 * rendering rather than inferred from whether a payload happens to carry a
 * name.
 */
const STANDALONE = new Set<NotificationRow['kind']>([
  'pot_progress',
  'pot_funded',
  'reco_digest',
  'system',
]);

/** Kinds worth accenting: money moving is the one thing that is time-critical. */
const HOT = new Set<NotificationRow['kind']>(['pot_progress', 'pot_funded']);

/** Best-effort string out of an untyped payload field. */
function text(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value ? value : null;
}

function NotificationItem({ row }: { row: NotificationRow }) {
  const unread = row.read_at === null;
  const hot = HOT.has(row.kind);
  const who = text(row.payload, 'who');
  const when = text(row.payload, 'time');
  /*
    The copy is assembled here, from a kind and a payload. That is the whole
    point of the structured table: the server has no text column to write
    "Marc a réservé les AirPods" into, so no backend job can leak a
    reservation through the inbox however carelessly it is written.
  */
  const template = NOTIF_TEMPLATES[row.kind];
  const standalone = STANDALONE.has(row.kind) || !who;

  return (
    <li
      className={cn(
        'flex items-start gap-3 rounded-xl px-2.5 py-3.5',
        // Unread rows are raised onto a surface; read rows sit flat on the
        // page. Colour alone carries this, so the dot below is what a
        // screen reader actually gets.
        unread ? 'bg-surface' : 'bg-transparent',
      )}
    >
      <span
        // Only the unread dot is named. A read row has no marker to
        // announce, and labelling it "Lue" would add noise to five of six
        // rows for no gain.
        aria-label={unread ? 'Non lue' : undefined}
        role={unread ? 'img' : undefined}
        aria-hidden={unread ? undefined : true}
        className={cn(
          'mt-4 h-2.25 w-2.25 flex-none rounded-full',
          unread ? (hot ? 'bg-accent' : 'bg-fg') : 'bg-transparent',
        )}
      />
      <PlaceholderArt className="h-10 w-10 flex-none rounded-lg" />
      <div className="min-w-0 flex-1">
        <div className="text-base leading-snug text-pretty text-fg">
          {standalone ? (
            template
          ) : (
            <>
              <span className="font-semibold">{who}</span> {template}
            </>
          )}
        </div>
        {when && (
          <div className="mt-1.5 font-mono text-xs leading-none text-fg3">
            {when}
          </div>
        )}
      </div>
    </li>
  );
}

export function Notifications() {
  const notifications = useQuery(notificationsQuery());

  return (
    <ScreenShell>
      <h2 className="mb-5 text-4xl leading-tight font-bold tracking-tighter text-fg">
        Notifications
      </h2>

      {notifications.isPending ? (
        <div className="flex flex-col gap-1">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-19 rounded-xl" />
          ))}
        </div>
      ) : notifications.data?.length === 0 ? (
        <p role="status" className="px-2.5 py-6 text-sm leading-snug text-fg2">
          Rien de neuf pour le moment.
        </p>
      ) : (
        <ul className="flex list-none flex-col gap-1 p-0">
          {notifications.data?.map((row) => (
            <NotificationItem key={row.id} row={row} />
          ))}
        </ul>
      )}
    </ScreenShell>
  );
}
