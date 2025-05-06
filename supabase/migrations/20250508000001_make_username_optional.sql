/*
  # Make username optional

  This migration modifies the user creation trigger function to make the username field optional.
  
  Changes:
  1. Update `handle_new_user()` function to make username optional
  2. Add a comment to explain the change
*/

-- Drop and recreate the function with updated logic for optional username
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, avatar_url)
  VALUES (
    NEW.id,
    NULLIF(NEW.raw_user_meta_data->>'username', ''), -- Use NULL if username is empty or not provided
    'https://api.dicebear.com/7.x/bottts/svg?seed=' || NEW.id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- No need to recreate the trigger as we're just updating the function it calls
COMMENT ON FUNCTION public.handle_new_user IS 'Creates a new profile record with optional username when a new user signs up';