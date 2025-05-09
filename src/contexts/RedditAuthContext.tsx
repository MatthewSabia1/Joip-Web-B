import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { RedditAuthState } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { API_ENDPOINTS, REDDIT_OAUTH_SCOPES } from '@/lib/constants';
import { toast } from 'sonner';
import { Base64 } from 'js-base64';
import { supabase } from '@/lib/supabase';

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
const REDIRECT_URI = "https://rvzkbwjycpxmlddgnhxn.supabase.co/functions/v1/reddit-auth/callback";

export function RedditAuthProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [authState, setAuthState] = useState<RedditAuthState>(defaultAuthState);
  const [isLoading, setIsLoading] = useState(true);
  
  // Track token refresh attempts to prevent excessive calls
  const refreshAttemptsRef = useRef<{
    token: string | null;
    timestamp: number;
    failed: boolean;
  }>({
    token: null,
    timestamp: 0,
    failed: false
  });
  
  // Track initialization status locally with refs instead of global variables
  const isInitializedRef = useRef(false);
  const initializationCompletedRef = useRef(false);
  
  // Track if tokens from URL have been handled
  const hasHandledTokensRef = useRef(false);

  // Helper function to fetch Reddit username if needed
  const fetchRedditUsername = async (accessToken: string | null): Promise<string | null> => {
    if (!accessToken) return null;
    
    try {
      const response = await fetch('https://oauth.reddit.com/api/v1/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'Joip/1.0'
        }
      });
      
      if (!response.ok) return null;
      
      const data = await response.json();
      return data.name || null;
    } catch (error) {
      return null;
    }
  };

  // Simplified function to save Reddit tokens to the database
  const saveTokensToDb = useCallback(async (tokenData: RedditAuthState): Promise<boolean> => {
    if (!user || !tokenData.refreshToken) {
      return false;
    }

    try {
      // Get username for a more complete record
      const username = tokenData.scope?.includes('identity') 
        ? await fetchRedditUsername(tokenData.accessToken)
        : null;
      
      // Prepare expire timestamp
      const expiresAt = tokenData.expiresAt 
        ? new Date(tokenData.expiresAt).toISOString() 
        : new Date(Date.now() + 3600000).toISOString();
      
      // Primary approach: use the upsert method with RPC
      try {
        const { error: rpcError } = await supabase.rpc(
          'insert_reddit_token',
          {
            user_id_input: user.id,
            access_token_input: tokenData.accessToken || '',
            refresh_token_input: tokenData.refreshToken,
            expires_at_input: expiresAt,
            username_input: username
          }
        );
        
        if (!rpcError) {
          return true;
        }
        
        // If the RPC call fails with function not found, try the direct table approach
        if (rpcError.code === 'PGRST202') {
          const { error: insertError } = await supabase
            .from('reddit_auth_tokens')
            .upsert({
              user_id: user.id,
              access_token: tokenData.accessToken,
              refresh_token: tokenData.refreshToken,
              expires_at: expiresAt,
              username
            });
            
          if (!insertError) {
            return true;
          }
        }
      } catch (error) {
        // Continue to fallback
      }
      
      // Fallback: Use direct REST API call with explicit headers
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        
        if (!supabaseUrl || !supabaseAnonKey) {
          return false;
        }
        
        const response = await fetch(`${supabaseUrl}/rest/v1/reddit_auth_tokens`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify({
            user_id: user.id,
            access_token: tokenData.accessToken,
            refresh_token: tokenData.refreshToken,
            expires_at: expiresAt,
            username
          })
        });
        
        return response.ok;
      } catch (error) {
        return false;
      }
      
      return false;
    } catch (error) {
      console.error('Error saving Reddit tokens:', error);
      return false;
    }
  }, [user, fetchRedditUsername]);

  // Simplified function to fetch tokens from the database
  const fetchTokensFromDb = useCallback(async (): Promise<RedditAuthState | null> => {
    if (!user) return null;

    try {
      // Try standard query first (most straightforward approach)
      const { data, error } = await supabase
        .from('reddit_auth_tokens')
        .select('access_token, refresh_token, expires_at')
        .eq('user_id', user.id)
        .limit(1);
      
      if (!error && data && data.length > 0 && data[0].refresh_token) {
        return {
          accessToken: data[0].access_token,
          refreshToken: data[0].refresh_token,
          expiresAt: data[0].expires_at ? new Date(data[0].expires_at).getTime() : null,
          scope: null, 
          isAuthenticated: true
        };
      }
      
      // If direct query fails, try using RPC function if it exists
      try {
        const { data: funcData, error: funcError } = await supabase.rpc(
          'get_reddit_tokens_for_user',
          { user_id_param: user.id }
        );
        
        if (!funcError && funcData && funcData.refresh_token) {
          return {
            accessToken: funcData.access_token,
            refreshToken: funcData.refresh_token,
            expiresAt: funcData.expires_at ? new Date(funcData.expires_at).getTime() : null,
            scope: null,
            isAuthenticated: true
          };
        }
      } catch (rpcError) {
        // RPC function might not exist, continue to next approach
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching Reddit tokens:', error);
      return null;
    }
  }, [user]);

  // Centralized token refresh logic
  const refreshAndInitialize = useCallback(async (refreshToken: string) => {
    // Don't attempt to refresh if this token recently failed
    const now = Date.now();
    if (
      refreshAttemptsRef.current.token === refreshToken && 
      refreshAttemptsRef.current.failed && 
      now - refreshAttemptsRef.current.timestamp < 60000
    ) {
      setIsLoading(false);
      return null;
    }
    
    setIsLoading(true);
    
    // Use timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Refresh token operation timed out after 10 seconds'));
      }, 10000);
    });
    
    // Store current scope for potential reuse
    const currentScope = authState.scope;
    
    try {
      const fetchPromise = (async () => {
        // Get environment variables
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        
        if (!supabaseUrl || !supabaseAnonKey) {
          throw new Error('Missing required Supabase environment variables');
        }
        
        // Call the refresh endpoint
        const response = await fetch(`${supabaseUrl}/functions/v1/reddit-auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}` 
          },
          body: JSON.stringify({ refreshToken }),
        });
  
        if (!response.ok) {
          // Record the failed attempt
          refreshAttemptsRef.current = {
            token: refreshToken,
            timestamp: now,
            failed: true
          };
          
          // Clear stored state and tokens
          setAuthState(defaultAuthState);
          
          // Clean up the invalid token from database
          if (user && (response.status === 400 || response.status === 401)) {
            try {
              await supabase
                .from('reddit_auth_tokens')
                .delete()
                .eq('user_id', user.id);
            } catch (error) {
              // Ignore errors during cleanup
              console.warn('Failed to delete invalid token from database:', error);
            }
          }
          
          return null;
        }
  
        // Process the new tokens
        const newTokens = await response.json();
        const newExpiresAt = Date.now() + (newTokens.expires_in * 1000);
        
        // Update tracking state
        refreshAttemptsRef.current = {
          token: refreshToken,
          timestamp: now,
          failed: false
        };
        
        // Create new auth state
        const newAuthState: RedditAuthState = {
          accessToken: newTokens.access_token,
          refreshToken: newTokens.refresh_token || refreshToken, // Keep old RT if new one not provided
          expiresAt: newExpiresAt,
          scope: newTokens.scope || currentScope,
          isAuthenticated: true,
        };
        
        // Update local state
        setAuthState(newAuthState);
        
        // Save tokens to database only
        await saveTokensToDb(newAuthState);
        
        return newAuthState.accessToken;
      })();
      
      // Use race to handle timeout
      return await Promise.race([fetchPromise, timeoutPromise]) as string | null;

    } catch (error) {
      // Record failure and reset state
      refreshAttemptsRef.current = {
        token: refreshToken,
        timestamp: now,
        failed: true
      };
      
      setAuthState(defaultAuthState);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [authState.scope, saveTokensToDb, user]);

  // Initialize authentication state
  useEffect(() => {
    // Don't reinitialize if already done
    if (isInitializedRef.current) {
      setIsLoading(false);
      return;
    }
    
    // Don't proceed without user
    if (!user) {
      setAuthState(defaultAuthState);
      setIsLoading(false);
      return;
    }
    
    // Mark initialization as started
    isInitializedRef.current = true;
    
    // Safety timeout
    const safetyTimer = setTimeout(() => {
      console.log('[RedditAuth] Initialization safety timeout reached');
      setIsLoading(false);
      initializationCompletedRef.current = true;
      setAuthState(defaultAuthState);
    }, 15000);
    
    const initializeAuth = async () => {
      try {
        // --- STEP 1: Try to get tokens from the database (primary source) ---
        const dbTokens = await fetchTokensFromDb();
        
        if (dbTokens?.refreshToken) {
          try {
            // Refresh token from database
            await refreshAndInitialize(dbTokens.refreshToken);
            // Successfully initialized
            clearTimeout(safetyTimer);
            setIsLoading(false);
            initializationCompletedRef.current = true;
            return;
          } catch (error) {
            console.error('Error refreshing token:', error);
            // Continue to reset state if refresh fails
          }
        }
        
        // Set to default state if database doesn't have tokens or refresh fails
        setAuthState(defaultAuthState);
      } catch (error) {
        console.error('[RedditAuth] Initialization error:', error);
        setAuthState(defaultAuthState);
      } finally {
        clearTimeout(safetyTimer);
        setIsLoading(false);
        initializationCompletedRef.current = true;
      }
    };
    
    // Start initialization but don't block UI
    initializeAuth().catch(() => {
      setIsLoading(false);
      initializationCompletedRef.current = true;
    });
  }, [user, refreshAndInitialize, fetchTokensFromDb]);

  // Handle tokens coming from OAuth redirect
  useEffect(() => {
    const handleTokensFromUrl = async () => {
      // Skip if already processed tokens
      if (hasHandledTokensRef.current) {
        return;
      }
      
      const urlParams = new URLSearchParams(window.location.search);
      const encodedTokens = urlParams.get('reddit_tokens');
      const state = urlParams.get('state');
      const errorParam = urlParams.get('reddit_auth_error');
      
      // Handle auth errors
      if (errorParam) {
        toast.error(`Reddit authentication error: ${errorParam}`);
        return;
      }
        
      // Process tokens if present and user is logged in
      if (user && encodedTokens && state === 'reddit-auth') {
        setIsLoading(true);
        hasHandledTokensRef.current = true;
        
        // Clean up URL params
        try {
          const newUrl = new URL('/settings', window.location.origin);
          newUrl.searchParams.set('reddit_success', 'true');
          window.history.replaceState({}, document.title, newUrl.toString());
        } catch (error) {
          // Non-critical if URL cleanup fails
        }
        
        try {
          // Parse and validate tokens
          const tokenString = Base64.decode(encodedTokens);
          const tokenData = JSON.parse(tokenString);
          
          if (!tokenData.access_token || !tokenData.refresh_token) {
            throw new Error('Invalid token data received from Reddit');
          }
          
          // Create auth state from token data
          const expiresAt = Date.now() + (tokenData.expires_in * 1000);
          const initialAuthState: RedditAuthState = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt,
            scope: tokenData.scope,
            isAuthenticated: true
          };
          
          // Update local state
          setAuthState(initialAuthState);
          
          // Save to database (only secure storage option)
          const dbSaveSuccess = await saveTokensToDb(initialAuthState);
          
          if (dbSaveSuccess) {
            toast.success('Successfully connected to Reddit');
          } else {
            // If database save fails, log user out of Reddit
            setAuthState(defaultAuthState);
            toast.error('Failed to save Reddit authentication. Please try again.');
          }
        } catch (error) {
          console.error('Failed to process Reddit auth redirect:', error);
          toast.error('Failed to process Reddit authentication redirect');
          setAuthState(defaultAuthState);
        } finally {
          setIsLoading(false);
        }
      }
    };
    
    // Process tokens on mount or when user changes
    handleTokensFromUrl();
  }, [user, saveTokensToDb]); 

  // Function to initiate Reddit authentication
  const connectReddit = async () => {
    if (!user) {
      toast.error('You must be logged in to connect your Reddit account');
      return;
    }

    // Use fixed state for security (validated server-side)
    const state = 'reddit-auth';
    const redditClientId = import.meta.env.VITE_REDDIT_CLIENT_ID;
    
    if (!redditClientId) {
      toast.error('Missing Reddit client ID configuration');
      return;
    }

    try {
      // Build the Reddit OAuth URL
      const authUrl = new URL(API_ENDPOINTS.REDDIT_OAUTH);
      authUrl.searchParams.append('client_id', redditClientId);
      authUrl.searchParams.append('response_type', 'code');
      authUrl.searchParams.append('state', state);
      authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
      authUrl.searchParams.append('duration', 'permanent');
      authUrl.searchParams.append('scope', REDDIT_OAUTH_SCOPES);

      // Redirect to Reddit auth page
      window.location.href = authUrl.toString();
    } catch (error) {
      toast.error(`Error connecting to Reddit: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Function to disconnect Reddit account
  const disconnectReddit = async () => {
    // Clear local state immediately for UI feedback
    setAuthState(defaultAuthState);
    
    let success = false;
    
    // Remove from database (primary storage)
    if (user) {
      try {
        const { error } = await supabase
          .from('reddit_auth_tokens')
          .delete()
          .eq('user_id', user.id);
          
        if (!error) {
          success = true;
        }
      } catch (error) {
        console.error('Error removing Reddit tokens from database:', error);
      }
    }
    
    // Show appropriate message
    if (success) {
      toast.success('Disconnected from Reddit');
    } else {
      toast.error('Error disconnecting from Reddit. Please try again.');
    }
  };

  // Function to get a valid access token, refreshing if necessary
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (!authState.isAuthenticated || !authState.refreshToken) {
      return null;
    }

    // Return existing token if valid and not expiring soon
    if (authState.accessToken && authState.expiresAt && Date.now() < authState.expiresAt - 60000) {
      return authState.accessToken;
    }

    // Prevent excessive refresh attempts
    const now = Date.now();
    
    // Don't retry if recently failed
    if (
      refreshAttemptsRef.current.token === authState.refreshToken && 
      refreshAttemptsRef.current.failed && 
      now - refreshAttemptsRef.current.timestamp < 60000
    ) {
      return null;
    }
    
    // Don't refresh if already attempted very recently
    if (
      refreshAttemptsRef.current.token === authState.refreshToken && 
      !refreshAttemptsRef.current.failed && 
      now - refreshAttemptsRef.current.timestamp < 5000
    ) {
      return authState.accessToken;
    }

    // Refresh the token
    return refreshAndInitialize(authState.refreshToken);
  }, [authState.isAuthenticated, authState.refreshToken, authState.accessToken, authState.expiresAt, refreshAndInitialize]);

  // Create context value
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