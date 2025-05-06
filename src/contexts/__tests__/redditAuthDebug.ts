/**
 * This file contains debugging utilities to help diagnose issues with Reddit authentication
 */

import { supabase } from '@/lib/supabase';
import { RedditAuthState } from '@/types';

// Function to test direct token insertion
export async function testDirectTokenInsertion(userId: string): Promise<boolean> {
  try {
    console.log('[RedditAuthDebug] Testing direct token insertion for user', userId);
    
    // Use a test token with timestamp to make it unique
    const testRefreshToken = `test_direct_refresh_token_${Date.now()}`;
    console.log('[RedditAuthDebug] Generated test refresh token');
    
    // First, let's try using a regular insert to see if RLS is the issue
    console.log('[RedditAuthDebug] Attempting standard insert first to test RLS...');
    try {
      const { error: standardError } = await supabase
        .from('reddit_auth_tokens')
        .upsert({
          user_id: userId,
          access_token: 'test_standard_access',
          refresh_token: 'test_standard_refresh',
          expires_at: new Date(Date.now() + 3600000).toISOString()
        }, { onConflict: 'user_id' });
      
      if (standardError) {
        console.error('[RedditAuthDebug] Standard insert failed - likely an RLS issue:', standardError);
        console.log('[RedditAuthDebug] RLS error details:', {
          code: standardError.code,
          message: standardError.message,
          details: standardError.details
        });
      } else {
        console.log('[RedditAuthDebug] Standard insert succeeded! RLS is working correctly.');
        return true;
      }
    } catch (standardErr) {
      console.error('[RedditAuthDebug] Exception during standard insert:', standardErr);
    }
    
    // Now try the new simpler method
    console.log('[RedditAuthDebug] Trying simplified insert_reddit_token function...');
    const { data: insertData, error: insertError } = await supabase.rpc(
      'insert_reddit_token',
      {
        user_id_input: userId,
        access_token_input: 'test_access_' + Date.now(),
        refresh_token_input: testRefreshToken
      }
    );
    
    if (insertError) {
      console.error('[RedditAuthDebug] Simplified insertion failed:', insertError);
      console.error('[RedditAuthDebug] Error details:', {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details
      });
      
      // Try original method as a fallback
      try {
        console.log('[RedditAuthDebug] Trying older direct_reddit_token_test function...');
        const { data: oldData, error: oldError } = await supabase.rpc(
          'direct_reddit_token_test',
          {
            user_id_param: userId,
            access_token_param: 'test_access',
            refresh_token_param: 'test_refresh'
          }
        );
        
        if (oldError) {
          console.error('[RedditAuthDebug] Original insertion method failed:', oldError);
          return false;
        } else {
          console.log('[RedditAuthDebug] Original insertion method succeeded:', oldData);
          return true;
        }
      } catch (oldErr) {
        console.error('[RedditAuthDebug] Exception with original insertion method:', oldErr);
      }
      
      return false;
    }
    
    console.log('[RedditAuthDebug] Simplified insertion result:', insertData);
    
    // Try to verify if it worked by reading the token (may fail due to RLS)
    try {
      const { data: verifyData, error: verifyError } = await supabase
        .from('reddit_auth_tokens')
        .select('refresh_token')
        .eq('user_id', userId)
        .single();
      
      if (verifyError) {
        console.log('[RedditAuthDebug] Could not verify token due to RLS, but direct insert may have succeeded');
      } else if (verifyData) {
        console.log('[RedditAuthDebug] Verified token was inserted! Token:', 
          verifyData.refresh_token?.substring(0, 10) + '...');
      } else {
        console.log('[RedditAuthDebug] Token not found after insertion');
      }
    } catch (verifyErr) {
      console.error('[RedditAuthDebug] Error verifying insertion:', verifyErr);
    }
    
    return !!insertData;
  } catch (error) {
    console.error('[RedditAuthDebug] Exception during direct insertion:', error);
    return false;
  }
}

