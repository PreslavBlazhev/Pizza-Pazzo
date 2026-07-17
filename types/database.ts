/**
 * Supabase database types (hand-written).
 *
 * These mirror `docs/supabase-auth-schema.sql` exactly — snake_case, nullability
 * and all. Only the auth tables are typed so far; menu data still comes from
 * static JSON (see `lib/menu-data.ts`), and orders are not built yet.
 *
 * Once the Supabase project exists these can be replaced with generated types:
 *   npx supabase gen types typescript --project-id <id> > types/database.ts
 *
 * Keep the shape below in sync with the SQL until then.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          phone: string | null;
          avatar_url: string | null;
          default_address_id: string | null;
          created_at: string;
          updated_at: string;
        };
        // The trigger `handle_new_user` inserts profiles; the app never does.
        Insert: {
          id: string;
          full_name: string;
          email: string;
          phone?: string | null;
          avatar_url?: string | null;
          default_address_id?: string | null;
        };
        Update: {
          full_name?: string;
          phone?: string | null;
          avatar_url?: string | null;
          default_address_id?: string | null;
        };
      };

      user_roles: {
        Row: {
          id: string;
          user_id: string;
          role: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          role?: string;
        };
        Update: {
          role?: string;
        };
      };

      user_addresses: {
        Row: {
          id: string;
          user_id: string;
          label: string | null;
          full_name: string | null;
          phone: string | null;
          city: string | null;
          address_line: string;
          entrance: string | null;
          floor: string | null;
          apartment: string | null;
          delivery_note: string | null;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          label?: string | null;
          full_name?: string | null;
          phone?: string | null;
          city?: string | null;
          address_line: string;
          entrance?: string | null;
          floor?: string | null;
          apartment?: string | null;
          delivery_note?: string | null;
          is_default?: boolean;
        };
        Update: {
          label?: string | null;
          full_name?: string | null;
          phone?: string | null;
          city?: string | null;
          address_line?: string;
          entrance?: string | null;
          floor?: string | null;
          apartment?: string | null;
          delivery_note?: string | null;
          is_default?: boolean;
        };
      };
    };

    Functions: {
      get_current_user_role: { Args: Record<string, never>; Returns: string };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_super_admin: { Args: Record<string, never>; Returns: boolean };
      is_staff: { Args: Record<string, never>; Returns: boolean };
    };
  };
}

/** Convenience aliases for table rows. */
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type UserRoleRow = Database["public"]["Tables"]["user_roles"]["Row"];
export type UserAddressRow = Database["public"]["Tables"]["user_addresses"]["Row"];
