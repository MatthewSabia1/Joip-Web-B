/*
  # Add User Settings Table
  
  1. New Tables
    - `user_settings` - For storing user application preferences
      - `user_id` (uuid, primary key, references profiles)
      - `preferences` (jsonb) - Stores user preferences as JSON
      - `updated_at` (timestamp)
  
  2. Security
    - Enable RLS on table
    - Add policies for users to manage their own settings
*/

-- Create user_settings table
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  preferences JSONB DEFAULT '{}'::jsonb NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable row level security
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Create policy for users to read their own settings
CREATE POLICY "Users can read their own settings"
  ON user_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create policy for users to insert their own settings
CREATE POLICY "Users can insert their own settings"
  ON user_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create policy for users to update their own settings
CREATE POLICY "Users can update their own settings"
  ON user_settings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Trigger to update the updated_at field
CREATE OR REPLACE FUNCTION update_user_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_settings_updated_at
BEFORE UPDATE ON user_settings
FOR EACH ROW
EXECUTE FUNCTION update_user_settings_updated_at();