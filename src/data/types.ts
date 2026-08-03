export type Role = 'owner' | 'friend';

export type ScreenId =
  | 'onboarding'
  | 'home'
  | 'search'
  | 'notifs'
  | 'profile'
  | 'list'
  | 'detail'
  | 'pot'
  | 'add'
  | 'settings'
  | 'empty'
  | 'error';

export type TabId = 'home' | 'search' | 'add' | 'notifs' | 'profile';

/** Who holds a reservation. `other` is any friend that is not the viewer. */
export type Reserver = 'you' | 'other';

export type Gift = {
  id: string;
  name: string;
  price: string;
  /** 1 = would be nice, 3 = really wants it. */
  prio: 1 | 2 | 3;
  cat: string;
  art: string;
  desc: string;
  merchant: string;
  url: string;
  /** Collaborative gift: friends chip in rather than one person buying it. */
  pot?: boolean;
};
