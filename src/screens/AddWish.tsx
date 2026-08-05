import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { PlaceholderArt } from '../components/Placeholder';
import { ScreenTitle } from '../components/ScreenTitle';
import { Skeleton } from '../components/Skeleton';
import { ADD_LISTS, ADD_METHODS } from '../data/add';
import {
  looksLikeUrl,
  scrapeUrl,
  type ScrapedProduct,
} from '../api/products';
import { stars } from '../data/fixtures';
import { useStore } from '../state/store';
import { Button, Card, Chip, Eyebrow, ScreenShell } from '../ui';

/**
 * The add flow.
 *
 * `addStep` was 0/1/2 in the global store. Steps 0 and 2 are now the two routes
 * `/ajouter/lien` and `/ajouter/details`, which makes the filled-in form
 * survive a reload and gives the browser Back button something sensible to do.
 *
 * Step 1 — "analysing" — deliberately did NOT become a route: it is a loading
 * state of step 0, and a URL you can navigate to but that means nothing without
 * the in-flight request would be a lie.
 *
 * The form draft (`link`, `addList`, `addPrio`) was global state for no reason;
 * nothing outside this screen ever read it. It is local useState until React
 * Hook Form lands with the real mutation in P6.
 */
/** Cents to a French price string. Never render raw cents to a user. */
function formatPrice(p: ScrapedProduct | null): string {
  if (!p || p.price_cents == null) return '';
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: p.currency || 'EUR',
    maximumFractionDigits: p.price_cents % 100 === 0 ? 0 : 2,
  }).format(p.price_cents / 100);
}

