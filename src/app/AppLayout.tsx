import { Outlet, useLocation } from 'react-router-dom';
import { TabBar } from '../components/TabBar';

/**
 * The navigation shell.
 *
 * Replaces PhoneFrame: instead of a 393x852 titanium bezel with an absolutely
 * positioned scroll area inside it, the page itself scrolls and the nav is
 * fixed. The `md:pl-20` offsets the desktop rail.
 *
 * The prototype decided tab-bar visibility from a WITH_NAV array of screen ids
 * (components/Screen.tsx). Detail, pot, add and settings are pushed views —
 * they get a back affordance rather than tabs — so that list survives as a
 * path check.
 */
const NAVLESS = ['/ajouter', '/parametres'];

export function AppLayout() {
  const { pathname } = useLocation();
  const isDetail = /^\/u\/[^/]+\/listes\/[^/]+\/[^/]+/.test(pathname);
  const showNav = !isDetail && !NAVLESS.some((p) => pathname.startsWith(p));

  return (
    // The rail is 5rem wide and fixed, so the content column is offset by it.
    // Padding it symmetrically keeps the column centred in the *remaining*
    // space rather than pushed right by the width of the nav.
    <div className={showNav ? 'md:px-20' : ''}>
      {/* Skip link: the first thing a keyboard user meets, and the app had
          nothing of the kind. */}
      <a
        href="#contenu"
        className="sr-only rounded-lg bg-accent px-4 py-2 text-on-accent focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-100"
      >
        Aller au contenu
      </a>
      <main id="contenu">
        <Outlet />
      </main>
      {showNav && <TabBar />}
    </div>
  );
}
