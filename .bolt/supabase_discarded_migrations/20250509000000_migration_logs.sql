-- Create a migration_logs table to track migrations and other database changes
CREATE TABLE IF NOT EXISTS public.migration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_name TEXT NOT NULL,
  details TEXT,
  applied_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_migration_name UNIQUE (migration_name)
);

-- Add comment to table
COMMENT ON TABLE public.migration_logs IS 'Tracks database migrations and schema changes for auditing';

-- Add RLS policies
ALTER TABLE public.migration_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read migration logs
CREATE POLICY "Only admins can read migration logs" 
  ON public.migration_logs 
  FOR SELECT 
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles WHERE is_admin = true
    )
  );

-- Initial log entry
INSERT INTO public.migration_logs (migration_name, details)
VALUES (
  '20250509000000_migration_logs',
  'Created migration_logs table for tracking database changes'
)
ON CONFLICT DO NOTHING;