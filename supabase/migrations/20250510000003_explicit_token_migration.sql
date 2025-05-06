-- Add a migration tracking table to track users who have been migrated
CREATE TABLE IF NOT EXISTS public.migration_user_tracking (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reddit_tokens_migrated BOOLEAN DEFAULT FALSE,
  reddit_tokens_migrated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add trigger for updated_at
CREATE TRIGGER set_migration_tracking_updated_at
  BEFORE UPDATE ON public.migration_user_tracking
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_updated_timestamp();

-- Add RLS policies
ALTER TABLE public.migration_user_tracking ENABLE ROW LEVEL SECURITY;

-- Only admins can access migration tracking
CREATE POLICY "Only admins can access migration tracking" 
  ON public.migration_user_tracking 
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles WHERE is_admin = true
    )
  );

-- Create an improved migration function with tracking and validation
CREATE OR REPLACE FUNCTION public.migrate_user_reddit_tokens(user_id_param UUID)
RETURNS BOOLEAN AS $$
DECLARE
  token_data JSONB;
  migration_success BOOLEAN := FALSE;
  pref_data RECORD;
BEGIN
  -- Check if already migrated
  IF EXISTS (
    SELECT 1 FROM public.migration_user_tracking 
    WHERE user_id = user_id_param AND reddit_tokens_migrated = TRUE
  ) THEN
    RETURN TRUE; -- Already migrated
  END IF;

  -- Get user preferences
  SELECT preferences INTO pref_data 
  FROM public.user_settings 
  WHERE user_id = user_id_param;
  
  -- Check if reddit tokens exist in preferences
  IF pref_data IS NOT NULL AND 
     pref_data.preferences ? 'redditAuth' AND
     pref_data.preferences->'redditAuth' ? 'refreshToken' THEN
    
    token_data := pref_data.preferences->'redditAuth';
    
    -- Check if token already exists in the tokens table
    IF NOT EXISTS (
      SELECT 1 FROM public.reddit_auth_tokens 
      WHERE user_id = user_id_param
    ) THEN
      -- Insert the token data
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
          THEN (token_data->>'expiresAt')::TIMESTAMPTZ 
          ELSE NULL 
        END),
        token_data->>'username'
      );
      
      migration_success := TRUE;
    ELSE
      -- There's already a token record, so we've migrated previously
      migration_success := TRUE;
    END IF;
    
    -- Record the migration status
    INSERT INTO public.migration_user_tracking (
      user_id, 
      reddit_tokens_migrated, 
      reddit_tokens_migrated_at
    ) VALUES (
      user_id_param, 
      migration_success, 
      CASE WHEN migration_success THEN now() ELSE NULL END
    )
    ON CONFLICT (user_id) 
    DO UPDATE SET
      reddit_tokens_migrated = migration_success,
      reddit_tokens_migrated_at = CASE WHEN migration_success THEN now() ELSE NULL END;
  END IF;
  
  RETURN migration_success;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create an admin function to migrate all users
CREATE OR REPLACE FUNCTION public.migrate_all_reddit_tokens()
RETURNS TABLE(user_id UUID, success BOOLEAN) AS $$
DECLARE
  user_rec RECORD;
  success_count INT := 0;
  failure_count INT := 0;
BEGIN
  FOR user_rec IN 
    SELECT id FROM auth.users
  LOOP
    BEGIN
      user_id := user_rec.id;
      success := public.migrate_user_reddit_tokens(user_rec.id);
      
      IF success THEN
        success_count := success_count + 1;
      ELSE
        failure_count := failure_count + 1;
      END IF;
      
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      -- Log failure but continue with next user
      INSERT INTO public.migration_logs (migration_name, details)
      VALUES (
        'migrate_all_reddit_tokens_error',
        format('Error migrating tokens for user %s: %s', user_rec.id, SQLERRM)
      );
      
      user_id := user_rec.id;
      success := FALSE;
      failure_count := failure_count + 1;
      RETURN NEXT;
    END;
  END LOOP;
  
  -- Log completion
  INSERT INTO public.migration_logs (migration_name, details)
  VALUES (
    'migrate_all_reddit_tokens_complete',
    format('Migrated tokens for %s users, %s failures', success_count, failure_count)
  );
  
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add to migration logs
INSERT INTO public.migration_logs (migration_name, details)
VALUES (
  '20250510000003_explicit_token_migration',
  'Added explicit token migration functions with tracking'
)
ON CONFLICT DO NOTHING;

-- Execute migration for all existing users
DO $$
BEGIN
  PERFORM public.migrate_all_reddit_tokens();
END $$;