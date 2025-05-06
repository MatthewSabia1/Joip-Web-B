/**
 * This file contains a self-checking function that can be called to test whether the Reddit authentication
 * tokens are persisting correctly. It's designed to be called manually during development and testing.
 * 
 * To use: Import this function in your component and call it at appropriate times (after login, reconnect, etc.)
 */

import { supabase } from '@/lib/supabase';
import { RedditAuthState } from '@/types';

export async function testDirectDatabaseWrite(userId: string): Promise<boolean> {
  if (!userId) {
    console.error('[Reddit Test] No user ID provided');
    return false;
  }
  
  try {
    console.log('[Reddit Test] Testing direct database write with fetch API');
    
    // Use direct fetch to avoid any client-side issues
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('[Reddit Test] Missing Supabase environment variables');
      return false;
    }
    
    // Generate unique test tokens
    const testToken = `test_direct_${Date.now()}`;
    
    // Make a direct REST API call with explicit headers
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
        user_id: userId,
        access_token: `access_${testToken}`,
        refresh_token: `refresh_${testToken}`,
        expires_at: new Date(Date.now() + 3600000).toISOString()
      })
    });
    
    if (response.ok) {
      console.log('[Reddit Test] Direct database write successful!');
      return true;
    } else {
      const errorText = await response.text();
      console.error(`[Reddit Test] Failed with status ${response.status}:`, errorText);
      
      // Try direct RPC call as fallback
      console.log('[Reddit Test] Trying RPC call fallback...');
      
      try {
        const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/insert_reddit_token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${supabaseAnonKey}`
          },
          body: JSON.stringify({
            user_id_input: userId,
            access_token_input: `access_${testToken}_rpc`,
            refresh_token_input: `refresh_${testToken}_rpc`
          })
        });
        
        if (rpcResponse.ok) {
          console.log('[Reddit Test] RPC write successful!');
          return true;
        } else {
          const rpcErrorText = await rpcResponse.text();
          console.error(`[Reddit Test] RPC call failed with status ${rpcResponse.status}:`, rpcErrorText);
        }
      } catch (rpcError) {
        console.error('[Reddit Test] RPC call threw exception:', rpcError);
      }
    }
    
    return false;
  } catch (error) {
    console.error('[Reddit Test] Exception during direct write test:', error);
    return false;
  }
}

export async function checkRedditAuthPersistence(
  userId: string | undefined,
  currentAuthState: RedditAuthState, 
  logPrefix = 'RedditAuth Persistence'
): Promise<{
  isPersisted: boolean;
  inDatabase: boolean;
  inPreferences: boolean;
  details: string;
}> {
  if (!userId) {
    console.error(`${logPrefix}: No user ID provided`);
    return {
      isPersisted: false,
      inDatabase: false,
      inPreferences: false,
      details: 'No user ID provided. Cannot check persistence.'
    };
  }

  let inDatabase = false;
  let inPreferences = false;
  let details = '';

  // First check if the tokens exist in the database
  try {
    const { data: dbTokens, error } = await supabase
      .from('reddit_auth_tokens')
      .select('refresh_token, access_token')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code !== 'PGRST116') { // PGRST116 = "No rows returned" - not a real error
        console.error(`${logPrefix}: Database error:`, error);
        details += `Database error: ${error.message}. `;
      } else {
        details += 'No tokens found in database. ';
      }
    } else if (dbTokens) {
      inDatabase = !!dbTokens.refresh_token;
      details += `Database: ${inDatabase ? 'Tokens found' : 'No refresh token'}. `;
    }
  } catch (error) {
    console.error(`${logPrefix}: Exception querying database:`, error);
    details += `Database exception: ${error instanceof Error ? error.message : String(error)}. `;
  }

  // Check if tokens exist in user preferences
  try {
    const { data: userSettings, error } = await supabase
      .from('user_settings')
      .select('preferences')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error(`${logPrefix}: Error querying user_settings:`, error);
      details += `Preferences error: ${error.message}. `;
    } else if (userSettings?.preferences?.redditAuth?.refreshToken) {
      inPreferences = true;
      details += 'Tokens found in preferences. ';
    } else {
      details += 'No tokens in preferences. ';
    }
  } catch (error) {
    console.error(`${logPrefix}: Exception querying preferences:`, error);
    details += `Preferences exception: ${error instanceof Error ? error.message : String(error)}. `;
  }

  // Check current memory state
  const inMemory = !!currentAuthState.refreshToken;
  details += `In-memory: ${inMemory ? 'Authenticated' : 'Not authenticated'}. `;

  // Determine overall status
  const isPersisted = inDatabase || inPreferences;
  
  // Log summary
  console.log(`${logPrefix}: Persistence check complete:`);
  console.log(`- In database: ${inDatabase}`);
  console.log(`- In preferences: ${inPreferences}`);
  console.log(`- In memory: ${inMemory}`);
  console.log(`- Is persisted: ${isPersisted}`);
  console.log(`- Details: ${details}`);

  return {
    isPersisted,
    inDatabase,
    inPreferences,
    details
  };
}