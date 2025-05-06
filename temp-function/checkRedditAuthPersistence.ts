import { supabase } from '@/lib/supabase';
import { RedditAuthState } from '@/types';

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
        details += `Database error: ${error.message}. `;
      } else {
        details += 'No tokens found in database. ';
      }
    } else if (dbTokens) {
      inDatabase = !!dbTokens.refresh_token;
      details += `Database: ${inDatabase ? 'Tokens found' : 'No refresh token'}. `;
    }
  } catch (error) {
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
      details += `Preferences error: ${error.message}. `;
    } else if (userSettings?.preferences?.redditAuth?.refreshToken) {
      inPreferences = true;
      details += 'Tokens found in preferences. ';
    } else {
      details += 'No tokens in preferences. ';
    }
  } catch (error) {
    details += `Preferences exception: ${error instanceof Error ? error.message : String(error)}. `;
  }

  // Check current memory state
  const inMemory = !!currentAuthState.refreshToken;
  details += `In-memory: ${inMemory ? 'Authenticated' : 'Not authenticated'}. `;

  // Determine overall status
  const isPersisted = inDatabase || inPreferences;

  return {
    isPersisted,
    inDatabase,
    inPreferences,
    details
  };
}