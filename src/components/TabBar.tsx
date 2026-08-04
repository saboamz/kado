import { NavLink } from 'react-router-dom';
import { cn } from '../ui';

type Tab = {
  to: string;
  label: string;
  glyph: string;
  /** Match this path exactly, so "/" is not active on every route. */
  end?: boolean;
  /** The raised accent button in the middle. */
  fab?: boolean;
};

const TABS: Tab[] = [
  { to: '/', label: 'Accueil', glyph: '▢', end: true },
  { to: '/recherche', label: 'Recherche', glyph: '○' },
  { to: '/ajouter/lien', label: 'Ajouter', glyph: '+', fab: true },
  { to: '/notifications', label: 'Alertes', glyph: '◎' },
  { to: '/moi', label: 'Profil', glyph: '●' },
];

/**
 * Primary navigation.
 *
 * Was a row of buttons dispatching `{type:'go'}`; now a row of NavLinks, so the
 * active state comes from the URL rather than from a `tab` field that had to be
 * kept in sync with `screen` through a TAB_OF lookup.
 *
 * Responsive shape: a bottom bar on phones (thumb reach) and a left rail from
 * `md` up, where a full-width bottom bar on a 1440px display would be absurd.
 */
export function TabBar() {
  return (
    <nav
      aria-label="Navigation principale"
      className={cn(
        'fixed z-50 border-line bg-glass backdrop-blur-[22px]',
        // Phone: bottom bar, padded for the home indicator.
        'inset-x-0 bottom-0 flex h-[calc(5rem+env(safe-area-inset-bottom))] items-start border-t px-2 pt-3 pb-[env(safe-area-inset-bottom)]',
        // Desktop: left rail.
        'md:inset-y-0 md:right-auto md:left-0 md:h-full md:w-20 md:flex-col md:justify-center md:gap-2 md:border-t-0 md:border-r md:px-0 md:pt-0 md:pb-0',
      )}
    >
      {TABS.map(({ to, label, glyph, end, ...rest }) => {
        const fab = 'fab' in rest && rest.fab;
        return (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={label}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 pt-0.5 md:flex-none md:py-2',
              'rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            )}
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden
                  className={cn(
                    'flex items-center justify-center transition-colors',
                    fab
                      ? 'text-on-accent -mt-1.5 h-11 w-11 rounded-xl bg-accent text-2xl leading-none shadow-[0_10px_22px_-10px_var(--color-accent-glow)] md:mt-0'
                      : cn(
                          'h-6.5 w-6.5 text-[1.0625rem] leading-none',
                          isActive ? 'text-fg' : 'text-fg3',
                        ),
                  )}
                >
                  {glyph}
                </span>
                {!fab && (
                  <span
                    className={cn(
                      'text-[0.59375rem] leading-none font-medium transition-colors',
                      isActive ? 'text-fg' : 'text-fg3',
                    )}
                  >
                    {label}
                  </span>
                )}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
