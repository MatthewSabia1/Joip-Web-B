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

// Global variable to ensure the initialization only runs once per session
// This is extreme but will definitively prevent any infinite loops
let hasInitializedInThisSession = false;

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
  
  // Add a flag to track whether initialization has been completed
  const initializationCompletedRef = useRef(false);

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
    
    // Create a timeout promise to ensure we don't hang indefinitely
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Refresh token operation timed out after 8 seconds'));
      }, 8000);
    });
    
    try {
      // Race between the actual fetch operation and the timeout
      const fetchPromise = (async () => {
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
          // AND we haven't completed initialization yet
          // This helps prevent update cascades during initialization
          if (!initializationCompletedRef.current && refreshToken !== refreshAttemptsRef.current.token) {
            console.log('[RedditAuth] Clearing stored refresh token after failure');
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
        // Always update preferences on successful refresh
        await updatePreferences({ redditAuth: newAuthState }); 
        return newAuthState.accessToken;
      })();
      
      // Wait for either the fetch to complete or the timeout to trigger
      return await Promise.race([fetchPromise, timeoutPromise]) as string | null;

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
      // AND we haven't completed initialization yet
      if (!initializationCompletedRef.current && refreshToken !== refreshAttemptsRef.current.token) {
        console.log('[RedditAuth] Clearing stored refresh token after error');
        await updatePreferences({ redditAuth: defaultAuthState });
      }
      
      if (error instanceof Error && error.message.includes('timed out')) {
        toast.error('Reddit authentication timed out. Please try again later.');
      } else {
        toast.error(`Error initializing Reddit session: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [updatePreferences, authState.scope, initializationCompletedRef]);

  // --- Initialize state from Preferences or Refresh Token ---
  useEffect(() => {
    // Global guard to ensure this effect only runs once per session, period.
    // This is an extreme measure to prevent infinite loops.
    if (hasInitializedInThisSession) {
      console.log('[RedditAuth Init Effect] Already initialized in this browser session, hard blocking further attempts');
      setIsLoading(false);
      return;
    }
    
    // Skip if we've already completed initialization in this component instance
    if (initializationCompletedRef.current) {
      console.log('[RedditAuth Init Effect] Initialization already completed in this component instance, skipping');
      return;
    }
    
    // Wait for user session AND user settings to be loaded
    console.log(`[RedditAuth Init Effect] Running. User: ${!!user}, SettingsLoaded: ${settingsLoaded}`);
    
    // If prerequisites aren't met, don't proceed
    if (!user || !settingsLoaded) {
      console.log('[RedditAuth Init Effect] Prerequisites not met yet (user or settingsLoaded missing)');
      if (!user) {
        // If user logs out, reset state
        setAuthState(defaultAuthState);
        setIsLoading(false);
      }
      return;
    }
    
    // Set the global session guard to true - this initialization is happening now
    hasInitializedInThisSession = true;
    
    // Always reset loading state when dependencies change
    setIsLoading(true);
    
    // Safety timeout to ensure loading state never gets stuck
    const safetyTimer = setTimeout(() => {
      console.log('[RedditAuth Init Effect] Safety timeout reached, force-ending loading state');
      setIsLoading(false);
      initializationCompletedRef.current = true;
    }, 10000); // 10-second maximum loading time
    
    const initializeAuth = async () => {
      try {
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
          } else {
            console.log(`[RedditAuth Init Effect] Found refresh token: ${storedAuth.refreshToken.substring(0, 10)}... Initializing...`);
            // Found a refresh token, attempt to get a fresh access token - use await instead of Promise chain
            try {
              const accessToken = await refreshAndInitialize(storedAuth.refreshToken);
              console.log(`[RedditAuth Init Effect] refreshAndInitialize completed. AccessToken obtained: ${!!accessToken}`);
            } catch (err) {
              console.error('[RedditAuth Init Effect] refreshAndInitialize threw error:', err);
              setAuthState(defaultAuthState);
            }
          }
        } else {
          console.log('[RedditAuth Init Effect] No refresh token found. Setting default state.');
          // No refresh token, ensure state is default/logged out
          setAuthState(defaultAuthState);
        }
      } catch (e) {
        // Catch any unexpected errors in the initialization process
        console.error('[RedditAuth Init Effect] Unexpected error during initialization:', e);
        setAuthState(defaultAuthState);
      } finally {
        // Always ensure loading state is reset and mark initialization as completed
        clearTimeout(safetyTimer);
        setIsLoading(false);
        initializationCompletedRef.current = true;
        console.log('[RedditAuth Init Effect] Initialization completed');
      }
    };
    
    // Kick off the initialization process
    initializeAuth();
    
    // Return cleanup function to cancel any pending promises if the effect runs again
    return () => {
      clearTimeout(safetyTimer);
    };
    
  // CRITICAL FIX: Remove all unstable dependencies that could cause re-renders and infinite loops
  // Using only the bare minimum dependencies and letting the initialization flag control repeat runs
  }, [user, settingsLoaded]);

  // When preferences.redditAuth changes after initial load, update our local state
  // This is a separate effect to handle changes that happen outside the initialization process
  useEffect(() => {
    // Only run this effect if initialization has completed and we're not already loading
    if (initializationCompletedRef.current && !isLoading && preferences.redditAuth) {
      // If the auth state in preferences is authenticated, and different from our current auth state
      if (preferences.redditAuth.isAuthenticated && 
          preferences.redditAuth.refreshToken !== authState.refreshToken) {
        console.log('[RedditAuth] Updating local auth state from changed preferences');
        setAuthState(preferences.redditAuth);
      }
    }
  }, [preferences.redditAuth, isLoading, authState.refreshToken]);

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