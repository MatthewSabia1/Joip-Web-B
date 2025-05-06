export interface Subreddit {
  name: string;
  posts: RedditPost[];
  error?: string;
}

export interface RedditPost {
  id: string;
  title: string;
  url: string;
  permalink: string;
  author: string;
  subreddit: string;
  created: number;
  isImage: boolean;
  isVideo: boolean;
  videoUrl?: string;
  thumbnailUrl?: string;
  isNSFW?: boolean;
}

export interface RedditAuthState {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  scope: string | null;
  isAuthenticated: boolean;
}

export interface ApiKeys {
  openRouter: string;
}

export type TransitionEffect = 'fade' | 'slide' | 'zoom' | 'flip';

export interface UserPreferences {
  subreddits: string[];
  interval: number;
  transition: TransitionEffect;
  systemPrompt: string;
  apiKeys: ApiKeys;
  redditAuth?: RedditAuthState;
}

export interface AIResponse {
  caption: string;
  loading: boolean;
  error?: string;
}

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
  session: any | null;
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

export interface JoiSession {
  id: string;
  user_id: string;
  title: string;
  subreddits: string[];
  system_prompt: string;
  interval: number;
  transition: TransitionEffect;
  created_at: string;
  updated_at: string;
  is_favorite: boolean;
  is_public: boolean;
  shared_url_id?: string;
}

export interface SharedSession {
  id: string;
  session_id: string;
  owner_id: string;
  shared_with_id: string;
  created_at: string;
  session?: JoiSession;
  owner?: UserProfile;
}