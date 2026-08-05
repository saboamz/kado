/**
 * Database types.
 *
 * Generated from the migrations in supabase/migrations/ by applying them to a
 * real Postgres and reading information_schema — not written by hand, and not
 * guessed from the SQL. Regenerate with `supabase gen types typescript` once
 * a project is linked; the shape is identical.
 *
 * Note what is absent: reservations, pots and contributions. They live in the
 * `private` schema, which PostgREST does not expose, so there is no client
 * type for them because there is no client access to them. Reach that data
 * through the RPCs in Functions below — see src/api/reservations.ts.
 *
 * `Relationships: []` on every table is a deliberate simplification: supabase-js
 * requires the key, and populating it would let TypeScript infer the shape of
 * `select('*, owner:profiles(...)')` embeds. Until `supabase gen types` runs
 * against a real project, embed results are cast at the call site instead —
 * see the cast in src/api/wishlists.ts, which is the cost of this shortcut.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Enums = {
  contribution_state: 'pending' | 'captured' | 'refunded' | 'failed';
  event_kind: 'view_product' | 'view_wish' | 'like_wish' | 'add_wish' | 'reserve' | 'unreserve' | 'purchase' | 'click_out' | 'contribute' | 'dismiss_reco';
  follow_state: 'pending' | 'accepted' | 'blocked';
  notif_kind: 'friend_request' | 'friend_accepted' | 'list_created' | 'wish_added' | 'birthday_soon' | 'pot_progress' | 'pot_funded' | 'reco_digest' | 'system';
  pot_state: 'open' | 'funded' | 'closed' | 'refunded';
  reco_strategy: 'cf_item' | 'cf_user' | 'content_vector' | 'content_facet' | 'popularity' | 'onboarding' | 'manual';
  reservation_state: 'held' | 'purchased' | 'released';
  visibility: 'private' | 'friends' | 'link' | 'public';
  wish_status: 'active' | 'fulfilled' | 'archived';
};

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string;
          slug: string;
          label_fr: string;
          parent_id: string | null;
          sort: number;
        };
        Insert: {
          id?: string;
          slug: string;
          label_fr: string;
          parent_id?: string | null;
          sort?: number;
        };
        Update: Partial<Database['public']['Tables']['categories']['Insert']>;
        Relationships: [];
      };
      follows: {
        Row: {
          follower_id: string;
          followee_id: string;
          state: Enums['follow_state'];
          created_at: string;
          responded_at: string | null;
        };
        Insert: {
          follower_id: string;
          followee_id: string;
          state?: Enums['follow_state'];
          created_at?: string;
          responded_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['follows']['Insert']>;
        Relationships: [];
      };
      merchants: {
        Row: {
          id: string;
          slug: string;
          name: string;
          domains: string[];
          logo_url: string | null;
          affiliate_program: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          domains?: string[];
          logo_url?: string | null;
          affiliate_program?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['merchants']['Insert']>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          recipient_id: string;
          kind: Enums['notif_kind'];
          actor_id: string | null;
          subject_type: string | null;
          subject_id: string | null;
          payload: Json;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          recipient_id: string;
          kind: Enums['notif_kind'];
          actor_id?: string | null;
          subject_type?: string | null;
          subject_id?: string | null;
          payload?: Json;
          read_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
        Relationships: [];
      };
      product_tags: {
        Row: {
          product_id: string;
          tag_id: string;
          weight: number;
        };
        Insert: {
          product_id: string;
          tag_id: string;
          weight?: number;
        };
        Update: Partial<Database['public']['Tables']['product_tags']['Insert']>;
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          merchant_id: string | null;
          title: string;
          brand: string | null;
          description: string | null;
          image_url: string | null;
          source_url: string | null;
          url_norm: string | null;
          url_hash: string | null;
          merchant_title_key: string | null;
          gtin: string | null;
          price_cents: number | null;
          currency: string;
          price_checked_at: string | null;
          category_id: string | null;
          price_band: number | null;
          embedding: number[] | null;
          embedding_model: string | null;
          status: string;
          merged_into: string | null;
          popularity: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          merchant_id?: string | null;
          title: string;
          brand?: string | null;
          description?: string | null;
          image_url?: string | null;
          source_url?: string | null;
          url_norm?: string | null;
          url_hash?: string | null;
          merchant_title_key?: string | null;
          gtin?: string | null;
          price_cents?: number | null;
          currency?: string;
          price_checked_at?: string | null;
          category_id?: string | null;
          price_band?: number | null;
          embedding?: number[] | null;
          embedding_model?: string | null;
          status?: string;
          merged_into?: string | null;
          popularity?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['products']['Insert']>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          handle: string;
          display_name: string;
          bio: string | null;
          avatar_url: string | null;
          birthday: string | null;
          birthday_visibility: Enums['visibility'];
          locale: string;
          currency: string;
          interests: string[];
          onboarded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          handle: string;
          display_name: string;
          bio?: string | null;
          avatar_url?: string | null;
          birthday?: string | null;
          birthday_visibility?: Enums['visibility'];
          locale?: string;
          currency?: string;
          interests?: string[];
          onboarded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      tags: {
        Row: {
          id: string;
          slug: string;
          label_fr: string;
        };
        Insert: {
          id?: string;
          slug: string;
          label_fr: string;
        };
        Update: Partial<Database['public']['Tables']['tags']['Insert']>;
        Relationships: [];
      };
      wish_items: {
        Row: {
          id: string;
          wishlist_id: string;
          owner_id: string;
          product_id: string | null;
          title: string;
          note: string | null;
          image_url: string | null;
          price_cents: number | null;
          currency: string;
          priority: number;
          quantity: number;
          status: Enums['wish_status'];
          is_pot: boolean;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wishlist_id: string;
          owner_id: string;
          product_id?: string | null;
          title: string;
          note?: string | null;
          image_url?: string | null;
          price_cents?: number | null;
          currency?: string;
          priority?: number;
          quantity?: number;
          status?: Enums['wish_status'];
          is_pot?: boolean;
          position?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['wish_items']['Insert']>;
        Relationships: [];
      };
      wishlists: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          slug: string | null;
          occasion: string | null;
          event_date: string | null;
          cover_url: string | null;
          visibility: Enums['visibility'];
          share_token: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          slug?: string | null;
          occasion?: string | null;
          event_date?: string | null;
          cover_url?: string | null;
          visibility?: Enums['visibility'];
          share_token?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['wishlists']['Insert']>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      /**
       * Per-item reservation state for a list you do NOT own.
       * Raises 42704 for an owner, a stranger, and an unknown list alike.
       */
      list_reservation_state: {
        Args: { p_wishlist: string };
        Returns: { wish_item_id: string; taken: boolean; mine: boolean }[];
      };
      reserve_item: {
        Args: { p_item: string; p_quantity?: number; p_message?: string };
        Returns: void;
      };
      release_item: {
        Args: { p_item: string };
        Returns: void;
      };
      /** Pot state for a friend. `contributors` is bucketed, never exact. */
      get_pot_state: {
        Args: { p_item: string };
        Returns: {
          target_cents: number;
          raised_cents: number;
          currency: string;
          state: Enums['pot_state'];
          contributors: string;
          mine_cents: number;
        }[];
      };
      /**
       * Chip into a pot. Cents, never a float.
       * Raises 42704 for an owner and for an item with no pot alike.
       */
      contribute: {
        Args: { p_item: string; p_amount_cents: number };
        Returns: void;
      };
      can_view_wishlist: {
        Args: { list: string; viewer: string };
        Returns: boolean;
      };
      is_friend: { Args: { a: string; b: string }; Returns: boolean };
    };
    Enums: Enums;
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

/** Convenience aliases for the rows the app reads most. */
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Wishlist = Database['public']['Tables']['wishlists']['Row'];
export type WishItem = Database['public']['Tables']['wish_items']['Row'];
export type Product = Database['public']['Tables']['products']['Row'];
export type Notification = Database['public']['Tables']['notifications']['Row'];

