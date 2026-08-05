import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { RootLayout } from './RootLayout';
import { AppLayout } from './AppLayout';
import { RouteError } from './RouteError';
import { RequireAuth } from './RequireAuth';
import { AddWish } from '../screens/AddWish';
import { GiftDetail } from '../screens/GiftDetail';
import { Home } from '../screens/Home';
import { Notifications } from '../screens/Notifications';
import { Onboarding } from '../screens/Onboarding';
import { Profile } from '../screens/Profile';
import { Search } from '../screens/Search';
import { SignIn } from '../screens/SignIn';
import { Settings } from '../screens/Settings';
import { Wishlist } from '../screens/Wishlist';

/**
 * The route table that replaces the ScreenId union and the
 * Record<ScreenId, ComponentType> dispatch in components/Screen.tsx.
 *
 * Two entries of that union do not survive the move, deliberately:
 *
 *   - `empty` was a screen in the gallery. An empty list is a *state* of the
 *     wishlist route, not somewhere you navigate to, so it becomes a component
 *     the route renders when it has nothing to show.
 *   - `error` becomes `errorElement`, so a thrown loader error or a bad URL
 *     lands there by itself instead of requiring a dispatch to it.
 *
 * That is the point where the prototype's "screen gallery" framing dies: URLs
 * describe what you are looking at, not which mock you selected.
 *
 * `detail` and `pot` shared one component and now share one route, with the
 * pot as a child segment — a pot is a section of a gift, not a sibling of it.
 */
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      // Outside the guard, for obvious reasons.
      { path: '/connexion', element: <SignIn /> },
      { path: '/bienvenue', element: <Onboarding /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { index: true, element: <Home /> },
              { path: 'recherche', element: <Search /> },
              { path: 'notifications', element: <Notifications /> },
              { path: 'moi', element: <Profile /> },
              { path: 'u/:handle', element: <Profile /> },
              { path: 'u/:handle/listes/:slug', element: <Wishlist /> },
              {
                path: 'u/:handle/listes/:slug/:itemId',
                element: <GiftDetail />,
                children: [
                  // The pot renders inside the gift detail; the extra segment
                  // exists so it is linkable and back-navigable on its own.
                  { path: 'cagnotte', element: null },
                ],
              },
              {
                path: 'ajouter',
                element: <Navigate to="/ajouter/lien" replace />,
              },
              // addStep 0/1/2 in the reducer becomes two addressable steps; the
              // intermediate "analysing" state is a loading state of `lien`,
              // not a place you can navigate to.
              { path: 'ajouter/lien', element: <AddWish /> },
              { path: 'ajouter/details', element: <AddWish /> },
              { path: 'parametres', element: <Settings /> },
            ],
          },
        ],
      },
      { path: '*', element: <RouteError notFound /> },
    ],
  },
];

export const router = createBrowserRouter(routes, {
  basename: import.meta.env.BASE_URL.replace(/\/$/, '') || undefined,
});
