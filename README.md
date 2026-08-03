# Kado

> Des listes de souhaits que vos proches remplissent en secret.

React port of the **Kado — Prototype iOS** design: 12 screens, two points of
view (owner / friend), light and dark themes.

## The rule this app is built around

**The owner never learns that a gift has been reserved.** Not who reserved it,
not how many are taken, not that anything happened at all. The surprise is
structural, not a setting.

That rule is enforced in one place:

```ts
// src/state/store.tsx
export function useReservation(giftId: string): Reserver | null {
  const { state } = useStore();
  if (state.role === 'owner') return null;
  return state.reserved[giftId] ?? null;
}
```

Screens never read `state.reserved` directly. An owner is handed `null`, so
there is no reservation state for a component to accidentally render — no
badge, no counter, no disabled button hinting at what lies underneath. The data
survives the role switch untouched; it simply stops being reported.

`src/App.test.tsx` walks the whole journey: reserve as a friend, switch to
owner, assert every trace is gone, switch back, find the reservation intact.

## Screens

| # | Screen | # | Screen |
| --- | --- | --- | --- |
| 01 | Onboarding | 07 | Détail cadeau |
| 02 | Accueil | 08 | Cadeau collaboratif |
| 03 | Recherche | 09 | Ajouter une envie |
| 04 | Notifications | 10 | Paramètres |
| 05 | Profil | 11 | État vide |
| 06 | Liste de souhaits | 12 | Écran d'erreur |

## Getting started

```bash
npm install
npm run dev
```

Use the sidebar to jump between screens, and the toggles top-right to switch
role and theme.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Typecheck and build for production |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Lint with ESLint |
| `npm test` | Run the test suite |

## Architecture

```
src/
  components/   device chrome (frame, status bar, tab bar) and shared UI
  screens/      one file per screen, registered in components/Screen.tsx
  state/        the store, and the reservation selectors that hold the rule
  theme/        design tokens, light/dark context, style helpers
  data/         types and fixtures
```

State is a `useReducer` store with typed actions. There is no backend: all data
comes from `src/data/`, and the link "analysis" in the add flow is a timeout.

Screens are registered in a `Record<ScreenId, ComponentType>` — adding a screen
id without a matching component is a compile error.

## Contributing

`main` is protected; every change lands through a pull request.

```bash
git checkout -b my-change
npm run lint && npm run build && npm test
gh pr create
```
