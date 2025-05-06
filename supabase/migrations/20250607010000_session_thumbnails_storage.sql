-- Create a storage bucket for session thumbnails
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES ('session-thumbnails', 'session-thumbnails', TRUE, FALSE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

-- Set up security policies for the session-thumbnails bucket
-- Allow authenticated users to upload files only to their own folder
CREATE POLICY "Users can upload session thumbnails to their own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'session-thumbnails' AND
    (auth.uid()::text = SPLIT_PART(path, '/', 1))
  );

-- Allow any user to read public thumbnails
CREATE POLICY "Anyone can view session thumbnails" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'session-thumbnails');

-- Allow users to update their own thumbnails
CREATE POLICY "Users can update their own session thumbnails" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'session-thumbnails' AND
    (auth.uid()::text = SPLIT_PART(path, '/', 1))
  );

-- Allow users to delete their own thumbnails
CREATE POLICY "Users can delete their own session thumbnails" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'session-thumbnails' AND
    (auth.uid()::text = SPLIT_PART(path, '/', 1))
  ); 