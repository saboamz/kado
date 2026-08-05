import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { settingsGroups } from '../data/settings';
import { useStore } from '../state/store';
import { useViewer } from '../auth/SessionContext';
import { supabase } from '../lib/supabase';
import { Card, Eyebrow, ScreenShell, cn } from '../ui';

export function Settings() {
  /**
   * The theme is the one thing on this screen that is genuinely client state,
   * so it is the one thing still coming from the store. Everything else is a
   * static row awaiting a real settings API.
   */
  const { state, dispatch } = useStore();
  const viewer = useViewer();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await supabase.auth.signOut();
    // Clear the cache, don't just invalidate it: cached wishlists and
    // reservation state belong to the session that just ended, and leaving
    // them in memory means the next person to sign in on this device sees a
    // flash of someone else's data before the refetch lands.
    queryClient.clear();
    navigate('/connexion', { replace: true });
  }

  return (
    <ScreenShell>
      <h2 className="mb-5 text-4xl leading-tight font-bold tracking-tighter text-fg">
        Paramètres
      </h2>

      {settingsGroups(state.dark).map((group) => (
        <section key={group.title} className="mb-6">
          <Eyebrow as="h3" className="mb-2.5 ml-0.5">
            {group.title}
          </Eyebrow>

          <Card pad="none" radius="xl" className="overflow-hidden">
            {group.rows.map((row, i) => {
              // The theme row is the only live control here: it reflects and
              // flips the store, while its siblings are still display-only.
              const isTheme = row.label === 'Thème';
              const content = (
                <>
                  <div className="flex-1 text-left">
                    <div className="text-base leading-tight font-medium text-fg">
                      {row.label}
                    </div>
                    {row.sub && (
                      <div className="mt-1 text-xs leading-snug text-fg3">
                        {row.sub}
                      </div>
                    )}
                  </div>
                  <span className="font-mono text-sm leading-none whitespace-nowrap text-fg2">
                    {row.value}
                  </span>
                </>
              );

              const rowClass = cn(
                'flex w-full items-center gap-3 px-4 py-3.5',
                i && 'border-t border-line',
              );

              return isTheme ? (
                <button
                  key={row.label}
                  type="button"
                  // A switch, not a link: it changes state in place rather than
                  // navigating, and its pressed state is the theme itself.
                  aria-pressed={state.dark}
                  onClick={() => dispatch({ type: 'setDark', dark: !state.dark })}
                  className={cn(
                    rowClass,
                    'transition-colors hover:bg-chip',
                    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
                  )}
                >
                  {content}
                </button>
              ) : (
                <div key={row.label} className={rowClass}>
                  {content}
                </div>
              );
            })}
          </Card>
        </section>
      ))}

      <Card tone="soft" radius="xl" className="px-4.5 py-4">
        <div className="mb-1 text-sm leading-snug font-semibold text-fg">
          Le secret est garanti côté serveur
        </div>
        <div className="text-sm leading-relaxed text-pretty text-fg2">
          Les réservations et les cagnottes ne sont jamais renvoyées dans
          l&rsquo;API du propriétaire, même chiffrées.
        </div>
      </Card>

      {viewer && (
        <section className="mt-6">
          <Eyebrow as="h3" className="mb-2.5 ml-0.5">
            Compte
          </Eyebrow>
          <Card pad="none" radius="xl" className="overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="flex-1 text-left">
                <div className="text-base leading-tight font-medium text-fg">
                  {viewer.displayName}
                </div>
                <div className="mt-1 font-mono text-xs leading-snug text-fg3">
                  @{viewer.handle}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={signOut}
              className={cn(
                'flex w-full items-center px-4 py-3.5 text-left',
                'border-t border-line text-base font-medium text-accent',
                'transition-colors hover:bg-chip',
                'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
              )}
            >
              Se déconnecter
            </button>
          </Card>
        </section>
      )}
    </ScreenShell>
  );
}
