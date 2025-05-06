import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
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
  const { preferences, updatePreferences, settingsLoaded } = useUserSettings();
  const [authState, setAuthState] = useState<RedditAuthState>(defaultAuthState);
  const [isLoading, setIsLoading] = useState(true);

  // --- Centralized Token Refresh and State Update Logic ---
  const refreshAndInitialize = useCallback(async (refreshToken: string) => {
    console.log('[RedditAuth] Attempting to refresh token on load...');
    setIsLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reddit-auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` 
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to parse refresh error response' }));
        console.error('[RedditAuth] Initial refresh failed:', response.status, errorData);
        // If refresh fails (e.g., token revoked), clear the stored state
        setAuthState(defaultAuthState);
        await updatePreferences({ redditAuth: defaultAuthState });
        toast.error('Reddit session expired or revoked. Please reconnect.');
        return null;
      }

      const newTokens = await response.json();
      const newExpiresAt = Date.now() + (newTokens.expires_in * 1000);
      
      const newAuthState: RedditAuthState = {
        accessToken: newTokens.access_token,
        refreshToken: newTokens.refresh_token || refreshToken, // Keep old RT if new one not provided
        expiresAt: newExpiresAt,
        scope: newTokens.scope || authState.scope,
        isAuthenticated: true,
      };
      
      console.log('[RedditAuth] Successfully refreshed token on load. Setting state.');
      setAuthState(newAuthState);
      // Persist the newly refreshed state
      await updatePreferences({ redditAuth: newAuthState }); 
      return newAuthState.accessToken;

    } catch (error) {
      console.error('[RedditAuth] Error during initial refresh:', error);
      setAuthState(defaultAuthState);
      await updatePreferences({ redditAuth: defaultAuthState }); // Clear potentially bad state
      toast.error(`Error initializing Reddit session: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [updatePreferences]); // Removed authState.scope from dependencies

  // --- Initialize state from Preferences or Refresh Token ---
  useEffect(() => {
    // This effect determines the initial Reddit auth state based on
    // the logged-in user, loaded settings, and stored refresh token.
    
    console.log(`[RedditAuth Init Effect] Running. User: ${!!user}, SettingsLoaded: ${settingsLoaded}, IsLoading: ${isLoading}`);

    // Prevent checks if we are already processing something
    if (isLoading && !settingsLoaded) {
        console.log('[RedditAuth Init Effect] Already loading and settings not ready, skipping.');
        return;
    }

    if (user && settingsLoaded) {
      console.log('[RedditAuth Init Effect] User and settings loaded.');
      const storedAuth = preferences.redditAuth;
      const storedToken = storedAuth?.refreshToken;
      console.log(`[RedditAuth Init Effect] Stored Token: ${storedToken ? storedToken.substring(0, 5) + '...' : 'None'}`);
      console.log(`[RedditAuth Init Effect] Current isAuthenticated: ${authState.isAuthenticated}`);

      // Condition to attempt refresh: Stored token exists AND we aren't currently authenticated
      if (storedToken && !authState.isAuthenticated) {
        // ==> Found a token, and we aren't marked as authenticated yet.
        
        // Prevent starting a new refresh if one might already be in progress from a previous render
        if (isLoading) {
            console.warn('[RedditAuth Init Effect] Skipping refresh attempt as isLoading is already true.');
            return;
        }

        console.log('[RedditAuth Init Effect] Attempting refreshAndInitialize...');
        refreshAndInitialize(storedToken)
          .then(accessToken => {
              console.log(`[RedditAuth Init Effect] refreshAndInitialize completed. AccessToken obtained: ${!!accessToken}`);
              // isLoading is set to false inside refreshAndInitialize
          })
          .catch(err => {
              console.error('[RedditAuth Init Effect] refreshAndInitialize threw error:', err);
              // isLoading should also be false here due to finally block
          });
      } else if (!storedToken) {
        // ==> No token stored.
        console.log('[RedditAuth Init Effect] No refresh token found. Ensuring default state.');
        // Ensure state is default/logged out ONLY if it isn't already.
        if (authState.isAuthenticated || isLoading) { 
            setAuthState(defaultAuthState);
            setIsLoading(false);
        }
      } else if (authState.isAuthenticated) {
         // ==> Token stored and already authenticated.
         console.log('[RedditAuth Init Effect] Already authenticated. Ensuring loading is false.');
         // Ensure loading indicator is off if we are authenticated.
         if (isLoading) {
            setIsLoading(false);
         }
      }
    } else if (!user) {
        // ==> User logged out.
        console.log('[RedditAuth Init Effect] User logged out. Resetting state.');
        if (authState.isAuthenticated || isLoading) { // Only update if needed
            setAuthState(defaultAuthState);
            setIsLoading(false);
        }
    } else {
        // ==> Conditions not met (e.g., user logged in but settings not loaded yet)
        console.log('[RedditAuth Init Effect] Conditions not met (User logged in, SettingsLoaded=false?). Ensuring loading=true.');
        // Ensure loading is true while waiting for settings
        if (!isLoading) setIsLoading(true);
    }
    
    // Dependencies: Run when user, settingsLoaded, or the specific token changes.
    // refreshAndInitialize is stable.
  }, [user, settingsLoaded, preferences.redditAuth?.refreshToken, refreshAndInitialize]); 
  // Removed isLoading and authState.isAuthenticated from dependencies


  // --- Handle Tokens coming back from Reddit OAuth Redirect ---
  useEffect(() => {
    const handleTokensFromUrl = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const encodedTokens = urlParams.get('reddit_tokens');
      const state = urlParams.get('state');

      // Only process if user is logged in and state matches
      if (user && encodedTokens && state === 'reddit-auth') {
        console.log('[RedditAuth] Found tokens in URL, processing...');
        setIsLoading(true);
        // Clean up URL immediately
        try {
          const cleanUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        } catch (error) {
          console.warn('[RedditAuth] Could not clean up URL immediately:', error);
        }
        
        try {
          const tokenData = JSON.parse(Base64.decode(encodedTokens));
          const expiresAt = Date.now() + (tokenData.expires_in * 1000);
          
          const initialAuthState: RedditAuthState = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt,
            scope: tokenData.scope,
            isAuthenticated: true
          };
          
          // Use the centralized function to set state and persist
          console.log('[RedditAuth] Setting initial state from URL redirect.');
          setAuthState(initialAuthState);
          await updatePreferences({ redditAuth: initialAuthState }); 
          toast.success('Successfully connected to Reddit');
          
        } catch (error) {
          console.error('[RedditAuth] Error processing tokens from URL:', error);
          toast.error('Failed to process Reddit authentication redirect');
          setAuthState(defaultAuthState); // Reset on error
          await updatePreferences({ redditAuth: defaultAuthState });
        } finally {
          setIsLoading(false);
        }
      }
    };
    
    handleTokensFromUrl();
    // Depend on user to ensure it runs if login happens after mount but before processing
  }, [user, updatePreferences]); 

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
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (!authState.isAuthenticated || !authState.refreshToken) {
      console.log('[RedditAuth] getAccessToken: Not authenticated or no refresh token');
      return null;
    }

    // Check if token is expired (or close to expiring, e.g., within 60 seconds)
    if (authState.accessToken && authState.expiresAt && Date.now() < authState.expiresAt - 60000) {
        // Token is valid and not expiring soon
        return authState.accessToken;
    }

    // Token is missing, expired, or expiring soon. Attempt refresh.
    console.log('[RedditAuth] getAccessToken: Token invalid or expiring, calling refreshAndInitialize.');
    // Use the centralized refresh logic
    return refreshAndInitialize(authState.refreshToken);
    
  }, [authState, refreshAndInitialize]);

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