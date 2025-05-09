-- Create missing RPC functions needed for Reddit token handling
-- First, attempt to drop functions if they already exist to prevent errors
DROP FUNCTION IF EXISTS public.insert_reddit_token;
DROP FUNCTION IF EXISTS public.check_reddit_token_setup;

-- Create a simplified token insertion function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.insert_reddit_token(
  user_id_input UUID,
  access_token_input TEXT,
  refresh_token_input TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Attempt to insert or update the token record
  INSERT INTO public.reddit_auth_tokens (
    user_id,
    access_token,
    refresh_token,
    expires_at
  ) VALUES (
    user_id_input,
    access_token_input,
    refresh_token_input,
    NOW() + INTERVAL '1 hour'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    access_token = access_token_input,
    refresh_token = refresh_token_input,
    expires_at = NOW() + INTERVAL '1 hour',
    updated_at = NOW();
  
  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  -- Log any errors
  INSERT INTO public.migration_logs (
    migration_name, 
    details
  ) VALUES (
    'insert_reddit_token_error',
    format('Error inserting token for user %s: %s', user_id_input, SQLERRM)
  );
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions to web_anon user
GRANT EXECUTE ON FUNCTION public.insert_reddit_token TO anon;
GRANT EXECUTE ON FUNCTION public.insert_reddit_token TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_reddit_token TO service_role;

-- Create a function to check if a user's token exists and setup is correct
CREATE OR REPLACE FUNCTION public.check_reddit_token_setup(
  user_id_input UUID
)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
  table_exists BOOLEAN;
  has_token BOOLEAN;
  token_record RECORD;
BEGIN
  -- Check if table exists
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'reddit_auth_tokens'
  ) INTO table_exists;
  
  -- Initialize result
  result := jsonb_build_object(
    'table_exists', table_exists,
    'has_user_token', FALSE,
    'token_details', NULL
  );
  
  -- If table exists, check if user has tokens
  IF table_exists THEN
    SELECT EXISTS (
      SELECT 1 FROM public.reddit_auth_tokens 
      WHERE user_id = user_id_input
    ) INTO has_token;
    
    result := jsonb_set(result, '{has_user_token}', to_jsonb(has_token));
    
    -- If user has token, get basic metadata
    IF has_token THEN
      SELECT 
        id, 
        created_at, 
        updated_at,
        (refresh_token IS NOT NULL) AS has_refresh,
        (access_token IS NOT NULL) AS has_access
      INTO token_record 
      FROM public.reddit_auth_tokens 
      WHERE user_id = user_id_input;
      
      result := jsonb_set(result, '{token_details}', to_jsonb(token_record));
    END IF;
  END IF;
  
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  -- Return error information
  RETURN jsonb_build_object(
    'error', TRUE,
    'message', SQLERRM,
    'table_exists', table_exists
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.check_reddit_token_setup TO anon;
GRANT EXECUTE ON FUNCTION public.check_reddit_token_setup TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_reddit_token_setup TO service_role;

-- Log this migration
INSERT INTO public.migration_logs (
  migration_name, 
  details
) VALUES (
  '20250512000000_fix_reddit_token_rpc_functions',
  'Added RPC functions for Reddit token handling with SECURITY DEFINER'
);