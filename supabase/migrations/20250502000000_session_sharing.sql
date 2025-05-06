/*
  # Add Session Sharing Functionality
  
  1. Changes to joi_sessions table
    - Add `is_public` column to allow public sharing
    - Add `shared_url_id` column for public share links
    
  2. New Tables  
    - `shared_sessions` - Tracks sessions shared between users
      - `id` (uuid, primary key)
      - `session_id` (uuid, references joi_sessions)
      - `owner_id` (uuid, references profiles)
      - `shared_with_id` (uuid, references profiles)
      - `created_at` (timestamp)
      
  3. New Functions
    - `share_session` - RPC to share a session with another user
    - `unshare_session` - RPC to remove sharing
*/

-- Add sharing columns to joi_sessions
-- Note: is_public may already exist in the joi_sessions table,
-- so we're only adding the shared_url_id column
ALTER TABLE joi_sessions 
ADD COLUMN IF NOT EXISTS shared_url_id UUID UNIQUE;

-- Create shared_sessions table
CREATE TABLE IF NOT EXISTS shared_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES joi_sessions(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shared_with_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, shared_with_id)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS shared_sessions_owner_id_idx ON shared_sessions(owner_id);
CREATE INDEX IF NOT EXISTS shared_sessions_shared_with_id_idx ON shared_sessions(shared_with_id);

-- Enable RLS
ALTER TABLE shared_sessions ENABLE ROW LEVEL SECURITY;

-- Create policy for owners to read their shared sessions
CREATE POLICY "Owners can see sessions they shared"
  ON shared_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = owner_id);

-- Create policy for recipients to read sessions shared with them
CREATE POLICY "Recipients can see sessions shared with them"
  ON shared_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = shared_with_id);

-- Create policy for owners to delete their shared sessions
CREATE POLICY "Owners can delete their shared sessions"
  ON shared_sessions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = owner_id);

-- Create policy for recipients to delete sessions shared with them (remove themselves)
CREATE POLICY "Recipients can remove sessions shared with them"
  ON shared_sessions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = shared_with_id);

-- Create RPC function to share a session
CREATE OR REPLACE FUNCTION share_session(p_session_id UUID, p_username TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id UUID;
  v_recipient_id UUID;
BEGIN
  -- Get the owner ID (current user)
  v_owner_id := auth.uid();
  
  -- Check if the session exists and belongs to the user
  IF NOT EXISTS (
    SELECT 1 FROM joi_sessions 
    WHERE id = p_session_id AND user_id = v_owner_id
  ) THEN
    RAISE EXCEPTION 'Session not found or you are not the owner';
  END IF;
  
  -- Find the recipient by username
  SELECT id INTO v_recipient_id
  FROM profiles
  WHERE username = p_username;
  
  IF v_recipient_id IS NULL THEN
    RAISE EXCEPTION 'User % not found', p_username;
  END IF;
  
  -- Cannot share with yourself
  IF v_recipient_id = v_owner_id THEN
    RAISE EXCEPTION 'Cannot share a session with yourself';
  END IF;
  
  -- Insert the sharing record
  INSERT INTO shared_sessions (session_id, owner_id, shared_with_id)
  VALUES (p_session_id, v_owner_id, v_recipient_id)
  ON CONFLICT (session_id, shared_with_id) DO NOTHING;
END;
$$;

-- Create RPC function to unshare a session
CREATE OR REPLACE FUNCTION unshare_session(p_session_id UUID, p_username TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id UUID;
  v_recipient_id UUID;
BEGIN
  -- Get the owner ID (current user)
  v_owner_id := auth.uid();
  
  -- Check if the session exists and belongs to the user
  IF NOT EXISTS (
    SELECT 1 FROM joi_sessions 
    WHERE id = p_session_id AND user_id = v_owner_id
  ) THEN
    RAISE EXCEPTION 'Session not found or you are not the owner';
  END IF;
  
  -- Find the recipient by username
  SELECT id INTO v_recipient_id
  FROM profiles
  WHERE username = p_username;
  
  IF v_recipient_id IS NULL THEN
    RAISE EXCEPTION 'User % not found', p_username;
  END IF;
  
  -- Delete the sharing record
  DELETE FROM shared_sessions
  WHERE session_id = p_session_id 
    AND owner_id = v_owner_id 
    AND shared_with_id = v_recipient_id;
END;
$$;

-- Update joi_sessions read policy to allow reading public sessions
DROP POLICY IF EXISTS "Users can read public sessions" ON joi_sessions;
CREATE POLICY "Users can read public sessions"
  ON joi_sessions
  FOR SELECT
  TO authenticated
  USING (is_public = true);

-- Update read policy for joi_sessions to include shared sessions
DROP POLICY IF EXISTS "Users can read shared sessions" ON joi_sessions;
CREATE POLICY "Users can read shared sessions"
  ON joi_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shared_sessions
      WHERE session_id = joi_sessions.id
      AND shared_with_id = auth.uid()
    )
  );