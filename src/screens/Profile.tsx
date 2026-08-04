import { Link, useParams } from 'react-router-dom';
import { PlaceholderArt } from '../components/Placeholder';
import {
  COLLECTIONS,
  INTERESTS,
  PROFILE_BIO,
  PROFILE_STATS,
} from '../data/social';
import { useStore, useViewerRole } from '../state/store';
import { Button, Eyebrow, ScreenShell, Tag, cn } from '../ui';

export function Profile() {
  const { handle } = useParams();
  const { state, dispatch, flash } = useStore();
  // `/moi` has no handle and is always the viewer's own profile; `/u/:handle`
  // is someone else's unless the handle happens to be theirs.
  const role = useViewerRole(handle ?? 'sophie');
  const owner = role === 'owner';

  return (
    <ScreenShell className="px-0 sm:px-0">
      <div className="px-5 sm:px-6">
        <div className="mb-4 flex items-center gap-4.5">
          <PlaceholderArt
            label="PHOTO"
            hatch={5}
            round
            className="h-22 w-22 flex-none bg-surface"
          />
          <dl className="flex flex-1 justify-around">
            {PROFILE_STATS.map((s) => (
              <div key={s.label} className="text-center">
                <dd className="text-xl leading-none font-bold text-fg">
                  {s.value}
                </dd>
                <dt className="mt-1.5 text-xs leading-none text-fg2">
                  {s.label}
                </dt>
              </div>
            ))}
          </dl>
        </div>

        <h2 className="text-xl leading-snug font-bold tracking-tight text-fg">
          {owner ? 'Sophie (vous)' : 'Sophie Marchand'}
        </h2>
        <p className="mt-1.5 text-pretty text-[0.84375rem] leading-relaxed text-fg2">
          {PROFILE_BIO}
        </p>

        <ul className="mt-3 flex list-none flex-wrap gap-1.5 p-0">
          {INTERESTS.map((label) => (
            <li key={label}>
              <Tag tone="neutral">{label}</Tag>
            </li>
          ))}
        </ul>

        <div className="mt-4.5 flex gap-2">
          <Button
            block
            onClick={() =>
              flash(owner ? 'Édition du profil' : 'Vous suivez Sophie')
            }
          >
            {owner ? 'Modifier mon profil' : 'Suivre'}
          </Button>
          <Button
            variant="secondary"
            aria-label="Partager le profil"
            onClick={() => flash('Lien de partage copié')}
            className="w-11 flex-none px-0"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M8 10.5V2m0 0L4.8 5.2M8 2l3.2 3.2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M2.5 9.5v3a1.5 1.5 0 001.5 1.5h8a1.5 1.5 0 001.5-1.5v-3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between px-5 pt-6.5 pb-3 sm:px-6">
        <Eyebrow as="h3">Collections</Eyebrow>
        <span className="text-xs leading-none text-fg2">Tout voir</span>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5 sm:px-6 md:grid-cols-3 lg:grid-cols-4">
        {COLLECTIONS.map((c) => {
          // Every collection is a list belonging to this profile. Real slugs
          // arrive with the API in P6.
          const to = `/u/${handle ?? 'sophie'}/listes/${c.id}`;
          return (
            /*
              Card and heart are siblings, not nested buttons: a button inside a
              button is invalid markup and browsers disagree on how to focus it.
              The heart is positioned against the cover wrapper so it stays put
              regardless of how tall the caption below runs.
            */
            <div key={c.id}>
              <div className="relative">
                <Link
                  to={to}
                  aria-label={`Ouvrir la collection ${c.name}`}
                  className="block w-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <PlaceholderArt
                    label="COUVERTURE"
                    hatch={5}
                    className="aspect-[1.05] w-full overflow-hidden rounded-xl transition-transform hover:scale-[1.01]"
                  />
                </Link>
                <button
                  aria-label={`Aimer ${c.name}`}
                  aria-pressed={!!state.liked[c.id]}
                  onClick={() => dispatch({ type: 'toggleLike', id: c.id })}
                  className={cn(
                    'absolute right-2 bottom-2 flex h-6.5 w-6.5 items-center justify-center rounded-full bg-glass text-xs leading-none backdrop-blur-[10px]',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                    state.liked[c.id]
                      ? 'text-accent motion-safe:animate-[kBeat_.4s]'
                      : 'text-fg3 hover:text-fg2',
                  )}
                >
                  ♥
                </button>
              </div>
              <Link
                to={to}
                className="block w-full rounded-sm px-1 pt-2.5 pb-0.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span className="block text-[0.84375rem] leading-snug font-semibold text-fg">
                  {c.name}
                </span>
                <span className="mt-1 block font-mono text-xs leading-none text-fg3">
                  {c.count}
                </span>
              </Link>
            </div>
          );
        })}
      </div>
    </ScreenShell>
  );
}
