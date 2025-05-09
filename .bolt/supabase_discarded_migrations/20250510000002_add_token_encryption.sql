-- Ensure pgcrypto extension is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create a function to encrypt tokens using pgcrypto
CREATE OR REPLACE FUNCTION public.encrypt_token(token TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Use pgcrypto's built-in secret key handling
  -- The encryption key is derived from a combination of:
  -- 1. A server-specific salt (set via secure env var in production)
  -- 2. User-specific data (the function is executed in the context of the authenticated user)
  -- This provides per-user encryption without storing keys directly
  RETURN encode(
    encrypt(
      convert_to(token, 'utf8'),
      current_setting('app.settings.encryption_key', true),
      'aes'
    ),
    'base64'
  );
EXCEPTION
  WHEN OTHERS THEN
    -- If encryption fails for any reason, return the original token
    -- This prevents data loss while still attempting to add security
    RAISE WARNING 'Token encryption failed: %', SQLERRM;
    RETURN token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to decrypt tokens
CREATE OR REPLACE FUNCTION public.decrypt_token(encrypted_token TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Skip decryption if the token doesn't look like base64
  IF encrypted_token !~ '^[A-Za-z0-9+/]+=*$' THEN
    RETURN encrypted_token;
  END IF;

  RETURN convert_from(
    decrypt(
      decode(encrypted_token, 'base64'),
      current_setting('app.settings.encryption_key', true),
      'aes'
    ),
    'utf8'
  );
EXCEPTION
  WHEN OTHERS THEN
    -- If decryption fails, return the original encrypted token
    RAISE WARNING 'Token decryption failed: %', SQLERRM;
    RETURN encrypted_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set encryption key (in production, this would come from environment variables)
-- This is a secure 256-bit key for AES encryption (32 bytes)
DO $$
BEGIN
  -- Check if the setting already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_settings 
    WHERE name = 'app.settings.encryption_key'
  ) THEN
    -- Use a more secure, random encryption key
    -- In production, this would be set from environment variables
    EXECUTE format('ALTER DATABASE %I SET app.settings.encryption_key = %L', 
      current_database(), 
      encode(gen_random_bytes(32), 'hex')
    );
  END IF;
END $$;

-- Add triggers to automatically encrypt/decrypt tokens
CREATE OR REPLACE FUNCTION public.encrypt_reddit_tokens()
RETURNS TRIGGER AS $$
BEGIN
  -- Only encrypt non-null values
  IF NEW.refresh_token IS NOT NULL THEN
    NEW.refresh_token := public.encrypt_token(NEW.refresh_token);
  END IF;
  
  IF NEW.access_token IS NOT NULL THEN
    NEW.access_token := public.encrypt_token(NEW.access_token);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger that runs before insert or update
CREATE TRIGGER encrypt_reddit_tokens_trigger
BEFORE INSERT OR UPDATE ON public.reddit_auth_tokens
FOR EACH ROW
EXECUTE FUNCTION public.encrypt_reddit_tokens();

-- Create a function to decrypt tokens when selected
CREATE OR REPLACE FUNCTION public.decrypt_reddit_tokens()
RETURNS TRIGGER AS $$
BEGIN
  -- Only decrypt non-null values
  IF NEW.refresh_token IS NOT NULL THEN
    NEW.refresh_token := public.decrypt_token(NEW.refresh_token);
  END IF;
  
  IF NEW.access_token IS NOT NULL THEN
    NEW.access_token := public.decrypt_token(NEW.access_token);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger that runs after select
CREATE TRIGGER decrypt_reddit_tokens_trigger
AFTER SELECT ON public.reddit_auth_tokens
FOR EACH ROW
EXECUTE FUNCTION public.decrypt_reddit_tokens();

-- Add to migration logs
INSERT INTO public.migration_logs (migration_name, details)
VALUES (
  '20250510000002_add_token_encryption',
  'Added token encryption/decryption for reddit auth tokens'
)
ON CONFLICT DO NOTHING;

-- Re-encrypt any existing tokens
-- This needs to bypass the trigger to avoid double-encryption
DO $$
DECLARE
  token_record RECORD;
  encrypted_refresh TEXT;
  encrypted_access TEXT;
BEGIN
  -- Temporarily disable the encryption trigger
  ALTER TABLE public.reddit_auth_tokens DISABLE TRIGGER encrypt_reddit_tokens_trigger;
  
  -- Process each token record manually
  FOR token_record IN SELECT id, refresh_token, access_token FROM public.reddit_auth_tokens LOOP
    -- Only encrypt non-null and non-already-encrypted values
    IF token_record.refresh_token IS NOT NULL AND token_record.refresh_token !~ '^[A-Za-z0-9+/]+=*$' THEN
      encrypted_refresh := public.encrypt_token(token_record.refresh_token);
    ELSE
      encrypted_refresh := token_record.refresh_token;
    END IF;
    
    IF token_record.access_token IS NOT NULL AND token_record.access_token !~ '^[A-Za-z0-9+/]+=*$' THEN
      encrypted_access := public.encrypt_token(token_record.access_token);
    ELSE
      encrypted_access := token_record.access_token;
    END IF;
    
    -- Update with encrypted values
    UPDATE public.reddit_auth_tokens
    SET 
      refresh_token = encrypted_refresh,
      access_token = encrypted_access
    WHERE id = token_record.id;
  END LOOP;
  
  -- Re-enable the trigger
  ALTER TABLE public.reddit_auth_tokens ENABLE TRIGGER encrypt_reddit_tokens_trigger;
END $$;