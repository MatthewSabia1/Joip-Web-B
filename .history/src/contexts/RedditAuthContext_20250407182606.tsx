import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { RedditAuthState } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useUserSettings } from '@/hooks/useUserSettings';
import { API_ENDPOINTS, REDDIT_OAUTH_SCOPES } from '@/lib/constants';
import { toast } from 'sonner';
import { Base64 } from 'js-base64';

interface RedditAuthContextType {
  authState: RedditAuthState;
  connectReddit: () => void;
  disconnectReddit: () => void;
  getAccessToken: () => Promise<string | null>;
  isLoading: boolean;
}

// Default state when not authenticated
const defaultAuthState: RedditAuthState = {
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  scope: null,
  isAuthenticated: false
};

const RedditAuthContext = createContext<RedditAuthContextType | undefined>(undefined);

// Use the exact redirect URI that is registered in your Reddit app settings
const REDIRECT_URI = "https://bfserjasoryvqoiarbku.supabase.co/functions/v1/reddit-auth/callback";

export function RedditAuthProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { preferences, updatePreferences } = useUserSettings();
  const [authState, setAuthState] = useState<RedditAuthState>(
    preferences.redditAuth || defaultAuthState
  );
  const [isLoading, setIsLoading] = useState(false);

  // When user settings load, use any stored Reddit auth
  useEffect(() => {
    if (preferences.redditAuth) {
      setAuthState(preferences.redditAuth);
    }
  }, [preferences.redditAuth]);

  // Check for tokens in URL
  useEffect(() => {
    const handleTokensFromUrl = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      
      // Check for encoded tokens from redirect
      const encodedTokens = urlParams.get('reddit_tokens');
      const state = urlParams.get('state');
      
      if (encodedTokens && state === 'reddit-auth') {
        console.log('[RedditAuth] Found tokens in URL, processing...');
        setIsLoading(true);
        try {
          // Decode the tokens (using js-base64 to ensure compatibility)
          const tokenData = JSON.parse(Base64.decode(encodedTokens));
          
          // Calculate expiration time
          const expiresAt = Date.now() + (tokenData.expires_in * 1000);
          
          // Create new auth state
          const newAuthState: RedditAuthState = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt,
            scope: tokenData.scope,
            isAuthenticated: true
          };
          
          // Update state
          setAuthState(newAuthState);
          
          // Save to user preferences
          await updatePreferences({
            redditAuth: newAuthState
          });
          
          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname);
          
          toast.success('Successfully connected to Reddit');
        } catch (error) {
          console.error('[RedditAuth] Error processing tokens:', error);
          toast.error('Failed to process Reddit authentication');
        } finally {
          setIsLoading(false);
        }
      }
    };
    
    handleTokensFromUrl();
  }, []); // Run only once on initial mount to process URL parameters

  // Function to initiate Reddit authentication
  const connectReddit = () => {
    if (!user) {
      toast.error('You must be logged in to connect your Reddit account');
      return;
    }

    // Generate random state for security
    const state = 'reddit-auth';

    console.log('[RedditAuth] Starting Reddit OAuth flow with redirect URI:', REDIRECT_URI);

    // Build the Reddit OAuth URL
    const authUrl = new URL(API_ENDPOINTS.REDDIT_OAUTH);
    authUrl.searchParams.append('client_id', import.meta.env.VITE_REDDIT_CLIENT_ID || 'AKLQ71iAGnCN5r9zDyBiHQ');
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('duration', 'permanent');
    authUrl.searchParams.append('scope', REDDIT_OAUTH_SCOPES);

    console.log('[RedditAuth] Redirecting to:', authUrl.toString());

    // Redirect the user to the Reddit authentication page
    window.location.href = authUrl.toString();
  };

  // Function to disconnect Reddit account
  const disconnectReddit = async () => {
    console.log('[RedditAuth] Disconnecting Reddit account');
    // Clear the auth state
    setAuthState(defaultAuthState);
    
    // Update user preferences
    await updatePreferences({
      redditAuth: defaultAuthState
    });
    
    toast.success('Disconnected from Reddit');
  };

  // Function to get a valid access token, refreshing if necessary
  const getAccessToken = async (): Promise<string | null> => {
    // If not authenticated, return null
    if (!authState.isAuthenticated || !authState.refreshToken) {
      console.log('[RedditAuth] Not authenticated or missing refresh token');
      return null;
    }

    // If token is still valid, return it
    if (authState.accessToken && authState.expiresAt && Date.now() < authState.expiresAt) {
      return authState.accessToken;
    }

    console.log('[RedditAuth] Token expired, refreshing...');
    // Token is expired, try to refresh
    try {
      setIsLoading(true);
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reddit-auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ refreshToken: authState.refreshToken })
      });

      if (!response.ok) {
        throw new Error(`Error refreshing token: ${response.status}`);
      }

      const data = await response.json();
      console.log('[RedditAuth] Token refreshed successfully');
      
      // Calculate new expiration time
      const expiresAt = Date.now() + (data.expires_in * 1000);
      
      // Update auth state with new token
      const newAuthState: RedditAuthState = {
        ...authState,
        accessToken: data.access_token,
        expiresAt,
        isAuthenticated: true
      };
      
      setAuthState(newAuthState);
      
      // Save to user preferences
      await updatePreferences({
        redditAuth: newAuthState
      });
      
      return data.access_token;
      
    } catch (error) {
      console.error('[RedditAuth] Error refreshing token:', error);
      
      // If refresh fails, clear the auth state
      setAuthState(defaultAuthState);
      await updatePreferences({
        redditAuth: defaultAuthState
      });
      
      toast.error('Your Reddit session has expired. Please reconnect your account.');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const contextValue: RedditAuthContextType = {
    authState,
    connectReddit,
    disconnectReddit,
    getAccessToken,
    isLoading
  };

  return (
    <RedditAuthContext.Provider value={contextValue}>
      {children}
    </RedditAuthContext.Provider>
  );
}

export function useRedditAuth() {
  const context = useContext(RedditAuthContext);
  if (context === undefined) {
    throw new Error('useRedditAuth must be used within a RedditAuthProvider');
  }
  return context;
}