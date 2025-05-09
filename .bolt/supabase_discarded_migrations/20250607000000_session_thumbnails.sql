-- Add thumbnail_url column to joi_sessions table
ALTER TABLE joi_sessions ADD COLUMN thumbnail_url TEXT;

-- Add comment to explain the column
COMMENT ON COLUMN joi_sessions.thumbnail_url IS 'URL to the thumbnail image for the session'; 