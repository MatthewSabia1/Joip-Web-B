/*
  # Storage Setup for User Avatars

  1. Storage Buckets
    - Create 'avatars' bucket for storing user profile images
  
  2. Security
    - Set up RLS policies for the storage bucket
    - Allow users to manage their own avatar files
    - Allow public read access to avatars
*/

-- Create storage bucket for avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on objects table if not already enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Create policy for uploading avatars
CREATE POLICY "Users can upload their own avatars"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Create policy for updating avatars
CREATE POLICY "Users can update their own avatars"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Create policy for deleting avatars
CREATE POLICY "Users can delete their own avatars"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Create policy for public access to avatars
CREATE POLICY "Public access to avatars"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'avatars');