-- Fix functions for Reddit token handling

-- First drop existing functions to recreate them correctly
DROP FUNCTION IF EXISTS public.get_reddit_tokens_for_user;
DROP FUNCTION IF EXISTS public.check_reddit_token_setup;

-- Create a simple direct token test function that doesn't require a migration log table
CREATE OR REPLACE FUNCTION public.test_reddit_token_insert(
  user_id_param UUID,
  access_token_param TEXT,
  refresh_token_param TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Simple insert/update
  INSERT INTO public.reddit_auth_tokens (
    user_id,
    access_token,
    refresh_token,
    expires_at
  ) VALUES (
    user_id_param,
    access_token_param,
    refresh_token_param,
    NOW() + INTERVAL '1 hour'
  )
  ON CONFLICT (user_id) DO UPDATE SET
    access_token = access_token_param,
    refresh_token = refresh_token_param,
    expires_at = NOW() + INTERVAL '1 hour',
    updated_at = NOW();
  
  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.test_reddit_token_insert TO anon;
GRANT EXECUTE ON FUNCTION public.test_reddit_token_insert TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_reddit_token_insert TO service_role;

-- Create a function to get reddit tokens for a user with explicit JSON format
CREATE OR REPLACE FUNCTION public.get_reddit_tokens_for_user(
  user_id_param UUID
)
RETURNS JSONB AS $$
DECLARE
  token_record RECORD;
  result JSONB;
BEGIN
  -- Get the record
  SELECT 
    access_token,
    refresh_token,
    expires_at,
    username
  INTO token_record
  FROM public.reddit_auth_tokens
  WHERE user_id = user_id_param;
  
  -- If record exists, return it
  IF token_record IS NOT NULL THEN
    result := to_jsonb(token_record);
    RETURN result;
  END IF;
  
  -- Return empty JSON object if not found
  RETURN '{}'::JSONB;
EXCEPTION WHEN OTHERS THEN
  -- Return error info
  RETURN jsonb_build_object(
    'error', TRUE,
    'message', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_reddit_tokens_for_user TO anon;
GRANT EXECUTE ON FUNCTION public.get_reddit_tokens_for_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reddit_tokens_for_user TO service_role;

-- Create a simplified function to check if a user's token exists
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
  -- Check if table exists - use simpler method
  BEGIN
    -- Try to perform a basic query on the table
    PERFORM 1 FROM public.reddit_auth_tokens LIMIT 1;
    table_exists := TRUE;
  EXCEPTION WHEN undefined_table THEN
    table_exists := FALSE;
  END;
  
  -- Initialize result
  result := jsonb_build_object(
    'table_exists', table_exists,
    'has_user_token', FALSE,
    'token_details', NULL
  );
  
  -- If table exists, check if user has tokens
  IF table_exists THEN
    BEGIN
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
    EXCEPTION WHEN OTHERS THEN
      result := jsonb_set(result, '{error_in_token_check}', to_jsonb(SQLERRM));
    END;
  END IF;
  
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  -- Return error information
  RETURN jsonb_build_object(
    'error', TRUE,
    'message', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.check_reddit_token_setup TO anon;
GRANT EXECUTE ON FUNCTION public.check_reddit_token_setup TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_reddit_token_setup TO service_role;