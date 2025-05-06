export interface User {
  id: string;
  email?: string;
  username?: string;
  full_name?: string;
  avatar_url?: string;
}

export interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  session: import('@supabase/supabase-js').Session | null;
  loading: boolean;
  initialized: boolean;
}

export interface UserProfile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  updated_at: string | null;
  is_patron: boolean | null;
  patron_tier: string | null;
  patron_status: string | null;
  patreon_id: string | null;
  patreon_full_name: string | null;
  patreon_email: string | null;
  patreon_image_url: string | null;
  patron_since: string | null;
}

export interface RedditAuthToken {
  id: string;
  user_id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  username: string | null;
  created_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: UserProfile;
        Insert: Omit<UserProfile, 'updated_at'> & { updated_at?: string };
        Update: Partial<Omit<UserProfile, 'id'>>;
      };
      reddit_auth_tokens: {
        Row: RedditAuthToken;
        Insert: Omit<RedditAuthToken, 'id' | 'created_at' | 'updated_at'> & { 
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<RedditAuthToken, 'id' | 'user_id'>>;
      };
    };
  };
}