export type SettingsRow = { label: string; sub?: string; value: string };

/** `dark` drives the Apparence row, which mirrors the live theme. */
export const settingsGroups = (
  dark: boolean,
): { title: string; rows: SettingsRow[] }[] => [
  {
    title: 'Confidentialité',
    rows: [
      { label: 'Visibilité du profil', value: 'Amis uniquement' },
      {
        label: 'Profil public',
        sub: 'Accessible via un lien',
        value: 'Désactivé',
      },
      { label: 'Utilisateurs bloqués', value: '2' },
    ],
  },
  {
    title: 'Listes',
    rows: [
      { label: 'Gérer mes listes', value: '6' },
      { label: 'Liste par défaut', value: 'Anniversaire' },
      { label: 'Autoriser les cagnottes', value: 'Activé' },
    ],
  },
  {
    title: 'Notifications',
    rows: [
      { label: 'Anniversaires proches', value: '7 jours avant' },
      { label: 'Nouvelles envies des amis', value: 'Activé' },
      { label: 'Progression des cagnottes', value: 'Activé' },
    ],
  },
  {
    title: 'Apparence',
    rows: [
      {
        label: 'Thème',
        sub: 'Suit le réglage du système',
        value: dark ? 'Sombre' : 'Clair',
      },
      { label: 'Devise', value: 'EUR (€)' },
    ],
  },
];
