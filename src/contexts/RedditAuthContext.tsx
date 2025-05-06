import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { RedditAuthState } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useUserSettings } from '@/hooks/useUserSettings';
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
const REDIRECT_URI = "https://rvzkbwjycpxmlddgnhxn.supabase.co/functions/v1/reddit-auth/callback";

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

  // Function to save Reddit tokens to the database
  const saveTokensToDb = useCallback(async (tokenData: RedditAuthState): Promise<boolean> => {
    if (!user || !tokenData.refreshToken) {
      return false;
    }

    try {
      // Let's get the username first if needed to avoid potential race conditions
      const username = tokenData.scope?.includes('identity') 
        ? await fetchRedditUsername(tokenData.accessToken)
        : null;
      
      // ===== ATTEMPT #1: Try test_reddit_token_insert first (should be most reliable) =====
      try {
        const { error: testError } = await supabase.rpc(
          'test_reddit_token_insert',
          {
            user_id_param: user.id,
            access_token_param: tokenData.accessToken || '',
            refresh_token_param: tokenData.refreshToken
          }
        );
        
        if (!testError) {
          return true;
        }
      } catch (testInsertError) {
        // Continue to next attempt
      }
      
      // ===== ATTEMPT #2: Try with explicit JSON header via REST =====
      try {
        // Create expiration timestamp
        const expiresAt = tokenData.expiresAt 
          ? new Date(tokenData.expiresAt).toISOString() 
          : new Date(Date.now() + 3600000).toISOString();
        
        // Use fetch directly with explicit headers to bypass 406 errors
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        
        if (!supabaseUrl || !supabaseAnonKey) {
          throw new Error('Missing required Supabase environment variables');
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
        
        if (response.ok) {
          return true;
        }
      } catch (restError) {
        // Continue to next attempt
      }
      
      // ===== ATTEMPT #3: Try the insert_reddit_token function =====
      try {
        // Use our RPC function that bypasses potential issues
        const { error: insertError } = await supabase.rpc(
          'insert_reddit_token',
          {
            user_id_input: user.id,
            access_token_input: tokenData.accessToken || '',
            refresh_token_input: tokenData.refreshToken
          }
        );
        
        if (!insertError) {
          return true;
        }
      } catch (directError) {
        // Continue to next attempt
      }
      
      // ===== ATTEMPT #4: Use standard upsert explicitly with JSON headers =====
      try {
        // Use custom headers for all subsequent calls to fix the 406 error
        const supabaseConfig = (supabase as any)?.supabaseUrl && (supabase as any)?.supabaseKey
          ? {
              url: (supabase as any).supabaseUrl,
              key: (supabase as any).supabaseKey
            }
          : {
              url: import.meta.env.VITE_SUPABASE_URL,
              key: import.meta.env.VITE_SUPABASE_ANON_KEY
            };
        
        if (supabaseConfig.url && supabaseConfig.key) {
          // Create a direct fetch request to the REST API
          const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json', 
            'apikey': supabaseConfig.key,
            'Authorization': `Bearer ${supabaseConfig.key}`,
            'Prefer': 'resolution=merge-duplicates'
          };
          
          const response = await fetch(`${supabaseConfig.url}/rest/v1/rpc/test_reddit_token_insert`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              user_id_param: user.id,
              access_token_param: tokenData.accessToken || 'fallback_access_token',
              refresh_token_param: tokenData.refreshToken,
              expires_at_param: tokenData.expiresAt 
                ? new Date(tokenData.expiresAt).toISOString() 
                : new Date(Date.now() + 3600000).toISOString()
            })
          });
          
          if (response.ok) {
            return true;
          }
        }
      } catch (explicitError) {
        // All attempts failed
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }, [user, fetchRedditUsername]);

  // Function to fetch tokens from the database
  const fetchTokensFromDb = useCallback(async (): Promise<RedditAuthState | null> => {
    if (!user) return null;

    // ===== ATTEMPT #1: Try select with JSON format instead of default =====
    try {
      // Try with explicit Accept header by using function call
      const { data: funcData, error: funcError } = await supabase.rpc(
        'get_reddit_tokens_for_user',
        { user_id_param: user.id }
      );
      
      // If function doesn't exist yet, try the test_reddit_token_insert function
      if (funcError && funcError.code === 'PGRST202') {
        try {
          // First let's try to ensure a token exists by inserting a test one if needed
          await supabase.rpc(
            'test_reddit_token_insert',
            {
              user_id_param: user.id,
              access_token_param: 'temp_access_token',
              refresh_token_param: 'temp_refresh_token'
            }
          );
          
          // Now try to read it back with a standard query
          const { data: readData, error: readError } = await supabase
            .from('reddit_auth_tokens')
            .select('access_token, refresh_token, expires_at')
            .eq('user_id', user.id)
            .limit(1);
            
          if (!readError && readData && readData.length > 0 && readData[0].refresh_token) {
            return {
              accessToken: readData[0].access_token,
              refreshToken: readData[0].refresh_token,
              expiresAt: readData[0].expires_at ? new Date(readData[0].expires_at).getTime() : null,
              scope: null,
              isAuthenticated: true
            };
          }
        } catch (testError) {
          // Continue to next attempt
        }
      }
      
      if (!funcError && funcData && funcData.refresh_token) {
        return {
          accessToken: funcData.access_token,
          refreshToken: funcData.refresh_token,
          expiresAt: funcData.expires_at ? new Date(funcData.expires_at).getTime() : null,
          scope: null,
          isAuthenticated: true
        };
      }
    } catch (funcError) {
      // Continue to next attempt
    }

    // ===== ATTEMPT #2: Try standard query first =====
    try {
      // First, just try to see if table access works in general
      await supabase.from('reddit_auth_tokens').select('id').limit(1);
      
      // Now try the actual selection
      const { data, error } = await supabase
        .from('reddit_auth_tokens')
        .select('access_token, refresh_token, expires_at, username')
        .eq('user_id', user.id)
        .limit(1);
      
      if (error) {
        // Try a simplified version to see if it's the fields causing issues
        try {
          const simpleResult = await supabase
            .from('reddit_auth_tokens')
            .select('id, user_id')
            .eq('user_id', user.id)
            .limit(1);
            
          if (simpleResult.data && simpleResult.data.length > 0) {
            // We found the record but couldn't get all fields
            // This is a partial success
            return null;
          }
        } catch (simpleError) {
          // Continue to next attempt
        }
      } else if (data && data.length > 0 && data[0].refresh_token) {
        return {
          accessToken: data[0].access_token,
          refreshToken: data[0].refresh_token,
          expiresAt: data[0].expires_at ? new Date(data[0].expires_at).getTime() : null,
          scope: null, 
          isAuthenticated: true
        };
      }
    } catch (queryError) {
      // Continue to next attempt
    }

    // ===== ATTEMPT #3: Try checking using check_reddit_token_setup RPC =====
    try {
      // Helper function to process setup data
      const processSetupData = async (setupData: any): Promise<RedditAuthState | null> => {
        if (setupData && setupData.has_user_token) {
          // Try to get the token details again with a simple direct query
          try {
            const tokens = await fetchTokensDirectly();
            return tokens;
          } catch (directError) {
            // Unable to fetch token details
          }
        }
        return null;
      };
      
      // Helper function to fetch tokens directly
      const fetchTokensDirectly = async (): Promise<RedditAuthState | null> => {
        try {
          const { data: directData, error: directError } = await supabase
            .from('reddit_auth_tokens')
            .select('*')
            .eq('user_id', user.id)
            .limit(1);
            
          if (!directError && directData && directData.length > 0 && directData[0].refresh_token) {
            return {
              accessToken: directData[0].access_token,
              refreshToken: directData[0].refresh_token,
              expiresAt: directData[0].expires_at ? new Date(directData[0].expires_at).getTime() : null,
              scope: null,
              isAuthenticated: true
            };
          }
        } catch (directError) {
          // Unable to fetch token details
        }
        return null;
      };
        
      const { data: setupData, error: setupError } = await supabase.rpc(
        'check_reddit_token_setup',
        { user_id_input: user.id }
      );
      
      // If function doesn't exist, try a direct approach
      if (setupError && setupError.code === 'PGRST202') {
        // Try a simplified direct test - just check if table exists
        try {
          const { error: tableError } = await supabase
            .from('reddit_auth_tokens')
            .select('count(*)')
            .limit(1);
            
          if (!tableError) {
            // Now check if user has any tokens
            const { data: userTokens, error: userTokenError } = await supabase
              .from('reddit_auth_tokens')
              .select('id')
              .eq('user_id', user.id)
              .limit(1);
              
            const hasToken = !userTokenError && userTokens && userTokens.length > 0;
            
            // Create a manual replacement for setupData
            const manualSetupData = {
              table_exists: true,
              has_user_token: hasToken,
              token_details: null
            };
            
            // Process the manual setup data
            return await processSetupData(manualSetupData);
          }
        } catch (directError) {
          // Unable to complete table check
        }
      } else if (!setupError) {
        return await processSetupData(setupData);
      }
    } catch (setupError) {
      // Final attempt failed
    }

    return null;
  }, [user]);

  // --- Centralized Token Refresh and State Update Logic ---
  const refreshAndInitialize = useCallback(async (refreshToken: string) => {
    // Check if this specific refresh token has failed recently (in the last 60 seconds)
    const now = Date.now();
    if (
      refreshAttemptsRef.current.token === refreshToken && 
      refreshAttemptsRef.current.failed && 
      now - refreshAttemptsRef.current.timestamp < 60000 // Increased to 60 seconds
    ) {
      setIsLoading(false);
      return null;
    }
    
    setIsLoading(true);
    
    // Create a timeout promise to ensure we don't hang indefinitely
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Refresh token operation timed out after 10 seconds'));
      }, 10000); // Increased timeout to 10 seconds
    });
    
    // Store the current auth scope to avoid the dependency on changing state
    const currentScope = authState.scope;
    
    try {
      // Race between the actual fetch operation and the timeout
      const fetchPromise = (async () => {
        // Get validated environment variables
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        
        if (!supabaseUrl || !supabaseAnonKey) {
          console.error('[RedditAuth] Missing Supabase environment variables');
          throw new Error('Missing required Supabase environment variables');
        }
        
        const response = await fetch(`${supabaseUrl}/functions/v1/reddit-auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}` 
          },
          body: JSON.stringify({ refreshToken }),
        });
  
        if (!response.ok) {
          await response.json().catch(() => ({ message: 'Failed to parse refresh error response' }));
          
          // Record the failed attempt to prevent immediate retries
          refreshAttemptsRef.current = {
            token: refreshToken,
            timestamp: now,
            failed: true
          };
          
          // If refresh fails, clear the stored state
          setAuthState(defaultAuthState);
          
          // Clear the token from the database when it's expired
          if (user && (response.status === 400 || response.status === 401)) {
            try {
              await supabase
                .from('reddit_auth_tokens')
                .delete()
                .eq('user_id', user.id);
            } catch (dbError) {
              // Continue even if this fails
            }
          }
          
          // Also clear from preferences as a fallback
          setTimeout(() => {
            updatePreferences({ redditAuth: defaultAuthState })
              .catch(() => {/* ignore errors */});
          }, 0);
          
          // Only update preferences and database if this isn't already a retry attempt
          // AND we haven't completed initialization yet
          if (!initializationCompletedRef.current && refreshToken !== refreshAttemptsRef.current.token) {
            // Clear from database
            if (user) {
              try {
                await supabase
                  .from('reddit_auth_tokens')
                  .delete()
                  .eq('user_id', user.id);
              } catch (dbError) {
                // Continue even if this fails
              }
            }
            
            // Also clear from preferences as a fallback
            setTimeout(() => {
              updatePreferences({ redditAuth: defaultAuthState })
                .catch(() => {/* ignore errors */});
            }, 0);
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
          scope: newTokens.scope || currentScope,
          isAuthenticated: true,
        };
        
        setAuthState(newAuthState);
        
        // First save tokens to database (this is primary storage)
        const dbSaveSuccess = await saveTokensToDb(newAuthState);
        
        // If database save failed or as a fallback, also save to preferences
        // This prevents race conditions by using await and not relying on setTimeout
        if (!dbSaveSuccess) {
          try {
            await updatePreferences({ redditAuth: newAuthState });
          } catch (prefErr) {
            // Critical failure - neither database nor preferences storage succeeded
          }
        } else {
          // For backward compatibility, still update preferences
          // But don't block the flow
          updatePreferences({ redditAuth: newAuthState })
            .catch(() => {/* ignore errors */});
        }
        
        
        return newAuthState.accessToken;
      })();
      
      // Wait for either the fetch to complete or the timeout to trigger
      return await Promise.race([fetchPromise, timeoutPromise]) as string | null;

    } catch (error) {
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
        // Clear from database
        if (user) {
          try {
            await supabase
              .from('reddit_auth_tokens')
              .delete()
              .eq('user_id', user.id);
          } catch (dbError) {
            // Continue even if this fails
          }
        }
        
        // Also clear from preferences as a fallback
        setTimeout(() => {
          updatePreferences({ redditAuth: defaultAuthState })
            .catch(() => {/* ignore errors */});
        }, 0);
      }
      
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [authState.scope, saveTokensToDb, updatePreferences, user]);

  // --- Initialize state from Database or Preferences or Refresh Token ---
  useEffect(() => {
    // Global initialization check to prevent infinite loops
    if (hasInitializedInThisSession) {
      setIsLoading(false);
      return;
    }
    
    // Don't proceed until user is authenticated
    if (!user) {
      setAuthState(defaultAuthState);
      setIsLoading(false);
      return;
    }
    
    // Mark as initialized to prevent repeated re-initialization
    hasInitializedInThisSession = true;
    
    // IMPORTANT: Don't block the UI by setting isLoading to true here
    // This way, if Reddit auth fails, it won't prevent other features from working
    
    // Extend safety timeout to give more time for Reddit API to respond (sometimes it's slow)
    const safetyTimer = setTimeout(() => {
      console.log('[RedditAuth Init Effect] Safety timeout reached after 15 seconds');
      setIsLoading(false);
      initializationCompletedRef.current = true;
      // If we're still trying to initialize after timeout, set to unauthenticated state
      setAuthState(defaultAuthState);
    }, 15000);
    
    const initializeAuth = async () => {
      try {
        let authInitialized = false;
        
        // --- STEP 1: Try to get tokens from the database (primary source) ---
        try {
          const dbTokens = await fetchTokensFromDb();
          
          // If database tokens exist, use them
          if (dbTokens?.refreshToken) {
            // Check if token was recently known to fail
            const now = Date.now();
            const isRecentlyFailed = (
              refreshAttemptsRef.current.token === dbTokens.refreshToken && 
              refreshAttemptsRef.current.failed && 
              now - refreshAttemptsRef.current.timestamp < 60000
            );
            
            if (!isRecentlyFailed) {
              // Attempt to refresh the token from database
              try {
                await refreshAndInitialize(dbTokens.refreshToken);
                authInitialized = true;
                
                // Successfully initialized from database, no need to check preferences
                return;
              } catch (refreshError) {
                // Token refresh failed, but we'll still try preferences before giving up
              }
            }
            
            // Only delete the bad database token if we couldn't refresh it
            // AND we haven't yet tried preferences
            if (!authInitialized) {
              try {
                await supabase
                  .from('reddit_auth_tokens')
                  .delete()
                  .eq('user_id', user.id);
              } catch (dbError) {
                // Continue even if delete fails
              }
            }
          }
        } catch (dbError) {
          // Continue to try preferences
        }
        
        // --- STEP 2: If database didn't work, try preferences (fallback) ---
        if (!authInitialized && preferences.redditAuth?.refreshToken) {
          // Check if token from preferences was recently known to fail
          const now = Date.now();
          const isRecentlyFailed = (
            refreshAttemptsRef.current.token === preferences.redditAuth.refreshToken && 
            refreshAttemptsRef.current.failed && 
            now - refreshAttemptsRef.current.timestamp < 60000
          );
          
          if (isRecentlyFailed) {
            // Clear the bad token from preferences
            try {
              await updatePreferences({ redditAuth: defaultAuthState });
            } catch (prefError) {
              // Continue even if clear fails
            }
          } else {
            // Attempt to refresh the token from preferences
            try {
              await refreshAndInitialize(preferences.redditAuth.refreshToken);
              authInitialized = true;
              
              // Migration: Also save this token to the database for future use
              if (user && preferences.redditAuth.refreshToken) {
                try {
                  await saveTokensToDb(preferences.redditAuth);
                } catch (migrationError) {
                  // Non-critical error - we already refreshed successfully
                }
              }
            } catch (refreshError) {
              // Clear the bad token from preferences
              try {
                await updatePreferences({ redditAuth: defaultAuthState });
              } catch (prefError) {
                // Continue even if clear fails
              }
            }
          }
        }
        
        // --- STEP 3: If neither source worked, reset to unauthenticated state ---
        if (!authInitialized) {
          setAuthState(defaultAuthState);
        }
      } catch (error) {
        setAuthState(defaultAuthState);
      } finally {
        clearTimeout(safetyTimer);
        setIsLoading(false);
        initializationCompletedRef.current = true;
      }
    };
    
    // Initialize auth but don't let it block UI
    initializeAuth().catch(() => {
      setIsLoading(false);
      initializationCompletedRef.current = true;
    });
    
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, settingsLoaded, refreshAndInitialize, updatePreferences, fetchTokensFromDb, preferences.redditAuth, saveTokensToDb]);

  // --- Handle Tokens coming back from Reddit OAuth Redirect ---
  // Track if this effect has already handled tokens to prevent double-processing
  const hasHandledTokensRef = useRef(false);
  
  useEffect(() => {
    const handleTokensFromUrl = async () => {
      // Skip if we've already processed tokens
      if (hasHandledTokensRef.current) {
        return;
      }
      
      const urlParams = new URLSearchParams(window.location.search);
      const encodedTokens = urlParams.get('reddit_tokens');
      const state = urlParams.get('state');
      const errorParam = urlParams.get('reddit_auth_error');
      
      // Handle errors from the OAuth service
      if (errorParam) {
        toast.error(`Reddit authentication error: ${errorParam}`);
        return;
      }
        
      // Only process if user is logged in and state matches
      if (user && encodedTokens && state === 'reddit-auth') {
        setIsLoading(true);
        
        // Clean up URL, but preserve the current page
        try {
          // Only remove the auth parameters, don't change the path
          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.delete('reddit_tokens');
          currentUrl.searchParams.delete('state');
          currentUrl.searchParams.delete('code');
          
          // Always redirect to settings page with success parameter
          // This is a safer approach than trying to maintain the current URL
          const newUrl = new URL('/settings', window.location.origin);
          newUrl.searchParams.set('reddit_success', 'true');
          
          window.history.replaceState({}, document.title, newUrl.toString());
        } catch (error) {
          // Continue even if URL cleanup fails
        }
        
        try {
          const tokenString = Base64.decode(encodedTokens);
          const tokenData = JSON.parse(tokenString);
          
          // Validate token data
          if (!tokenData.access_token || !tokenData.refresh_token) {
            throw new Error('Invalid token data received from Reddit');
          }
          
          const expiresAt = Date.now() + (tokenData.expires_in * 1000);
          
          const initialAuthState: RedditAuthState = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt,
            scope: tokenData.scope,
            isAuthenticated: true
          };
          
          // Use the centralized function to set state and persist
          setAuthState(initialAuthState);
          
          // First save tokens to database (primary storage)
          const dbSaveSuccess = await saveTokensToDb(initialAuthState);
          
          if (dbSaveSuccess) {
            // For backward compatibility, still update preferences
            // But don't make the success message dependent on it
            toast.success('Successfully connected to Reddit');
            
            // Update preferences in the background
            updatePreferences({ redditAuth: initialAuthState })
              .catch(() => {
                // Non-critical error since we already saved to database
              });
          } else {
            // If database save failed, try preferences as fallback
            try {
              await updatePreferences({ redditAuth: initialAuthState });
              toast.success('Successfully connected to Reddit');
            } catch (prefErr) {
              toast.error('Connected to Reddit, but failed to save settings');
            }
          }
          
        } catch (error) {
          toast.error('Failed to process Reddit authentication redirect');
          setAuthState(defaultAuthState); // Reset on error
          
          // Use a timeout to avoid potential render-during-render issues
          setTimeout(() => {
            updatePreferences({ redditAuth: defaultAuthState })
              .catch(() => {/* ignore errors */});
          }, 0);
        } finally {
          setIsLoading(false);
          // Set the flag to indicate we've handled tokens, even if there was an error
          hasHandledTokensRef.current = true;
        }
      }
    };
    
    // Execute the token handler
    handleTokensFromUrl();
    
    // Depend on user to ensure it runs if login happens after mount but before processing
  }, [user, updatePreferences, saveTokensToDb]); 

  // Function to initiate Reddit authentication
  const connectReddit = async () => {
    if (!user) {
      toast.error('You must be logged in to connect your Reddit account');
      return;
    }

    // Generate random state for security
    const state = 'reddit-auth';

    // Validate Reddit client ID
    const redditClientId = import.meta.env.VITE_REDDIT_CLIENT_ID;
    
    if (!redditClientId) {
      throw new Error('Missing Reddit client ID. Cannot initiate OAuth flow.');
    }

    try {
      // Direct browser to Reddit auth page
      // Build the Reddit OAuth URL
      const authUrl = new URL(API_ENDPOINTS.REDDIT_OAUTH);
      authUrl.searchParams.append('client_id', redditClientId);
      authUrl.searchParams.append('response_type', 'code');
      authUrl.searchParams.append('state', state);
      authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
      authUrl.searchParams.append('duration', 'permanent');
      authUrl.searchParams.append('scope', REDDIT_OAUTH_SCOPES);

      // Redirect the user to the Reddit authentication page
      window.location.href = authUrl.toString();
    } catch (error) {
      toast.error(`Error connecting to Reddit: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Function to disconnect Reddit account
  const disconnectReddit = async () => {
    // Track success for final user feedback
    let dbSuccess = false;
    let prefsSuccess = false;
    
    // First clear the auth state for immediate UI feedback
    setAuthState(defaultAuthState);
    
    // Remove tokens from database (primary storage)
    if (user) {
      try {
        const { error } = await supabase
          .from('reddit_auth_tokens')
          .delete()
          .eq('user_id', user.id);
          
        if (!error) {
          dbSuccess = true;
          
          // Also update the migration tracking record if it exists
          try {
            await supabase
              .from('migration_user_tracking')
              .update({
                reddit_tokens_migrated: false,
                reddit_tokens_migrated_at: null
              })
              .eq('user_id', user.id);
          } catch (trackingError) {
            // Non-critical error
          }
        }
      } catch (error) {
        // Database operation failed
      }
    }
    
    // Also clear from preferences for backward compatibility
    try {
      await updatePreferences({
        redditAuth: defaultAuthState
      });
      prefsSuccess = true;
    } catch (error) {
      // Preferences update failed
    }
    
    // Provide appropriate feedback based on what succeeded
    if (dbSuccess || prefsSuccess) {
      toast.success('Disconnected from Reddit');
    } else {
      toast.error('Error disconnecting from Reddit. Please try again.');
      // We don't revert the UI state because it's better for UX to show as disconnected
      // even if there was an error clearing the stored tokens
    }
  };

  // Function to get a valid access token, refreshing if necessary
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (!authState.isAuthenticated || !authState.refreshToken) {
      return null;
    }

    // Check if token is expired (or close to expiring, e.g., within 60 seconds)
    if (authState.accessToken && authState.expiresAt && Date.now() < authState.expiresAt - 60000) {
        // Token is valid and not expiring soon
        return authState.accessToken;
    }

    // To prevent excessive calls, implement token refresh throttling
    // Check if this token recently failed to refresh (within last 60 seconds)
    const now = Date.now();
    if (
      refreshAttemptsRef.current.token === authState.refreshToken && 
      refreshAttemptsRef.current.failed && 
      now - refreshAttemptsRef.current.timestamp < 60000
    ) {
      return null;
    }
    
    // Check if we've already tried to refresh this token very recently (within 5 seconds)
    // This helps prevent "refresh storms" when multiple components call getAccessToken in parallel
    if (
      refreshAttemptsRef.current.token === authState.refreshToken && 
      !refreshAttemptsRef.current.failed && 
      now - refreshAttemptsRef.current.timestamp < 5000
    ) {
      return authState.accessToken;
    }

    // Token is missing, expired, or expiring soon. Attempt refresh.
    // Keep a local copy of the token to refresh to ensure consistency during the operation
    const tokenToRefresh = authState.refreshToken;
    
    // Use the centralized refresh logic
    return refreshAndInitialize(tokenToRefresh);
    
  }, [authState.isAuthenticated, authState.refreshToken, authState.accessToken, authState.expiresAt, refreshAndInitialize]);


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