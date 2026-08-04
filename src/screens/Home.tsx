import { Link } from 'react-router-dom';
import { PlaceholderArt } from '../components/Placeholder';
import { BIRTHDAYS, FEED } from '../data/social';
import { Card, Eyebrow, ScreenShell, Tag, cn } from '../ui';

/**
 * Where a feed entry points.
 *
 * The fixtures still carry `to: ScreenId` from the gallery era, when 'list' and
 * 'pot' named mock screens rather than resources. Until P6 hands us real ids,
 * every list link resolves to the same placeholder wishlist and every gift link
 * to the same placeholder gift — the shape of the URL is what matters here, not
 * the target.
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

export function Home() {
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
        {BIRTHDAYS.map((b) => (
          <Link
            key={b.name}
            to="/u/sophie"
            className={cn(
              'w-28 flex-none rounded-2xl bg-surface p-3 text-left',
              'transition-colors hover:bg-chip',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            )}
          >
            <PlaceholderArt className="mb-2.5 aspect-square w-full rounded-lg" />
            <div className="text-sm leading-tight font-semibold text-fg">
              {b.name}
            </div>
            <div
              className={cn(
                'mt-1 font-mono text-xs leading-tight',
                b.hot ? 'text-accent' : 'text-fg3',
              )}
            >
              {b.when}
            </div>
          </Link>
        ))}
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
