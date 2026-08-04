import { Link, useSearchParams } from 'react-router-dom';
import { PlaceholderArt } from '../components/Placeholder';
import { PEOPLE, SEARCH_FILTERS } from '../data/social';
import { Chip, Eyebrow, ScreenShell, cn } from '../ui';

const DEFAULT_FILTER = SEARCH_FILTERS[0];

export function Search() {
  /**
   * The query and the filter live in the URL rather than in the store.
   *
   * This is the whole point of the move: `/recherche?q=sophie&f=Listes` is a
   * result you can bookmark, share and hit Back out of. The prototype's
   * `state.query` could do none of those.
   */
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const filter = params.get('f') ?? DEFAULT_FILTER;

  /**
   * `replace` keeps the history stack usable: typing eight characters should
   * not cost eight Back presses to escape.
   */
  function patch(next: { q?: string; f?: string }) {
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(next)) {
          // An empty query is the default state, so it belongs out of the URL
          // rather than in it as `?q=`.
          if (value) out.set(key, value);
          else out.delete(key);
        }
        return out;
      },
      { replace: true },
    );
  }

  return (
    <ScreenShell>
      <h2 className="mb-4.5 text-4xl leading-tight font-bold tracking-tighter text-fg">
        Rechercher
      </h2>

      <div className="mb-4 flex h-11.5 items-center gap-2.5 rounded-xl bg-surface px-3.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
        <svg
          width="15"
          height="15"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          className="flex-none text-fg opacity-50"
        >
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
          <line
            x1="10.8"
            y1="10.8"
            x2="14"
            y2="14"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <input
          value={query}
          onChange={(e) => patch({ q: e.target.value })}
          placeholder="Amis, listes, cadeaux…"
          aria-label="Rechercher"
          // The ring is on the wrapper (focus-within) so it frames the whole
          // field including the icon, not just the text box.
          className="min-w-0 flex-1 border-0 bg-transparent text-lg leading-none text-fg outline-none placeholder:text-fg3"
        />
      </div>

      <div role="group" aria-label="Filtres" className="mb-5.5 flex flex-wrap gap-2">
        {SEARCH_FILTERS.map((label) => (
          <Chip
            key={label}
            selected={filter === label}
            onClick={() => patch({ f: label })}
          >
            {label}
          </Chip>
        ))}
      </div>

      <Eyebrow className="mb-3 ml-0.5">
        {filter === 'Amis' ? 'Suggestions' : filter}
      </Eyebrow>

      <ul className="flex list-none flex-col gap-1 p-0">
        {PEOPLE.map((p) => (
          <li key={p.name}>
            <Link
              to="/u/sophie"
              className={cn(
                'flex items-center gap-3.5 rounded-xl px-2 py-2.5 text-left',
                'transition-colors hover:bg-surface',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              )}
            >
              <PlaceholderArt round className="h-11.5 w-11.5 flex-none" />
              <div className="min-w-0 flex-1">
                <div className="text-base leading-tight font-semibold text-fg">
                  {p.name}
                </div>
                <div className="mt-0.5 text-sm leading-snug text-fg2">
                  {p.meta}
                </div>
              </div>
              {/* A label, not a control — the row itself is the only action. */}
              <span
                className={cn(
                  'flex-none rounded-md px-2.5 py-1.5 text-xs leading-none font-medium whitespace-nowrap',
                  p.badgeLabel === 'Ajouter'
                    ? 'bg-accent text-on-accent'
                    : 'bg-surface text-fg2',
                )}
              >
                {p.badgeLabel}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </ScreenShell>
  );
}
