/*
  # Combine username and full_name into display_name
  
  This migration combines the username and full_name fields in the profiles table into a single display_name field.
  
  Changes:
  1. Add display_name column to profiles table
  2. Populate display_name with username or full_name values (prefer username)
  3. Update handle_new_user() function to use display_name instead of username
  4. Update any other functions that reference username or full_name
*/

-- Add display_name column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Populate display_name with existing usernames or full_name values
UPDATE profiles 
SET display_name = 
  CASE 
    WHEN username IS NOT NULL AND username != '' THEN username
    WHEN full_name IS NOT NULL AND full_name != '' THEN full_name
    ELSE NULL 
  END;

-- Update the handle_new_user function to use display_name instead of username
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, username, avatar_url)
  VALUES (
    NEW.id,
    NULLIF(NEW.raw_user_meta_data->>'display_name', ''), -- Use display_name from metadata if available 
    NULLIF(NEW.raw_user_meta_data->>'username', ''),     -- Maintain username for backward compatibility
    'https://api.dicebear.com/7.x/bottts/svg?seed=' || NEW.id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment to the function
COMMENT ON FUNCTION public.handle_new_user IS 'Creates a new profile record with optional display_name when a new user signs up';

-- Note: We are not removing the username and full_name columns yet to ensure backward compatibility.
-- They will be marked as deprecated and removed in a future migration after all code is updated.
COMMENT ON COLUMN profiles.username IS 'DEPRECATED: Use display_name instead';
COMMENT ON COLUMN profiles.full_name IS 'DEPRECATED: Use display_name instead';