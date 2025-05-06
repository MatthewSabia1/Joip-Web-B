import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
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
  
  // Add a ref to track failed token refreshes to prevent infinite loops
  const refreshAttemptsRef = useRef<{
    token: string | null;
    timestamp: number;
    failed: boolean;
  }>({
    token: null,
    timestamp: 0,
    failed: false
  });

  // --- Centralized Token Refresh and State Update Logic ---
  const refreshAndInitialize = useCallback(async (refreshToken: string) => {
    // Check if this specific refresh token has failed recently (in the last 30 seconds)
    const now = Date.now();
    if (
      refreshAttemptsRef.current.token === refreshToken && 
      refreshAttemptsRef.current.failed && 
      now - refreshAttemptsRef.current.timestamp < 30000
    ) {
      console.log('[RedditAuth] Skipping refresh attempt for recently failed token');
      setIsLoading(false);
      return null;
    }
    
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
        
        // Record the failed attempt to prevent immediate retries
        refreshAttemptsRef.current = {
          token: refreshToken,
          timestamp: now,
          failed: true
        };
        
        // If refresh fails, clear the stored state
        setAuthState(defaultAuthState);
        
        // Check for specific error cases
        if (errorData.details && errorData.details.includes('503')) {
          toast.error('Reddit API is currently unavailable. Please try again later.');
        } else {
          toast.error('Reddit session expired or revoked. Please reconnect.');
        }
        
        // Only update preferences if this isn't already a retry attempt
        if (refreshToken !== refreshAttemptsRef.current.token) {
          await updatePreferences({ redditAuth: defaultAuthState });
        }
        
        return null;
      }

      const newTokens = await response.json();
      const newExpiresAt = Date.now() + (newTokens.expires_in * 1000);
      
      // Reset the failed attempts tracking
      refreshAttemptsRef.current = {
        token: refreshToken,
        timestamp: now,
        failed: false
      };
      
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
      
      // Record the failed attempt to prevent immediate retries
      refreshAttemptsRef.current = {
        token: refreshToken,
        timestamp: now,
        failed: true
      };
      
      setAuthState(defaultAuthState);
      
      // Only update preferences if this isn't already a retry attempt
      if (refreshToken !== refreshAttemptsRef.current.token) {
        await updatePreferences({ redditAuth: defaultAuthState });
      }
      
      toast.error(`Error initializing Reddit session: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [updatePreferences, authState.scope]);

  // --- Initialize state from Preferences or Refresh Token ---
  useEffect(() => {
    // Wait for user session AND user settings to be loaded
    console.log(`[RedditAuth Init Effect] Running. User: ${!!user}, SettingsLoaded: ${settingsLoaded}`);
    
    // Always reset loading state when dependencies change
    setIsLoading(true);
    
    if (user && settingsLoaded) {
      console.log('[RedditAuth Init Effect] User and settings loaded. Checking Reddit auth preferences...');
      const storedAuth = preferences.redditAuth;
      console.log('[RedditAuth Init Effect] Stored Auth from Preferences:', JSON.stringify(storedAuth));

      if (storedAuth?.refreshToken) {
        // Check if we've recently tried and failed with this token
        const now = Date.now();
        const recentlyFailed = (
          refreshAttemptsRef.current.token === storedAuth.refreshToken && 
          refreshAttemptsRef.current.failed && 
          now - refreshAttemptsRef.current.timestamp < 30000
        );
        
        if (recentlyFailed) {
          console.log('[RedditAuth Init Effect] Skipping refresh for recently failed token');
          setAuthState(defaultAuthState);
          setIsLoading(false);
          return;
        }
        
        console.log(`[RedditAuth Init Effect] Found refresh token: ${storedAuth.refreshToken.substring(0, 10)}... Initializing...`);
        // Found a refresh token, attempt to get a fresh access token
        refreshAndInitialize(storedAuth.refreshToken)
          .then(accessToken => {
              console.log(`[RedditAuth Init Effect] refreshAndInitialize completed. AccessToken obtained: ${!!accessToken}`);
          })
          .catch(err => {
              console.error('[RedditAuth Init Effect] refreshAndInitialize threw error:', err);
              setIsLoading(false);
          });
      } else {
        console.log('[RedditAuth Init Effect] No refresh token found. Setting default state.');
        // No refresh token, ensure state is default/logged out
        setAuthState(defaultAuthState);
        setIsLoading(false); // Not loading if no token to check
      }
    } else if (!user) {
        // If user logs out, reset state
        console.log('[RedditAuth Init Effect] User logged out. Resetting state.');
        setAuthState(defaultAuthState);
        setIsLoading(false); 
    } else {
        console.log('[RedditAuth Init Effect] Conditions not met (User or SettingsLoaded missing).');
        // If we're still waiting for user or settings to load, keep loading state
        // But still reset the state to avoid showing stale data
        setAuthState(defaultAuthState);
        // We don't set isLoading=false here because we're waiting for
        // user and settings to load before we decide if we can authenticate
    }
    
    // Return cleanup function to cancel any pending promises if the effect runs again
    return () => {
      // Cleanup logic if needed
    };
    
  // We're removing preferences.redditAuth?.refreshToken from dependencies as it's causing the loop
  // Instead, we'll detect changes in auth state via user and settingsLoaded, and handle failed refreshes with our ref
  }, [user, settingsLoaded, refreshAndInitialize]);

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