import { queryOptions } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { qk } from './queryKeys';
import type { WishItem } from '../lib/database.types';

/**
 * A wish item plus the presentation fields the catalogue will own.
 *
 * `art`, `cat`, `merchant` and `url` come from a product in P7. Until then the
 * transport carries them on the row so the screens keep their hatch
 * placeholders and merchant card; typing them optional here means the screens
 * are already written against their eventual absence.
 */
export type WishItemView = WishItem & {
  art?: string;
  cat?: string;
  merchant?: string;
  url?: string;
};

/**
 * Wishlists and the wishes inside them.
 *
 * Everything here reads `public` tables under RLS. Note what these rows do NOT
 * carry: any hint of reservation state. That is not an omission in the select
 * — there is no such column on wish_items, deliberately, because a reservation
 * writing to the owner's row would be a Realtime timing oracle. Reservation
 * state comes separately, from the RPC in ./reservations.ts.
 */

export type WishlistWithItems = {
  id: string;
  title: string;
  slug: string | null;
  occasion: string | null;
  event_date: string | null;
  cover_url: string | null;
  owner: { id: string; handle: string; display_name: string };
  items: WishItem[];
};

export const wishlistQuery = (
  handle: string | undefined,
  slug: string | undefined,
) =>
  queryOptions({
    queryKey: qk.wishlists.one(handle ?? '', slug ?? ''),
    enabled: Boolean(handle && slug),
    queryFn: async (): Promise<WishlistWithItems | null> => {
      const { data, error } = await supabase
        .from('wishlists')
        .select(
          `id, title, slug, occasion, event_date, cover_url,
           owner:profiles!inner(id, handle, display_name),
           items:wish_items(*)`,
        )
        .eq('profiles.handle', handle!)
        .eq('slug', slug!)
        .is('archived_at', null)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const row = data as unknown as WishlistWithItems;
      return {
        ...row,
        items: (row.items ?? [])
          .filter((i) => i.status === 'active')
          .sort((a, b) => a.position - b.position),
      };
    },
  });

/**
 * Every list a person owns.
 *
 * Takes an OWNER ID, not a handle. The parameter was called `handle` while the
 * filter compared it against `owner_id`, which is a uuid — so every call with a
 * real handle matched zero rows and returned an empty list rather than an
 * error. Renamed so the type of thing it wants is visible at the call site.
 */
export const wishlistsOfUserQuery = (ownerId: string | undefined) =>
  queryOptions({
    queryKey: qk.wishlists.ofUser(ownerId ?? ''),
    enabled: Boolean(ownerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wishlists')
        .select('id, title, slug, occasion, event_date, cover_url, owner_id')
        .eq('owner_id', ownerId!)
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

/**
 * The wishes in a list.
 *
 * Fetched separately from the list itself rather than as a PostgREST embed:
 * the two have different cache lifetimes — items change while you browse, the
 * list's title does not — and separating them means adding a wish invalidates
 * one small query instead of refetching the whole page.
 *
 * These rows carry NO reservation state. That is not an omission in the
 * select; there is no such column on wish_items, because a reservation writing
 * to the owner's own row would be a Realtime timing oracle. Reservation state
 * comes from the RPC in ./reservations.ts, separately and only for those
 * allowed to see it.
 */
export const wishItemsQuery = (wishlistId: string | undefined) =>
  queryOptions({
    queryKey: [...qk.wishlists.all, wishlistId, 'items'] as const,
    enabled: Boolean(wishlistId),
    queryFn: async (): Promise<WishItemView[]> => {
      const { data, error } = await supabase
        .from('wish_items')
        .select('*')
        .eq('wishlist_id', wishlistId!)
        .eq('status', 'active')
        .order('position');
      if (error) throw error;
      return (data ?? []) as WishItemView[];
    },
  });

export const profileQuery = (handle: string | undefined) =>
  queryOptions({
    queryKey: qk.profile.byHandle(handle ?? ''),
    enabled: Boolean(handle),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, handle, display_name, bio, avatar_url, interests')
        .eq('handle', handle!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    // Profiles change rarely; a minute of staleness costs nothing.
    staleTime: 60_000,
  });
