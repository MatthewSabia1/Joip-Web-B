-- First, let's check if the table exists; drop it if it does
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_tables WHERE tablename = 'reddit_auth_tokens') THEN
    DROP TABLE IF EXISTS public.reddit_auth_tokens;
    
    INSERT INTO public.migration_logs (
      migration_name, 
      details
    ) VALUES (
      'fix_reddit_tokens',
      'Dropped existing reddit_auth_tokens table'
    );
  ELSE
    INSERT INTO public.migration_logs (
      migration_name, 
      details
    ) VALUES (
      'fix_reddit_tokens',
      'reddit_auth_tokens table did not exist'
    );
  END IF;
END
$$;

-- Create the reddit_auth_tokens table from scratch
CREATE TABLE public.reddit_auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  username TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_reddit_auth_per_user UNIQUE (user_id)
);

-- Log table creation
INSERT INTO public.migration_logs (
  migration_name, 
  details
) VALUES (
  'fix_reddit_tokens',
  'Created reddit_auth_tokens table'
);

-- Add RLS policies, ensuring they are correctly configured
ALTER TABLE public.reddit_auth_tokens ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "Users can read their own reddit auth tokens" ON public.reddit_auth_tokens;
DROP POLICY IF EXISTS "Users can insert their own reddit auth tokens" ON public.reddit_auth_tokens;
DROP POLICY IF EXISTS "Users can update their own reddit auth tokens" ON public.reddit_auth_tokens;
DROP POLICY IF EXISTS "Users can delete their own reddit auth tokens" ON public.reddit_auth_tokens;

-- Create simpler, more permissive policies
CREATE POLICY "Users can manage their own reddit auth tokens" 
ON public.reddit_auth_tokens 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Add updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at ON public.reddit_auth_tokens;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.reddit_auth_tokens
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_updated_timestamp();

-- Create a simplified token migration function
DROP FUNCTION IF EXISTS public.migrate_user_reddit_tokens;
CREATE OR REPLACE FUNCTION public.migrate_user_reddit_tokens(user_id_param UUID)
RETURNS BOOLEAN AS $$
DECLARE
  token_data JSONB;
  migration_success BOOLEAN := FALSE;
  pref_data RECORD;
BEGIN
  -- Get user preferences
  SELECT preferences INTO pref_data 
  FROM public.user_settings 
  WHERE user_id = user_id_param;
  
  -- Check if reddit tokens exist in preferences
  IF pref_data IS NOT NULL AND 
     pref_data.preferences ? 'redditAuth' AND
     pref_data.preferences->'redditAuth' ? 'refreshToken' THEN
    
    token_data := pref_data.preferences->'redditAuth';
    
    -- Insert or update token data
    INSERT INTO public.reddit_auth_tokens (
      user_id, 
      access_token, 
      refresh_token, 
      expires_at,
      username
    ) VALUES (
      user_id_param,
      token_data->>'accessToken',
      token_data->>'refreshToken',
      (CASE 
        WHEN token_data->>'expiresAt' IS NOT NULL 
        THEN to_timestamp((token_data->>'expiresAt')::bigint / 1000)
        ELSE NULL 
      END),
      NULL
    )
    ON CONFLICT (user_id) DO UPDATE SET
      access_token = token_data->>'accessToken',
      refresh_token = token_data->>'refreshToken',
      expires_at = (CASE 
          WHEN token_data->>'expiresAt' IS NOT NULL 
          THEN to_timestamp((token_data->>'expiresAt')::bigint / 1000)
          ELSE NULL 
        END),
      updated_at = now();
    
    migration_success := TRUE;
    
    -- Log the successful migration
    INSERT INTO public.migration_logs (
      migration_name, 
      details
    ) VALUES (
      'migrate_user_reddit_tokens',
      format('Successfully migrated tokens for user %s', user_id_param)
    );
  END IF;
  
  RETURN migration_success;
EXCEPTION WHEN OTHERS THEN
  -- Log any errors
  INSERT INTO public.migration_logs (
    migration_name, 
    details
  ) VALUES (
    'migrate_user_reddit_tokens_error',
    format('Error migrating tokens for user %s: %s', user_id_param, SQLERRM)
  );
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a direct token test insertion function that doesn't use encryption
CREATE OR REPLACE FUNCTION public.direct_reddit_token_test(
  user_id_param UUID,
  access_token_param TEXT,
  refresh_token_param TEXT,
  expires_at_param TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Insert or update the token
  INSERT INTO public.reddit_auth_tokens (
    user_id,
    access_token,
    refresh_token,
    expires_at
  ) VALUES (
    user_id_param,
    access_token_param,
    refresh_token_param,
    COALESCE(expires_at_param, now() + interval '1 hour')
  )
  ON CONFLICT (user_id) DO UPDATE SET
    access_token = access_token_param,
    refresh_token = refresh_token_param,
    expires_at = COALESCE(expires_at_param, now() + interval '1 hour'),
    updated_at = now();
    
  -- Log the test
  INSERT INTO public.migration_logs (
    migration_name, 
    details
  ) VALUES (
    'direct_reddit_token_test',
    format('Test token inserted for user %s', user_id_param)
  );
  
  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  -- Log any errors
  INSERT INTO public.migration_logs (
    migration_name, 
    details
  ) VALUES (
    'direct_reddit_token_test_error',
    format('Error inserting test token for user %s: %s', user_id_param, SQLERRM)
  );
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Log completion of this migration
INSERT INTO public.migration_logs (
  migration_name, 
  details
) VALUES (
  '20250511000000_fix_reddit_token_storage',
  'Fixed reddit token storage table and functions'
);