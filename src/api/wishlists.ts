import { queryOptions } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { qk } from './queryKeys';
import type { WishItem } from '../lib/database.types';

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

export const wishlistsOfUserQuery = (handle: string | undefined) =>
  queryOptions({
    queryKey: qk.wishlists.ofUser(handle ?? ''),
    enabled: Boolean(handle),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wishlists')
        .select('id, title, slug, occasion, event_date, cover_url, owner_id')
        .eq('owner_id', handle!)
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
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
