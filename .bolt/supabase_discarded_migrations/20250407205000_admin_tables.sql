/*
  # Admin Tables for Joip
  
  1. New Tables
    - `admin_users` - Tracks which users are administrators
    - `app_settings` - Global application settings
    - `prompt_themes` - Custom themes/prompts for AI captions
  
  2. Security
    - Enable RLS on tables
    - Add policies for proper access control
*/

-- Add is_admin column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Create admin_users table
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Create policy to allow admins to read all admin_users
CREATE POLICY "Admins can read admin_users"
  ON admin_users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = auth.uid()
    )
  );

-- Create policy to allow admins to insert new admin_users
CREATE POLICY "Admins can insert admin_users"
  ON admin_users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = auth.uid()
    )
  );

-- Create policy to allow admins to delete admin_users
CREATE POLICY "Admins can delete admin_users"
  ON admin_users
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = auth.uid()
    )
  );

-- Create app_settings table
CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1, -- Use a single row for global settings
  openrouter_api_key TEXT,
  openrouter_model TEXT NOT NULL DEFAULT 'meta-llama/llama-4-maverick',
  default_system_prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NOT NULL
);

-- Enable RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow admins to read app_settings
CREATE POLICY "Admins can read app_settings"
  ON app_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = auth.uid()
    )
  );

-- Create policy to allow admins to update app_settings
CREATE POLICY "Admins can update app_settings"
  ON app_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = auth.uid()
    )
  );

-- Create policy to allow admins to insert app_settings
CREATE POLICY "Admins can insert app_settings"
  ON app_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = auth.uid()
    )
  );

-- Create prompt_themes table
CREATE TABLE IF NOT EXISTS prompt_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  prompt TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE prompt_themes ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public read access to public themes
CREATE POLICY "Anyone can read public themes"
  ON prompt_themes
  FOR SELECT
  TO authenticated
  USING (is_public = true);

-- Create policy to allow admins to read all themes
CREATE POLICY "Admins can read all themes"
  ON prompt_themes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = auth.uid()
    )
  );

-- Create policy to allow admins to insert themes
CREATE POLICY "Admins can insert themes"
  ON prompt_themes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = auth.uid()
    )
  );

-- Create policy to allow admins to update themes
CREATE POLICY "Admins can update themes"
  ON prompt_themes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = auth.uid()
    )
  );

-- Create policy to allow admins to delete themes
CREATE POLICY "Admins can delete themes"
  ON prompt_themes
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users au
      WHERE au.user_id = auth.uid()
    )
  );

-- Create stored procedure to get users with email
CREATE OR REPLACE FUNCTION get_users_with_email()
RETURNS TABLE (
  id uuid,
  email text
)
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the calling user is an admin
  IF NOT EXISTS (
    SELECT 1 FROM admin_users
    WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: Only administrators can access user emails';
  END IF;

  RETURN QUERY
  SELECT au.id, au.email::text
  FROM auth.users au;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update profiles.is_admin when an admin user is added/removed
CREATE OR REPLACE FUNCTION sync_admin_status()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE profiles SET is_admin = true WHERE id = NEW.user_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE profiles SET is_admin = false WHERE id = OLD.user_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS admin_user_insert_trigger ON admin_users;
CREATE TRIGGER admin_user_insert_trigger
AFTER INSERT ON admin_users
FOR EACH ROW
EXECUTE FUNCTION sync_admin_status();

DROP TRIGGER IF EXISTS admin_user_delete_trigger ON admin_users;
CREATE TRIGGER admin_user_delete_trigger
AFTER DELETE ON admin_users
FOR EACH ROW
EXECUTE FUNCTION sync_admin_status();

-- Insert a default record into app_settings
INSERT INTO app_settings (id, openrouter_model, default_system_prompt, updated_by)
VALUES (
  1, 
  'meta-llama/llama-4-maverick',
  'You are a witty commentator for a Joip AI slideshow. Given an image or post from Reddit, provide a short, insightful, and sometimes humorous caption. Keep it concise (2-3 sentences maximum) and engaging. Acknowledge the subreddit it comes from when relevant.',
  auth.uid()
)
ON CONFLICT (id) DO NOTHING;