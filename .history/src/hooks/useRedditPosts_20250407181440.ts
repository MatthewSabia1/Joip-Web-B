import { useState, useEffect } from 'react';
import { Subreddit, RedditPost } from '@/types';
import { useRedditAuth } from '@/contexts/RedditAuthContext';
import { API_ENDPOINTS } from '@/lib/constants';

export function useRedditPosts(subredditNames: string[], refreshInterval: number) {
  const [subreddits, setSubreddits] = useState<Subreddit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { authState, getAccessToken } = useRedditAuth();

  const fetchPosts = async () => {
    if (subredditNames.length === 0) {
      setSubreddits([]);
      return;
    }

    // Check if user is authenticated with Reddit
    if (!authState.isAuthenticated) {
      // Clear existing results and indicate auth error (maybe via a special subreddit entry?)
      setSubreddits([{
        name: 'Authentication Required',
        posts: [],
        error: 'Please connect your Reddit account to view content'
      }]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const accessToken = await getAccessToken();
      
      if (!accessToken) {
        // Indicate token error (maybe via a special subreddit entry?)
         setSubreddits([{
          name: 'Token Error',
          posts: [],
          error: 'Failed to get Reddit access token. Please try reconnecting Reddit.'
        }]);
        setIsLoading(false);
        return; // Return early instead of throwing
      }

      console.log('[Reddit] Fetching posts for subreddits:', subredditNames);

      const results: Subreddit[] = [];
      
      for (const name of subredditNames) {
        try {
          // Fetch from Reddit's OAuth API endpoint
          const apiUrl = `${API_ENDPOINTS.REDDIT}/r/${name}/top?limit=10&t=week&raw_json=1`;
          
          console.log(`[Reddit] Fetching posts for r/${name} using authenticated Reddit API`);
          
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
              
              // Determine if post contains image or video
              const isImage = post.post_hint === 'image' || 
                           /\.(jpg|jpeg|png|gif)$/i.test(post.url);
              
              const isVideo = post.is_video || 
                           post.post_hint === 'hosted:video' || 
                           /\.(mp4|webm)$/i.test(post.url);
              
              // Handle video URLs from Reddit's media object
              let videoUrl = undefined;
              if (post.is_video && post.media?.reddit_video?.fallback_url) {
                videoUrl = post.media.reddit_video.fallback_url;
              }
              
              // Get best available image
              const imageUrl = post.url || 
                             post.preview?.images?.[0]?.source?.url || 
                             post.thumbnail;
              
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
                thumbnailUrl: post.thumbnail
              };
            })
            // Filter out null values and ensure we only include posts with media
            .filter((post: RedditPost | null) => post && (post.isImage || post.isVideo));
          
          results.push({
            name,
            posts
          });
          
          console.log(`[Reddit] Successfully fetched ${posts.length} posts for r/${name}`);
          
        } catch (err) {
          console.error(`[Reddit] Error fetching r/${name}:`, err);
          
          let errorMessage = err instanceof Error ? err.message : 'Unknown error';
          
          // Check for specific error patterns and provide more helpful messages
          if (err instanceof TypeError && err.message.includes('fetch')) {
            errorMessage = `Network error when fetching r/${name}. Please check your internet connection.`;
          } else if (err.name === 'AbortError') {
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
      
      setSubreddits(results);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unexpected error fetching posts';
      console.error('[Reddit] Unexpected top-level error:', err);
      // Optionally indicate a general failure
      setSubreddits([{
        name: 'General Error',
        posts: [],
        error: errorMessage
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();

    // Set up periodic refresh only if authenticated
    let intervalId: NodeJS.Timeout | undefined;
    if (authState.isAuthenticated) {
       intervalId = setInterval(fetchPosts, refreshInterval * 1000);
    }
    
    return () => clearInterval(intervalId);

  }, [subredditNames.join(','), refreshInterval, authState.isAuthenticated]);

  return { subreddits, isLoading, refetch: fetchPosts };
}