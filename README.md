# Kado

> Des listes de souhaits que vos proches remplissent en secret.

React port of the **Kado — Prototype iOS** design: 12 screens, two points of view
(owner / friend), light and dark themes.

The product rule that drives the architecture: **the owner never sees who reserved
what.** There is no screen, badge, counter, or notification on the owner's side
that reveals a reservation. The surprise is structural, not a setting.

## Getting started

```bash
npm install
npm run dev
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Typecheck and build for production |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Lint with ESLint |
| `npm test` | Run the test suite |

## Contributing

`main` is protected. Every change lands through a pull request:

```bash
git checkout -b my-change
# ...
gh pr create
```
