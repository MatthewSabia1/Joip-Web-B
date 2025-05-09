-- Create a function to get reddit tokens for a user with explicit JSON format
-- First, attempt to drop if it already exists to prevent errors
DROP FUNCTION IF EXISTS public.get_reddit_tokens_for_user;

-- Create the function with SECURITY DEFINER
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
  -- Log errors
  INSERT INTO public.migration_logs (
    migration_name, 
    details
  ) VALUES (
    'get_reddit_tokens_for_user_error',
    format('Error getting tokens for user %s: %s', user_id_param, SQLERRM)
  );
  
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

-- Log this migration
INSERT INTO public.migration_logs (
  migration_name, 
  details
) VALUES (
  '20250512000100_add_token_getter_rpc',
  'Added get_reddit_tokens_for_user RPC function'
);