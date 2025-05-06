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
              let isImage = false;
              let isVideo = false;
              let videoUrl = undefined;
              let imageUrl = post.url;
              
              // 1. Prioritize high-quality previews if available
              if (post.preview?.images?.[0]?.source?.url) {
                imageUrl = decodeHTMLEntities(post.preview.images[0].source.url);
                // Mark as image if post_hint agrees or URL looks like an image
                if (post.post_hint === 'image' || /\.(jpg|jpeg|png|gif|webp)$/i.test(imageUrl)) {
                  isImage = true;
                }
              }
              
              // 2. Handle Reddit Galleries - Use the first image
              else if (post.is_gallery && post.gallery_data && post.media_metadata) {
                const firstItem = post.gallery_data.items?.[0];
                if (firstItem && post.media_metadata[firstItem.media_id]) {
                  const mediaMeta = post.media_metadata[firstItem.media_id];
                  // Prefer highest quality preview ('p') or source ('s')
                  const bestPreview = mediaMeta.p?.[mediaMeta.p.length - 1] || mediaMeta.s;
                  if (bestPreview?.u) {
                    imageUrl = decodeHTMLEntities(bestPreview.u);
                    isImage = true; // Galleries are images
                  } else if (mediaMeta.s?.gif) {
                    imageUrl = decodeHTMLEntities(mediaMeta.s.gif);
                    isImage = true; // Handle animated gifs in galleries
                  }
                }
              }
              
              // 3. Handle Reddit Video
              else if (post.is_video && post.media?.reddit_video) {
                isVideo = true;
                videoUrl = post.media.reddit_video.fallback_url?.includes('DASHPlaylist')
                  ? post.media.reddit_video.fallback_url.replace(/DASHPlaylist.*/, 'DASH_720.mp4')
                  : post.media.reddit_video.fallback_url;
                // Use thumbnail as the primary image URL for videos if video player fails
                imageUrl = post.thumbnail;
              }
              
              // 4. Handle Rich Video (e.g., YouTube embeds, Gfycat)
              else if (post.post_hint === 'rich:video' && post.media?.oembed) {
                isVideo = true;
                // Attempt to use thumbnail, might need embed logic later
                imageUrl = post.media.oembed.thumbnail_url || post.thumbnail;
                // videoUrl might need to be derived from embed HTML if direct link not available
                if (post.preview?.reddit_video_preview?.fallback_url) {
                  videoUrl = post.preview.reddit_video_preview.fallback_url; // Sometimes available
                }
              }
              
              // 5. Handle direct image links
              else if (post.post_hint === 'image' || /\.(jpg|jpeg|png|gif|webp)$/i.test(post.url)) {
                isImage = true;
                imageUrl = post.url;
              }
              
              // 6. Handle direct video links (.mp4, .webm)
              else if (/\.(mp4|webm)$/i.test(post.url)) {
                isVideo = true;
                videoUrl = post.url;
                imageUrl = post.thumbnail; // Use thumbnail for preview
              }
              
              // 7. Handle Imgur .gifv
              else if (/imgur\.com.*\.gifv$/i.test(post.url)) {
                isVideo = true;
                videoUrl = post.url.replace('.gifv', '.mp4');
                imageUrl = post.thumbnail;
              }
              
              // 8. Handle Crossposts - Check parent for better media if current is insufficient
              if (!isImage && !isVideo && post.crosspost_parent_list?.length > 0) {
                console.log(`[Reddit] Post ${post.id} is a crosspost, checking parent...`);
                const crosspost = post.crosspost_parent_list[0];
                // Recursive call or simplified check? For now, simple check:
                if (crosspost.post_hint === 'image' || /\.(jpg|jpeg|png|gif|webp)$/i.test(crosspost.url)) {
                  imageUrl = crosspost.preview?.images?.[0]?.source?.url 
                             ? decodeHTMLEntities(crosspost.preview.images[0].source.url)
                             : crosspost.url;
                  isImage = true;
                  console.log(`[Reddit] Using image URL from crosspost parent: ${imageUrl}`);
                } else if (crosspost.is_video && crosspost.media?.reddit_video?.fallback_url) {
                  videoUrl = crosspost.media.reddit_video.fallback_url?.includes('DASHPlaylist')
                             ? crosspost.media.reddit_video.fallback_url.replace(/DASHPlaylist.*/, 'DASH_720.mp4')
                             : crosspost.media.reddit_video.fallback_url;
                  isVideo = true;
                  imageUrl = crosspost.thumbnail; // Use parent thumbnail
                  console.log(`[Reddit] Using video URL from crosspost parent: ${videoUrl}`);
                }
              }
              
              // Final cleanup & validation
              imageUrl = (imageUrl && imageUrl !== 'self' && imageUrl !== 'default') ? imageUrl : undefined;
              videoUrl = videoUrl || undefined;
              const thumbnailUrl = (post.thumbnail && post.thumbnail !== 'self' && post.thumbnail !== 'default') 
                                ? post.thumbnail 
                                : imageUrl; // Fallback thumbnail to main image if needed
              
              // Skip if no valid media URL is found after all checks
              if (!imageUrl && !videoUrl) {
                console.warn(`[Reddit] No valid media found for post ${post.id} (title: ${post.title})`);
                return null;
              }
              
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
                thumbnailUrl,
                isNSFW: post.over_18 || false
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