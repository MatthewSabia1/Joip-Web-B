import { supabase } from '@/lib/supabase';

/**
 * Fetches a thumbnail URL from one of the given subreddits
 * @param subreddits List of subreddit names
 * @returns A Promise that resolves to a thumbnail URL or null if none found
 */
export const fetchSubredditThumbnail = async (subreddits: string[]): Promise<string | null> => {
  if (!subreddits || subreddits.length === 0) return null;
  
  try {
    // Pick a random subreddit from the list
    const randomSubreddit = subreddits[Math.floor(Math.random() * subreddits.length)];
    
    // Fetch posts from the subreddit
    const response = await fetch(`https://www.reddit.com/r/${randomSubreddit}/hot.json?limit=10`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch from subreddit: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Filter posts that have an image thumbnail
    const postsWithThumbnails = data.data.children.filter((post: any) => {
      const thumbnail = post.data.thumbnail;
      return thumbnail && 
             thumbnail !== 'self' && 
             thumbnail !== 'default' && 
             thumbnail !== 'nsfw' &&
             thumbnail.startsWith('http');
    });
    
    if (postsWithThumbnails.length === 0) {
      // If no thumbnails found in this subreddit, try another one recursively
      // But remove the current subreddit from the list to avoid infinite loops
      const remainingSubreddits = subreddits.filter(s => s !== randomSubreddit);
      if (remainingSubreddits.length > 0) {
        return fetchSubredditThumbnail(remainingSubreddits);
      }
      return null;
    }
    
    // Select the top post with a thumbnail
    const selectedPost = postsWithThumbnails[0];
    
    // Prefer the preview image over the thumbnail for better quality if available
    let thumbnailUrl = selectedPost.data.thumbnail;
    
    if (selectedPost.data.preview && 
        selectedPost.data.preview.images && 
        selectedPost.data.preview.images[0] &&
        selectedPost.data.preview.images[0].source &&
        selectedPost.data.preview.images[0].source.url) {
      thumbnailUrl = selectedPost.data.preview.images[0].source.url.replace(/&amp;/g, '&');
    }
    
    return thumbnailUrl;
  } catch (error) {
    console.error('Error fetching subreddit thumbnail:', error);
    return null;
  }
};

/**
 * Uploads a thumbnail from a URL to Supabase storage
 * @param userId User ID
 * @param sessionId Session ID
 * @param thumbnailUrl Remote thumbnail URL
 * @returns A Promise that resolves to the Supabase storage URL or null on error
 */
export const uploadThumbnailFromUrl = async (
  userId: string, 
  sessionId: string, 
  thumbnailUrl: string
): Promise<string | null> => {
  try {
    // Skip fetch and return early if it's already a Supabase URL
    if (thumbnailUrl.includes('storage.googleapis.com') || 
        thumbnailUrl.includes('supabase.co/storage') ||
        thumbnailUrl.includes('supabase.in/storage')) {
      return thumbnailUrl;
    }
    
    // Use an image proxy service to avoid CORS issues with Reddit images
    let imageUrl = thumbnailUrl;
    
    // Handle Reddit URLs specifically
    if (thumbnailUrl.includes('redd.it') || thumbnailUrl.includes('reddit.com')) {
      // Use an image proxy service to avoid CORS issues
      imageUrl = `https://images.weserv.nl/?url=${encodeURIComponent(thumbnailUrl)}`;
    }
    
    // Fetch the image
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error('Failed to fetch thumbnail image');
    
    // Convert to blob
    const blob = await response.blob();
    
    // Generate a unique filename
    const fileExt = 'jpg'; // Default to jpg for Reddit thumbnails
    const fileName = `${sessionId}-${Date.now()}.${fileExt}`;
    const filePath = `${userId}/session-thumbnails/${fileName}`;
    
    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('session-thumbnails')
      .upload(filePath, blob, { upsert: true });
    
    if (uploadError) throw uploadError;
    
    // Get the public URL
    const { data } = supabase.storage
      .from('session-thumbnails')
      .getPublicUrl(filePath);
    
    return data.publicUrl;
  } catch (error) {
    console.error('Error uploading thumbnail from URL:', error);
    return null;
  }
}; 