export function AddWish() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { flash } = useStore();

  const [link, setLink] = useState('');
  const [list, setList] = useState(ADD_LISTS[0]);
  const [prio, setPrio] = useState<1 | 2 | 3>(3);
  const [scraped, setScraped] = useState<ScrapedProduct | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The scrape can outlive the screen — someone pastes a link and hits back —
  // and resolving onto an unmounted tree would warn and set state nowhere.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const onDetails = pathname.endsWith('/details');

  const analysis = useMutation({
    mutationFn: (url: string) => scrapeUrl(url),
    onSuccess: (data) => {
      if (!alive.current) return;
      setScraped(data);
      setError(null);
      navigate('/ajouter/details');
    },
    onError: () => {
      if (!alive.current) return;
      // A link that cannot be read is an ordinary outcome — paywalls,
      // JS-only pages, a typo — so it offers the free-text path rather than
      // presenting itself as a failure of the app.
      setError(
        "Ce lien n'a pas pu être lu. Vous pouvez décrire l'envie vous-même.",
      );
    },
  });

  const loading = analysis.isPending;

  function analyze() {
    if (!looksLikeUrl(link)) {
      setError('Cette adresse ne ressemble pas à un lien.');
      return;
    }
    setError(null);
    analysis.mutate(link);
  }

  return (
    <ScreenShell>
      <ScreenTitle
        trailing={
          <Button
            variant="secondary"
            aria-label="Fermer"
            onClick={() => navigate('/')}
            className="h-8.5 w-8.5 flex-none rounded-full px-0 text-lg font-normal"
          >
            ×
          </Button>
        }
      >
        Ajouter une envie
      </ScreenTitle>

      {!onDetails && (
        <>
          <div className="mb-3 flex h-12.5 items-center gap-2.5 rounded-xl border-[1.5px] border-accent bg-bg px-3.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
            <span className="font-mono text-sm leading-none text-accent">
              URL
            </span>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Collez un lien Amazon, Apple…"
              aria-label="Lien du produit"
              // The ring is on the wrapper, so the input itself must not draw
              // a second one inside it.
              className="min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg3"
            />
          </div>

          <Button
            block
            size="lg"
            variant="secondary"
            onClick={analyze}
            disabled={loading}
            className="bg-fg text-bg hover:bg-fg/90 disabled:bg-surface disabled:text-fg2"
          >
            {loading ? 'Analyse du lien…' : 'Récupérer les informations'}
          </Button>

          {error && (
            // role="alert" so the failure is announced: it is the only
            // feedback, and a sighted user sees it appear while a screen
            // reader user would otherwise just wait.
            <p role="alert" className="mt-3 text-pretty text-sm text-accent">
              {error}
            </p>
          )}
        </>
      )}

      {loading && (
        <Card
          role="status"
          aria-live="polite"
          aria-label="Analyse du lien en cours"
          radius="lg"
          className="mt-5 flex items-center gap-3.5"
        >
          <Skeleton className="h-[74px] w-[74px] flex-none rounded-xl" />
          <div className="flex flex-1 flex-col gap-2">
            {['78%', '46%', '60%'].map((w) => (
              <Skeleton
                key={w}
                className="h-3 rounded-sm"
                // Width varies per row; Tailwind cannot build a class from a
                // runtime value, so it stays a style prop.
                style={{ width: w }}
              />
            ))}
          </div>
        </Card>
      )}

      {onDetails && (
        <div className="motion-safe:animate-[kPop_.4s_both]">
          <Card radius="xl" className="flex items-center gap-3.5">
            <PlaceholderArt
              label="PHOTO"
              className="h-[74px] w-[74px] flex-none rounded-xl"
            />
            <div className="min-w-0 flex-1">
              <p className="text-base leading-snug font-semibold text-fg">
                {scraped?.title ?? '—'}
              </p>
              <p className="mt-1.5 font-mono text-[0.8125rem] leading-none font-medium text-fg">
                {formatPrice(scraped)}
              </p>
              <p className="mt-1.5 text-xs leading-none text-fg3">
                {scraped?.source ?? ''}
              </p>
            </div>
          </Card>

          <div className="mt-4 flex flex-col gap-2.5">
            <div>
              <Eyebrow className="mb-2">Liste</Eyebrow>
              <div role="group" aria-label="Liste" className="flex flex-wrap gap-2">
                {ADD_LISTS.map((label) => (
                  <Chip
                    key={label}
                    selected={list === label}
                    onClick={() => setList(label)}
                  >
                    {label}
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <Eyebrow className="mb-2">Priorité</Eyebrow>
              <div role="group" aria-label="Priorité" className="flex gap-2">
                {([1, 2, 3] as const).map((n) => (
                  <Chip
                    key={n}
                    selected={prio === n}
                    aria-label={`Priorité ${n} sur 3`}
                    onClick={() => setPrio(n)}
                  >
                    {stars(n)}
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <Eyebrow className="mb-2">Description</Eyebrow>
              <Card radius="lg" className="min-h-16.5 px-3.5 py-3.5">
                <p className="text-[0.84375rem] leading-relaxed text-fg2">
                  {scraped?.description ?? ''}
                </p>
              </Card>
            </div>
          </div>

          <Button
            block
            size="lg"
            className="mt-4.5"
            onClick={() => {
              flash(`${scraped?.title ?? '—'} ajoutés à ${list}`);
              navigate('/u/sophie/listes/anniversaire');
            }}
          >
            Ajouter à ma liste
          </Button>
        </div>
      )}

      {!onDetails && !loading && (
        <div className="mt-6.5">
          <div className="mb-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-line" />
            <span className="font-mono text-xs leading-none tracking-eyebrow text-fg3">
              OU
            </span>
            <div className="h-px flex-1 bg-line" />
          </div>

          <div className="flex flex-col gap-2">
            {ADD_METHODS.map((m) => (
              <button
                key={m.title}
                onClick={() => flash('Bientôt disponible')}
                className="flex w-full items-center gap-3.5 rounded-2xl bg-surface p-4 text-left transition-colors hover:bg-chip focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span
                  aria-hidden
                  className="flex h-8.5 w-8.5 flex-none items-center justify-center rounded-lg bg-bg font-mono text-[0.8125rem] leading-none font-semibold text-accent"
                >
                  {m.icon}
                </span>
                <span className="flex-1">
                  <span className="block text-[0.84375rem] leading-snug font-semibold text-fg">
                    {m.title}
                  </span>
                  <span className="mt-0.5 block text-sm leading-snug text-fg2">
                    {m.sub}
                  </span>
                </span>
                <span aria-hidden className="text-[0.9375rem] text-fg3">
                  ›
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </ScreenShell>
  );
}
