import type { ScreenId } from './types';

export const BIRTHDAYS = [
  { name: 'Sophie', when: 'dans 12 j', hot: true },
  { name: 'Thomas', when: 'dans 24 j' },
  { name: 'Emma', when: 'dans 1 mois' },
  { name: 'Paul', when: 'dans 2 mois' },
];

export const FEED: {
  text: string;
  time: string;
  tag: string;
  to: ScreenId;
}[] = [
  {
    text: 'Sophie fête son anniversaire dans 12 jours. Sa liste compte 8 envies.',
    time: "Aujourd'hui",
    tag: 'Anniversaire',
    to: 'profile',
  },
  {
    text: "Thomas vient d'ajouter 4 cadeaux à sa liste Maison.",
    time: 'Il y a 2 h',
    tag: 'Nouveautés',
    to: 'list',
  },
  {
    text: "La cagnotte du MacBook d'Élise atteint 650 € sur 1 599 €.",
    time: 'Hier',
    tag: 'Cagnotte',
    to: 'pot',
  },
  {
    text: 'Emma a créé une nouvelle liste : Mariage.',
    time: 'Lundi',
    tag: 'Nouvelle liste',
    to: 'list',
  },
];

export const SEARCH_FILTERS = ['Amis', 'Profils', 'Listes', 'Cadeaux'];

export const PEOPLE = [
  {
    name: 'Sophie Marchand',
    meta: '6 listes · anniversaire le 14 mars',
    badgeLabel: 'Amie',
  },
  { name: 'Thomas Bel', meta: '3 listes · 22 envies', badgeLabel: 'Ami' },
  {
    name: 'Emma Roux',
    meta: 'Liste Mariage · 14 envies',
    badgeLabel: 'Ajouter',
  },
  {
    name: 'Lucas Ferrand',
    meta: "Vient d'ajouter 5 envies",
    badgeLabel: 'Ajouter',
  },
  { name: 'Équipe Design', meta: 'Groupe · 9 membres', badgeLabel: 'Groupe' },
];

export const NOTIFICATIONS = [
  { who: 'Emma', text: 'a créé une liste Noël.', time: '12 min', unread: true },
  {
    who: 'Lucas',
    text: "vient d'ajouter 5 envies à sa liste Geek.",
    time: '1 h',
    unread: true,
  },
  {
    who: 'Cagnotte MacBook',
    text: 'atteint 41 % — il reste 949 €.',
    time: '3 h',
    unread: true,
    hot: true,
  },
  { who: 'Paul', text: 'fête son anniversaire dans 6 jours.', time: 'Hier' },
  { who: 'Thomas', text: 'a partagé sa liste Voyage avec vous.', time: '2 j' },
  {
    who: 'Kado',
    text: 'Pensez à mettre à jour votre liste Anniversaire.',
    time: '4 j',
  },
];

export const INTERESTS = ['Céramique', 'Café', 'Randonnée', 'Design'];

export const COLLECTIONS: {
  id: string;
  name: string;
  count: string;
  to: 'list' | 'empty';
}[] = [
  { id: 'c1', name: 'Anniversaire', count: '8 envies', to: 'list' },
  { id: 'c2', name: 'Maison', count: '12 envies', to: 'list' },
  { id: 'c3', name: 'Voyage', count: '5 envies', to: 'list' },
  { id: 'c4', name: 'Noël', count: '0 envie', to: 'empty' },
  { id: 'c5', name: 'Sport', count: '6 envies', to: 'list' },
  { id: 'c6', name: 'Geek', count: '10 envies', to: 'list' },
];

export const PROFILE_STATS = [
  { value: '6', label: 'Listes' },
  { value: '41', label: 'Envies' },
  { value: '12', label: 'Reçus' },
];

export const PROFILE_BIO =
  'Café filtre, céramique et randonnées. Anniversaire le 14 mars.';
