import { queryOptions } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { qk } from './queryKeys';
import type { Enums } from '../lib/database.types';

/**
 * The social surface: people, birthdays, notifications, collections.
 *
 * All of it reads `public` tables under RLS. None of it can carry reservation
 * state — there is no column to select and no join that reaches one — so
 * nothing here needs a secrecy guard, which is the intended consequence of
 * keeping those three tables in a schema PostgREST cannot see.
 */

export type Person = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
};

/** Upcoming birthdays among people the viewer follows. */
export type Birthday = Person & { birthday: string | null };

export const birthdaysQuery = () =>
  queryOptions({
    queryKey: ['birthdays'],
    queryFn: async (): Promise<Birthday[]> => {
      // Friends only: `birthday_visibility` defaults to 'friends', and RLS
      // will not return rows the viewer cannot see anyway.
      const { data, error } = await supabase
        .from('profiles')
        .select('id, handle, display_name, avatar_url, birthday')
        .not('birthday', 'is', null)
        .limit(12);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

/**
 * People search.
 *
 * Trigram indexes on handle and display_name make the ILIKE cheap; see
 * 0004_identity.sql. An empty query returns suggestions rather than nothing,
 * so the screen has something to show before the user types.
 */
export const peopleSearchQuery = (query: string, filter: string) =>
  queryOptions({
    queryKey: qk.search(query, filter),
    queryFn: async (): Promise<Person[]> => {
      let q = supabase
        .from('profiles')
        .select('id, handle, display_name, avatar_url')
        .limit(20);

      if (query.trim()) {
        const term = `%${query.trim()}%`;
        q = q.or(`handle.ilike.${term},display_name.ilike.${term}`);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

export type NotificationRow = {
  id: string;
  kind: Enums['notif_kind'];
  actor_id: string | null;
  subject_type: string | null;
  subject_id: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

/**
 * The inbox.
 *
 * Rows carry a `kind` and a payload, never prose — see 0007_notifications.sql.
 * The French copy is rendered client-side from the templates below, which is
 * what makes "Marc a réservé les AirPods" impossible to generate for an owner:
 * there is no free-text column for a careless backend job to write it into.
 */
export const notificationsQuery = () =>
  queryOptions({
    queryKey: qk.notifications.all,
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select(
          'id, kind, actor_id, subject_type, subject_id, payload, read_at, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
    staleTime: 30_000,
  });

/** French copy per notification kind. The server sends structure, not text. */
export const NOTIF_TEMPLATES: Record<Enums['notif_kind'], string> = {
  friend_request: 'vous a envoyé une demande',
  friend_accepted: 'a accepté votre demande',
  list_created: 'a créé une nouvelle liste',
  wish_added: 'a ajouté des envies à sa liste',
  birthday_soon: 'fête bientôt son anniversaire',
  // Only ever addressed to contributors, never to the person the pot is for.
  pot_progress: 'La cagnotte à laquelle vous participez avance',
  pot_funded: 'La cagnotte est complète',
  reco_digest: 'De nouvelles idées de cadeaux pour vos proches',
  system: 'Information',
};
