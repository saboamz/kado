import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PlaceholderArt } from '../components/Placeholder';
import { Skeleton } from '../components/Skeleton';
import { peopleSearchQuery } from '../api/social';
// Static UI copy, not data: the filter labels are the same four whoever is
// looking, so there is nothing for a query to return here.
import { SEARCH_FILTERS } from '../data/social';
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
   * Results follow the URL, so the query key does too: typing re-runs this,
   * and Back to a previous `?q=` serves that result from cache rather than
   * refetching it.
   */
  const people = useQuery(peopleSearchQuery(query, filter));

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

      {people.isPending ? (
        <div className="flex flex-col gap-1">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-16.5 rounded-xl" />
          ))}
        </div>
      ) : people.data?.length === 0 ? (
        <p role="status" className="px-2 py-6 text-sm leading-snug text-fg2">
          Aucun résultat pour «&nbsp;{query}&nbsp;».
        </p>
      ) : (
        <ul className="flex list-none flex-col gap-1 p-0">
          {people.data?.map((p) => (
            <li key={p.id}>
              <Link
                to={`/u/${p.handle}`}
                className={cn(
                  'flex items-center gap-3.5 rounded-xl px-2 py-2.5 text-left',
                  'transition-colors hover:bg-surface',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                )}
              >
                <PlaceholderArt round className="h-11.5 w-11.5 flex-none" />
                <div className="min-w-0 flex-1">
                  <div className="text-base leading-tight font-semibold text-fg">
                    {p.display_name}
                  </div>
                  {/*
                    The fixture put "6 listes · anniversaire le 14 mars" here.
                    Both halves are things this row cannot know — the list count
                    needs an aggregate nobody selects, and a birthday is
                    friends-only data that has no business in a search result
                    for a stranger. The handle is the honest secondary line: it
                    is on the row already, and it is what disambiguates two
                    people with the same display name.
                  */}
                  <div className="mt-0.5 truncate text-sm leading-snug text-fg2">
                    @{p.handle}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ScreenShell>
  );
}
