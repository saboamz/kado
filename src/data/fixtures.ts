import type { Gift } from './types';

export const GIFTS: Gift[] = [
  {
    id: 'g1',
    name: 'AirPods Pro 3',
    price: '279 €',
    prio: 3,
    cat: 'Tech',
    art: 'PHOTO PRODUIT',
    desc: "Réduction de bruit active. Taille d'embouts M, version USB-C de préférence.",
    merchant: 'Apple Store',
    url: 'apple.com/fr/airpods-pro',
  },
  {
    id: 'g2',
    name: 'Cafetière Chemex 6 tasses',
    price: '52 €',
    prio: 2,
    cat: 'Maison',
    art: 'PHOTO PRODUIT',
    desc: 'Modèle classique en verre, avec les filtres blancs si possible.',
    merchant: 'La Brûlerie',
    url: 'labrulerie.fr/chemex-6',
  },
  {
    id: 'g3',
    name: 'MacBook Air 15″ M4',
    price: '1 599 €',
    prio: 3,
    cat: 'Tech',
    art: 'PHOTO PRODUIT',
    desc: 'Pour remplacer le vieux modèle 2018. Couleur minuit, 16 Go de mémoire.',
    merchant: 'Apple Store',
    url: 'apple.com/fr/macbook-air',
    pot: true,
  },
  {
    id: 'g4',
    name: 'Week-end en Islande',
    price: '1 240 €',
    prio: 2,
    cat: 'Voyage',
    art: 'IDÉE LIBRE',
    desc: 'Trois nuits près de Reykjavík, plutôt en février pour les aurores.',
    merchant: 'Idée libre',
    url: 'aucun lien',
    pot: true,
  },
  {
    id: 'g5',
    name: 'Vase en grès émaillé',
    price: '68 €',
    prio: 1,
    cat: 'Maison',
    art: 'PHOTO PRODUIT',
    desc: 'Atelier français, teinte sable. Environ 25 cm de haut.',
    merchant: 'Sessùn',
    url: 'sessun.com/vase-gres',
  },
  {
    id: 'g6',
    name: 'Sac de randonnée 30 L',
    price: '135 €',
    prio: 2,
    cat: 'Sport',
    art: 'PHOTO PRODUIT',
    desc: 'Dos ventilé, coloris sombre. Pour les sorties à la journée.',
    merchant: 'Décathlon',
    url: 'decathlon.fr/mh500-30l',
  },
];

export const POT_TOTAL = 1599;

export const SCREEN_LABELS: [string, string][] = [
  ['onboarding', 'Onboarding'],
  ['home', 'Accueil'],
  ['search', 'Recherche'],
  ['notifs', 'Notifications'],
  ['profile', 'Profil'],
  ['list', 'Liste de souhaits'],
  ['detail', 'Détail cadeau'],
  ['pot', 'Cadeau collaboratif'],
  ['add', 'Ajouter une envie'],
  ['settings', 'Paramètres'],
  ['empty', 'État vide'],
  ['error', "Écran d'erreur"],
];

export const stars = (n: number) => '★★★'.slice(0, n) + '☆☆☆'.slice(0, 3 - n);

export const PRIO_LABEL = [
  '',
  'Ce serait sympa',
  "J'en ai vraiment envie",
  'Coup de cœur',
] as const;

export const euros = (n: number) => `${n.toLocaleString('fr-FR')} €`;
