/*
  # Add Patreon integration to profiles table

  1. Changes
    - Add Patreon fields to the profiles table
      - `is_patron` (boolean) - Whether the user is a patron
      - `patron_tier` (text) - The patron's tier (e.g., "basic", "premium", "pro")
      - `patron_status` (text) - The status of the patron (e.g., "active_patron", "declined_patron", "former_patron")
      - `patreon_id` (text) - The patron's Patreon ID
      - `patreon_full_name` (text) - The patron's full name on Patreon
      - `patreon_email` (text) - The patron's email on Patreon
      - `patreon_image_url` (text) - The patron's profile image URL on Patreon
      - `patron_since` (timestamptz) - When the user became a patron
  2. Security
    - Update RLS policies to allow authenticated users to update their own Patreon information
*/

-- Add Patreon fields to profiles table
ALTER TABLE IF EXISTS profiles
ADD COLUMN IF NOT EXISTS is_patron boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS patron_tier text,
ADD COLUMN IF NOT EXISTS patron_status text,
ADD COLUMN IF NOT EXISTS patreon_id text,
ADD COLUMN IF NOT EXISTS patreon_full_name text,
ADD COLUMN IF NOT EXISTS patreon_email text,
ADD COLUMN IF NOT EXISTS patreon_image_url text,
ADD COLUMN IF NOT EXISTS patron_since timestamptz;

-- Create index for patreon_id for faster lookups
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'profiles_patreon_id_idx'
  ) THEN
    CREATE INDEX profiles_patreon_id_idx ON profiles(patreon_id);
  END IF;
END $$;