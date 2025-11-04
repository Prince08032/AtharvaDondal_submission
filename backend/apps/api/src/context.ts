import { SupabaseClient } from '@supabase/supabase-js';

export interface GraphQLContext {
  supabaseAdmin: SupabaseClient; // for admin-level operations (bypass RLS)
  supabaseUser: SupabaseClient; // for user-level queries (with RLS)
  user: {
    id: string;
    email?: string;
  };
  request: Request;
}
