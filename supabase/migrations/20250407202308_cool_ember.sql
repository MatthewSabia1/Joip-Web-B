/*
  # Add JOI Sessions Table
  
  1. New Tables
    - `joi_sessions` - For storing user JOI sessions as projects
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `title` (text) - Custom name for the session
      - `subreddits` (text[]) - Array of subreddit names
      - `system_prompt` (text) - Custom AI system prompt
      - `interval` (integer) - Slideshow interval in seconds
      - `transition` (text) - Transition effect name
      - `created_at` (timestamp) - Creation time
      - `updated_at` (timestamp) - Last update time
      - `is_favorite` (boolean) - Whether this is a favorite session
  
  2. Security
    - Enable RLS on table
    - Add policies for users to manage their own sessions
*/

-- Create joi_sessions table
CREATE TABLE IF NOT EXISTS joi_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subreddits TEXT[] NOT NULL DEFAULT '{}',
  system_prompt TEXT NOT NULL,
  interval INTEGER NOT NULL DEFAULT 10,
  transition TEXT NOT NULL DEFAULT 'fade',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_favorite BOOLEAN NOT NULL DEFAULT false
);

-- Create index for user_id for faster lookups
CREATE INDEX IF NOT EXISTS joi_sessions_user_id_idx ON joi_sessions(user_id);

-- Enable row level security
ALTER TABLE joi_sessions ENABLE ROW LEVEL SECURITY;

-- Create policy for users to read their own sessions
CREATE POLICY "Users can read their own sessions"
  ON joi_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create policy for users to insert their own sessions
CREATE POLICY "Users can insert their own sessions"
  ON joi_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create policy for users to update their own sessions
CREATE POLICY "Users can update their own sessions"
  ON joi_sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create policy for users to delete their own sessions
CREATE POLICY "Users can delete their own sessions"
  ON joi_sessions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Trigger to update the updated_at field
CREATE OR REPLACE FUNCTION update_joi_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_joi_sessions_updated_at
BEFORE UPDATE ON joi_sessions
FOR EACH ROW
EXECUTE FUNCTION update_joi_sessions_updated_at();