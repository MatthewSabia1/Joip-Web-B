-- Execute migration function to move existing tokens from preferences to the dedicated table
SELECT public.migrate_reddit_auth_tokens();

-- Optional: Add a comment to the migration log
COMMENT ON TABLE public.reddit_auth_tokens IS 'Stores Reddit OAuth tokens for persistent authentication';

-- For security logging
INSERT INTO public.migration_logs (migration_name, details)
VALUES (
  '20250510000001_migrate_reddit_tokens',
  'Migrated Reddit tokens from user_settings.preferences to dedicated reddit_auth_tokens table'
)
ON CONFLICT DO NOTHING;