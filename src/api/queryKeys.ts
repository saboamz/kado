/**
 * Every query key in one place.
 *
 * Keys are built here rather than inline so that invalidation cannot miss a
 * consumer: `qk.reservations.all` is the prefix every reservation query shares,
 * so invalidating it catches them all whatever their arguments.
 */
export const qk = {
  session: ['session'] as const,

  profile: {
    all: ['profile'] as const,
    byHandle: (handle: string) => ['profile', 'handle', handle] as const,
    me: () => ['profile', 'me'] as const,
  },

  wishlists: {
    all: ['wishlists'] as const,
    ofUser: (handle: string) => ['wishlists', 'user', handle] as const,
    one: (handle: string, slug: string) =>
      ['wishlists', 'user', handle, slug] as const,
  },

  /**
   * Reservation state is keyed by wishlist, not by item: it arrives as one
   * RPC call per list, and keying per item would fan a single round trip into
   * N cache entries that can disagree with each other.
   */
  reservations: {
    all: ['reservations'] as const,
    ofList: (wishlistId: string) => ['reservations', wishlistId] as const,
  },

  pot: {
    all: ['pot'] as const,
    ofItem: (itemId: string) => ['pot', itemId] as const,
  },

  notifications: { all: ['notifications'] as const },
  search: (query: string, filter: string) =>
    ['search', query, filter] as const,
} as const;