// Function to check current auth state in all storage locations
export async function debugRedditAuthState(userId: string): Promise<{
  databaseState: any;
  clientState: RedditAuthState | null;
}> {
  console.log('[RedditAuthDebug] Checking auth state for user', userId);
  
  let databaseState = null;
  let clientState = null;
  
  try {
    // Try the new simpler function first
    const { data: setupData, error: setupError } = await supabase.rpc(
      'check_reddit_token_setup',
      { user_id_input: userId }
    );
    
    if (setupError) {
      console.error('[RedditAuthDebug] Token setup check failed:', setupError);
      
      // Fall back to old function
      try {
        const { data, error } = await supabase.rpc(
          'debug_reddit_auth_state',
          { user_id_param: userId }
        );
        
        if (error) {
          console.error('[RedditAuthDebug] Database state check failed:', error);
          databaseState = { error: error.message, timestamp: new Date().toISOString() };
        } else {
          databaseState = data;
          console.log('[RedditAuthDebug] Database state (legacy):', databaseState);
        }
      } catch (legacyError) {
        console.error('[RedditAuthDebug] Exception during legacy state check:', legacyError);
        databaseState = { error: 'Exception during legacy check', timestamp: new Date().toISOString() };
      }
    } else {
      databaseState = setupData;
      console.log('[RedditAuthDebug] Database state:', databaseState);
    }
  } catch (error) {
    console.error('[RedditAuthDebug] Exception during database state check:', error);
    databaseState = { error: 'Exception during state check', timestamp: new Date().toISOString() };
  }
  
  try {
    // Get the current client-side state from localStorage
    const redditAuthStr = localStorage.getItem('supabase.auth.token');
    if (redditAuthStr) {
      try {
        const authData = JSON.parse(redditAuthStr);
        if (authData?.currentSession?.user?.id === userId) {
          console.log('[RedditAuthDebug] Found auth data in localStorage');
          // Now try to find Reddit-specific data
          const settingsStr = localStorage.getItem(`settings-${userId}`);
          if (settingsStr) {
            const settings = JSON.parse(settingsStr);
            if (settings?.redditAuth) {
              clientState = settings.redditAuth;
              console.log('[RedditAuthDebug] Found Reddit auth in localStorage settings:', 
                settings.redditAuth.refreshToken ? 'Has refresh token' : 'No refresh token');
            }
          }
        }
      } catch (e) {
        console.error('[RedditAuthDebug] Error parsing localStorage data:', e);
      }
    }
  } catch (error) {
    console.error('[RedditAuthDebug] Exception checking local storage:', error);
  }
  
  return {
    databaseState,
    clientState
  };
}

