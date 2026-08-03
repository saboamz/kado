export const ADD_LISTS = ['Anniversaire', 'Noël', 'Maison', 'Geek'];

export const ADD_METHODS = [
  {
    icon: 'Q',
    title: 'Rechercher un produit',
    sub: 'Amazon, Fnac, Apple et 40 boutiques',
  },
  {
    icon: '+',
    title: 'Écrire une idée libre',
    sub: '« Week-end en Islande », sans lien',
  },
  {
    icon: '★',
    title: 'Reprendre une envie passée',
    sub: "12 idées gardées de l'an dernier",
  },
];

/** What the fake scraper "finds" once a link is analysed. */
export const SCRAPED = {
  name: 'AirPods Pro 3',
  price: '279 €',
  source: 'apple.com · récupéré automatiquement',
  desc: 'Réduction de bruit, taille M. Plutôt la version USB-C.',
};

/** How long the fake link analysis runs. */
export const ANALYZE_MS = 1100;
