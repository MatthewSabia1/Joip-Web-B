import { useState, useEffect } from 'react';
import { Subreddit, RedditPost } from '@/types';
import { useRedditAuth } from '@/contexts/RedditAuthContext';
import { API_ENDPOINTS } from '@/lib/constants';

// Helper function to decode HTML entities in URLs
function decodeHTMLEntities(html: string): string {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = html;
  return textarea.value;
}

export function useRedditPosts(subredditNames: string[], refreshInterval: number) {
  const [subreddits, setSubreddits] = useState<Subreddit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { authState, getAccessToken } = useRedditAuth();

  const fetchPosts = async () => {
    if (subredditNames.length === 0) {
      setSubreddits([]);
      return;
    }

    // Check if user is authenticated with Reddit
    if (!authState.isAuthenticated) {
      setError('Please connect your Reddit account to view content');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get a fresh access token
      const accessToken = await getAccessToken();
      
      if (!accessToken) {
        throw new Error('Failed to get Reddit access token');
      }

      // console.log('[Reddit] Fetching posts for subreddits:', subredditNames); // Keep higher-level log in App.tsx if needed

      // Create an array to hold results for all subreddits
      const results: Subreddit[] = [];
      
      // Process each subreddit separately
      for (const name of subredditNames) {
        try {
          // Fetch from Reddit's OAuth API endpoint
          const apiUrl = `${API_ENDPOINTS.REDDIT}/r/${name}/top?limit=10&t=week&raw_json=1`;
          
          console.log(`[Reddit] Fetching posts for r/${name} using authenticated Reddit API`); // Keep this log as it indicates a specific API call
          
          const response = await fetch(apiUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            }
          });
          
          if (!response.ok) {
            console.error(`[Reddit] Error fetching r/${name}:`, response.status, response.statusText);
            throw new Error(`Reddit API error: ${response.status} ${response.statusText}`);
          }
          
          const data = await response.json();
          
          // Verify the expected data structure
          if (!data || !data.data || !Array.isArray(data.data.children)) {
            throw new Error('Invalid response format from Reddit API');
          }
          
          // Process posts
          const posts: RedditPost[] = data.data.children
            .map((child: any) => {
              const post = child.data;
              
              // Skip if the post is removed or deleted
              if (post.removed_by_category || post.removed) {
                return null;
              }
              
              console.log('[Reddit] Post data:', JSON.stringify(post, null, 2).substring(0, 500) + '...');
              
              // Correctly determine if post contains image or video
              let isImage = post.post_hint === 'image' || 
                           (post.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(post.url));
              
              let isVideo = post.is_video || 
                           post.post_hint === 'hosted:video' || 
                           post.post_hint === 'rich:video' ||
                           (post.url && /\.(mp4|webm|gifv)$/i.test(post.url));
              
              // Handle video URLs from Reddit's media object
              let videoUrl = undefined;
              if (post.is_video && post.media?.reddit_video?.fallback_url) {
                videoUrl = post.media.reddit_video.fallback_url;
              } else if (post.url && post.url.endsWith('.gifv')) {
                // Convert imgur gifv to mp4
                videoUrl = post.url.replace('.gifv', '.mp4');
              }
              
              // Get best available image with handling for common scenarios
              let imageUrl = post.url;
              
              // Handle special cases like imgur, reddit galleries, etc.
              if (post.preview?.images?.[0]?.source?.url) {
                // Reddit API returns encoded HTML entities in URLs which need to be decoded
                imageUrl = decodeHTMLEntities(post.preview.images[0].source.url);
              } else if (post.thumbnail && post.thumbnail !== 'self' && post.thumbnail !== 'default') {
                imageUrl = post.thumbnail;
              }
              
              // Fix imgur direct links without extensions
              if (imageUrl && imageUrl.match(/imgur\.com\/[a-zA-Z0-9]{7}(?!\.|\/)/)) {
                imageUrl = `${imageUrl}.jpg`;
              }
              
              // Handle crossposted content if original has better media
              if (!isImage && !isVideo && post.crosspost_parent_list?.length > 0) {
                const crosspost = post.crosspost_parent_list[0];
                if (crosspost.post_hint === 'image' || /\.(jpg|jpeg|png|gif|webp)$/i.test(crosspost.url)) {
                  isImage = true;
                  imageUrl = crosspost.url;
                } else if (crosspost.is_video && crosspost.media?.reddit_video?.fallback_url) {
                  isVideo = true;
                  videoUrl = crosspost.media.reddit_video.fallback_url;
                }
              }
              
              // Handle gallery posts (multiple images)
              if (post.is_gallery && post.gallery_data && post.media_metadata) {
                const mediaIds = post.gallery_data.items.map((item: any) => item.media_id);
                if (mediaIds.length > 0 && post.media_metadata[mediaIds[0]]) {
                  const firstImageMeta = post.media_metadata[mediaIds[0]];
                  if (firstImageMeta.s && firstImageMeta.s.u) {
                    imageUrl = decodeHTMLEntities(firstImageMeta.s.u);
                    isImage = true;
                  }
                }
              }
              
              // Ensure NSFW content is marked properly but still accessible
              const isNSFW = post.over_18 || false;
              
              return {
                id: post.id,
                title: post.title,
                url: imageUrl,
                permalink: `https://reddit.com${post.permalink}`,
                author: post.author,
                subreddit: post.subreddit,
                created: post.created_utc,
                isImage,
                isVideo,
                videoUrl,
                thumbnailUrl: post.thumbnail,
                isNSFW
              };
            })
            // Filter out null values and ensure we only include posts with media
            .filter((post: RedditPost | null) => post && (post.isImage || post.isVideo));
            
          console.log(`[Reddit] Processed ${posts.length} posts with media for r/${name}`);
          
          results.push({
            name,
            posts
          });
          
          // console.log(`[Reddit] Successfully fetched ${posts.length} posts for r/${name}`); // Removed verbose log
          
        } catch (err) {
          console.error(`[Reddit] Error fetching r/${name}:`, err);
          
          // Provide more descriptive error messages based on error type
          let errorMessage = err instanceof Error ? err.message : 'Unknown error';
          
          // Check for specific error patterns and provide more helpful messages
          if (err instanceof TypeError && err.message.includes('fetch')) {
            errorMessage = `Network error when fetching r/${name}. Please check your internet connection.`;
          } else if (err instanceof Error && err.name === 'AbortError') {
            errorMessage = `Request for r/${name} timed out. Please try again later.`;
          } else if (errorMessage.includes('403') || errorMessage.includes('forbidden')) {
            errorMessage = `Unable to access r/${name} - this may be a private or quarantined subreddit.`;
          } else if (errorMessage.includes('404') || errorMessage.includes('not found')) {
            errorMessage = `Subreddit r/${name} not found. Please check the spelling and try again.`;
          } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
            errorMessage = `Reddit API rate limit exceeded when fetching r/${name}. Please try again later.`;
          } else if (errorMessage.includes('500') || errorMessage.includes('502') || errorMessage.includes('503')) {
            errorMessage = `Reddit servers are currently experiencing issues while fetching r/${name}. Please try again later.`;
          }
          
          // Add the subreddit with error info but empty posts to results
          results.push({
            name,
            posts: [],
            error: errorMessage
          });
        }
      }
      
      // Set all subreddits results, even those with errors
      setSubreddits(results);
      
      // Only set overall error if ALL subreddits failed
      const allFailed = results.every(subreddit => subreddit.error);
      if (allFailed && results.length > 0) {
        setError('Failed to load any subreddits. Please try different subreddits or check your internet connection.');
      } else if (results.some(subreddit => subreddit.error)) {
        // If some but not all subreddits failed, set a warning but don't block the UI
        console.warn('[Reddit] Some subreddits failed to load, but others were successful');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch posts';
      setError(errorMessage);
      console.error('[Reddit] Error fetching Reddit posts:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch on mount and when subreddit names change
  useEffect(() => {
    if (authState.isAuthenticated) {
      fetchPosts();

      // Set up periodic refresh
      const intervalId = setInterval(fetchPosts, refreshInterval * 1000);
      
      return () => clearInterval(intervalId);
    } else {
      // Clear subreddits if not authenticated
      setSubreddits([]);
      setError('Please connect your Reddit account to view content');
    }
  }, [subredditNames.join(','), refreshInterval, authState.isAuthenticated]);

  return { subreddits, isLoading, error, refetch: fetchPosts };
}