// Function to test if RLS policies are causing issues
export async function testRLSAccess(userId: string): Promise<{
  canRead: boolean;
  canWrite: boolean;
  tableExists: boolean;
  errorDetails: Record<string, unknown> | null;
}> {
  const result = {
    canRead: false,
    canWrite: false,
    tableExists: false,
    errorDetails: null as Record<string, unknown> | null
  };
  
  console.log('[RedditAuthDebug] Starting RLS policy tests for user', userId);
  
  // First check if the table exists at all
  try {
    console.log('[RedditAuthDebug] Checking if table exists...');
    const { data: setupData, error: setupError } = await supabase.rpc(
      'check_reddit_token_setup',
      { user_id_input: userId }
    );
    
    if (setupError) {
      console.error('[RedditAuthDebug] Setup check failed:', setupError);
      
      // Try a different approach
      const { data: tablesData, error: tablesError } = await supabase
        .from('pg_catalog.pg_tables')
        .select('tablename')
        .eq('tablename', 'reddit_auth_tokens')
        .maybeSingle();
      
      if (tablesError) {
        console.error('[RedditAuthDebug] Error checking table existence:', tablesError);
      } else {
        result.tableExists = !!tablesData;
        console.log('[RedditAuthDebug] Table exists check result:', result.tableExists);
      }
    } else {
      result.tableExists = setupData?.table_exists || false;
      console.log('[RedditAuthDebug] Table exists from setup check:', result.tableExists);
      
      // If we got setup data, we already know a lot about the table
      if (setupData) {
        console.log('[RedditAuthDebug] Table details:', setupData);
      }
    }
  } catch (tableError) {
    console.error('[RedditAuthDebug] Exception checking table existence:', tableError);
  }
  
  // Test if we can read anything from the table
  try {
    console.log('[RedditAuthDebug] Testing read access...');
    const { data: readData, error: readError } = await supabase
      .from('reddit_auth_tokens')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    
    result.canRead = !readError;
    
    if (readError) {
      console.error('[RedditAuthDebug] RLS read test failed:', readError);
      console.log('[RedditAuthDebug] Read error details:', {
        code: readError.code,
        message: readError.message,
        details: readError.details
      });
      result.errorDetails = { read: readError as unknown };
    } else {
      console.log('[RedditAuthDebug] RLS read test succeeded:', readData);
    }
  } catch (readException) {
    console.error('[RedditAuthDebug] Exception during read test:', readException);
    if (result.errorDetails) {
      result.errorDetails.readException = readException;
    } else {
      result.errorDetails = { readException };
    }
  }
  
  // Test write access with a unique token each time
  try {
    const testToken = `rls_test_token_${Date.now()}`;
    console.log('[RedditAuthDebug] Testing write access with unique token:', testToken);
    
    const { error: writeError } = await supabase
      .from('reddit_auth_tokens')
      .upsert({
        user_id: userId,
        access_token: testToken,
        refresh_token: `refresh_${testToken}`,
        expires_at: new Date(Date.now() + 3600000).toISOString()
      }, {
        onConflict: 'user_id'
      });
    
    result.canWrite = !writeError;
    
    if (writeError) {
      console.error('[RedditAuthDebug] RLS write test failed:', writeError);
      console.log('[RedditAuthDebug] Write error details:', {
        code: writeError.code,
        message: writeError.message,
        details: writeError.details
      });
      
      if (result.errorDetails) {
        result.errorDetails.write = writeError as unknown;
      } else {
        result.errorDetails = { write: writeError as unknown };
      }
      
      // If we got a permission error, try the secure RPC function instead
      if (writeError.code === 'PGRST301' || writeError.message?.includes('permission')) {
        console.log('[RedditAuthDebug] Permission error detected, trying RPC function...');
        
        try {
          const { data: rpcData, error: rpcError } = await supabase.rpc(
            'insert_reddit_token',
            {
              user_id_input: userId,
              access_token_input: testToken,
              refresh_token_input: `rpc_${testToken}`
            }
          );
          
          if (rpcError) {
            console.error('[RedditAuthDebug] RPC insertion failed:', rpcError);
          } else if (rpcData) {
            console.log('[RedditAuthDebug] RPC insertion succeeded, RLS is working but needs RPC:', rpcData);
            // Mark as successful if RPC works
            result.canWrite = true;
          }
        } catch (rpcErr) {
          console.error('[RedditAuthDebug] Exception during RPC test:', rpcErr);
        }
      }
    } else {
      console.log('[RedditAuthDebug] RLS write test succeeded!');
      
      // Verify we can read what we just wrote
      try {
        const { data: verifyData, error: verifyError } = await supabase
          .from('reddit_auth_tokens')
          .select('access_token, refresh_token')
          .eq('user_id', userId)
          .single();
        
        if (verifyError) {
          console.error('[RedditAuthDebug] Verification read failed after successful write:', verifyError);
        } else {
          console.log('[RedditAuthDebug] Verification successful:', verifyData);
          console.log('[RedditAuthDebug] Expected token:', testToken);
          console.log('[RedditAuthDebug] Found token:', verifyData.access_token);
        }
      } catch (verifyException) {
        console.error('[RedditAuthDebug] Exception during verification:', verifyException);
      }
    }
  } catch (writeException) {
    console.error('[RedditAuthDebug] Exception during write test:', writeException);
    if (result.errorDetails) {
      result.errorDetails.writeException = writeException;
    } else {
      result.errorDetails = { writeException };
    }
  }
  
  return result;
}