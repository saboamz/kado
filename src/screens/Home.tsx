import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PlaceholderArt } from '../components/Placeholder';
import { Skeleton } from '../components/Skeleton';
import { birthdaysQuery, type Birthday } from '../api/social';
// The activity feed is the one thing on this screen with no server behind it:
// there is no feed table yet, and inventing a query for one would mean
// inventing the rows it returns. It stays on fixtures until that table lands.
import { FEED } from '../data/social';
import { Card, Eyebrow, ScreenShell, Tag, cn } from '../ui';

/**
 * Where a feed entry points.
 *
 * The fixtures still carry `to: ScreenId` from the gallery era, when 'list' and
 * 'pot' named mock screens rather than resources. Until the feed has a table of
 * its own, every list link resolves to the same placeholder wishlist and every
 * gift link to the same placeholder gift — the shape of the URL is what matters
 * here, not the target.
 */
const PLACEHOLDER_LIST = '/u/sophie/listes/anniversaire';
const PLACEHOLDER_GIFT = `${PLACEHOLDER_LIST}/g1`;

function feedHref(to: string): string {
  switch (to) {
    case 'profile':
      return '/u/sophie';
    case 'pot':
      return `${PLACEHOLDER_GIFT}/cagnotte`;
    default:
      return PLACEHOLDER_LIST;
  }
}

/**
 * Days until the next occurrence of a birthday.
 *
 * The fixture carried "dans 12 j" as prose; the table carries a date, so the
 * copy is computed. Anniversaries recur, so the year is replaced with this
 * one and rolled forward if it has already passed.
 */
function daysUntil(birthday: string, today = new Date()): number {
  const [, month, day] = birthday.split('-').map(Number);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(today.getFullYear(), month - 1, day);
  if (next < start) next = new Date(today.getFullYear() + 1, month - 1, day);
  return Math.round((next.getTime() - start.getTime()) / 86_400_000);
}

/** Same register as the fixture copy it replaces: "dans 12 j", "dans 2 mois". */
function birthdayCopy(days: number): string {
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'demain';
  if (days < 31) return `dans ${days} j`;
  const months = Math.round(days / 30);
  return months <= 1 ? 'dans 1 mois' : `dans ${months} mois`;
}

/** Within a fortnight is worth highlighting; beyond that it is just a date. */
const HOT_WITHIN_DAYS = 14;

function BirthdayCard({ person }: { person: Birthday }) {
  const days = person.birthday ? daysUntil(person.birthday) : null;
  return (
    <Link
      to={`/u/${person.handle}`}
      className={cn(
        'w-28 flex-none rounded-2xl bg-surface p-3 text-left',
        'transition-colors hover:bg-chip',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
      )}
    >
      <PlaceholderArt className="mb-2.5 aspect-square w-full rounded-lg" />
      <div className="text-sm leading-tight font-semibold text-fg">
        {person.display_name}
      </div>
      <div
        className={cn(
          'mt-1 font-mono text-xs leading-tight',
          days !== null && days <= HOT_WITHIN_DAYS ? 'text-accent' : 'text-fg3',
        )}
      >
        {days === null ? '' : birthdayCopy(days)}
      </div>
    </Link>
  );
}

export function Home() {
  const birthdays = useQuery(birthdaysQuery());

  return (
    <ScreenShell>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-4xl leading-tight font-bold tracking-tighter text-fg">
          Aujourd&rsquo;hui
        </h2>
        <PlaceholderArt round className="h-9.5 w-9.5 flex-none" />
      </div>

      <section
        aria-label="Anniversaires à venir"
        // Bleeds to the screen edges so the strip reads as scrollable: the
        // negative margin has to cancel ScreenShell's padding exactly, or the
        // first card sits inset and the affordance is lost.
        className="-mx-5 mb-6 flex gap-2.5 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6"
      >
        {birthdays.isPending
          ? // Four cards is what the strip usually holds, so the placeholder
            // reserves the height the real content will take and the page does
            // not jump when it arrives.
            Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-38.5 w-28 flex-none rounded-2xl" />
            ))
          : birthdays.data?.map((b) => <BirthdayCard key={b.id} person={b} />)}
      </section>

      <Eyebrow className="mb-3 ml-0.5">Activité</Eyebrow>
      <ul className="flex list-none flex-col gap-2.5 p-0">
        {FEED.map((f) => {
          const isPot = f.tag === 'Cagnotte';
          return (
            <Card key={f.text} as="li" pad="none" radius="xl">
              {/* The whole row is one link, so the hover/focus affordance lives
                  on the link rather than on the card wrapping it. */}
              <Link
                to={feedHref(f.to)}
                className={cn(
                  'flex items-start gap-3 rounded-xl p-3.5 text-left',
                  'transition-colors hover:bg-chip',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                )}
              >
                <PlaceholderArt className="h-10.5 w-10.5 flex-none rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="text-base leading-snug text-pretty text-fg">
                    {f.text}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="font-mono text-xs leading-none text-fg3">
                      {f.time}
                    </span>
                    {/* Neutral tone is bg-surface, which would vanish against
                        the surface card it sits on — chip is the next step up. */}
                    <Tag
                      size="sm"
                      tone={isPot ? 'soft' : 'neutral'}
                      className={isPot ? undefined : 'bg-chip text-fg2'}
                    >
                      {f.tag}
                    </Tag>
                  </div>
                </div>
              </Link>
            </Card>
          );
        })}
      </ul>

      <div className="mt-3.5 flex items-center gap-3 rounded-2xl border border-dashed border-line2 px-4.5 py-4">
        <div
          aria-hidden
          className="flex h-7.5 w-7.5 flex-none items-center justify-center rounded-md bg-accent-soft text-base leading-none font-bold text-accent"
        >
          !
        </div>
        <div className="flex-1">
          <div className="text-sm leading-snug font-semibold text-fg">
            Votre liste Noël est vide
          </div>
          <div className="mt-0.5 text-sm leading-snug text-fg2">
            Ajoutez 3 idées pour vos proches.
          </div>
        </div>
      </div>
    </ScreenShell>
  );
}
