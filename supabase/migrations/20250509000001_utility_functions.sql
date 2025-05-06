-- Create updated_at trigger functionality
CREATE OR REPLACE FUNCTION public.trigger_set_updated_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Log the migration
INSERT INTO public.migration_logs (migration_name, details)
VALUES (
  '20250509000001_utility_functions',
  'Added utility functions including trigger_set_updated_timestamp'
)
ON CONFLICT DO NOTHING;