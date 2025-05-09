-- Create reddit_auth_tokens table for persistent Reddit authentication
CREATE TABLE IF NOT EXISTS public.reddit_auth_tokens (
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

-- Add RLS policies
ALTER TABLE public.reddit_auth_tokens ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to read only their own tokens
CREATE POLICY "Users can read their own reddit auth tokens" 
  ON public.reddit_auth_tokens 
  FOR SELECT 
  USING (auth.uid() = user_id);

-- Policy to allow users to insert their own tokens
CREATE POLICY "Users can insert their own reddit auth tokens" 
  ON public.reddit_auth_tokens 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Policy to allow users to update their own tokens
CREATE POLICY "Users can update their own reddit auth tokens" 
  ON public.reddit_auth_tokens 
  FOR UPDATE 
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.reddit_auth_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_set_updated_timestamp();

-- Create function to migrate existing data from preferences
CREATE OR REPLACE FUNCTION public.migrate_reddit_auth_tokens() 
RETURNS void AS $$
DECLARE
  user_record RECORD;
  token_data JSONB;
BEGIN
  FOR user_record IN SELECT id, preferences FROM public.user_settings WHERE preferences ? 'redditAuth' LOOP
    token_data := user_record.preferences->'redditAuth';
    
    -- Check if the token data actually contains tokens
    IF token_data ? 'refreshToken' THEN
      -- Check if the user already has a record in reddit_auth_tokens
      IF NOT EXISTS (SELECT 1 FROM public.reddit_auth_tokens WHERE user_id = user_record.id) THEN
        INSERT INTO public.reddit_auth_tokens (
          user_id, 
          access_token, 
          refresh_token, 
          expires_at,
          username
        ) VALUES (
          user_record.id,
          token_data->>'accessToken',
          token_data->>'refreshToken',
          (CASE 
            WHEN token_data->>'expiresAt' IS NOT NULL 
            THEN (token_data->>'expiresAt')::TIMESTAMPTZ 
            ELSE NULL 
          END),
          token_data->>'username'
        );
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;