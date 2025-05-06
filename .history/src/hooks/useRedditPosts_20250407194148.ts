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

// Helper function to clean and decode Reddit URLs
function cleanRedditUrl(url: string): string {
  if (!url) return '';
  
  // First decode any HTML entities
  let cleanUrl = decodeHTMLEntities(url);
  
  // Reddit often has escaped characters in URLs
  cleanUrl = cleanUrl.replace(/&amp;/g, '&');
  
  // Fix common URL escaping issues
  cleanUrl = cleanUrl.replace(/\\"/g, '"')
                     .replace(/\\\//g, '/');
  
  // Reddit sometimes adds ?... parameters that break image loading
  if (cleanUrl.includes('.jpg?') || cleanUrl.includes('.png?') || cleanUrl.includes('.gif?')) {
    cleanUrl = cleanUrl.split('?')[0];
  }
  
  // Ensure HTTPS
  if (cleanUrl.startsWith('http://')) {
    cleanUrl = cleanUrl.replace('http://', 'https://');
  }
  
  return cleanUrl;
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
          // Fetch from Reddit's OAuth API endpoint - try 'hot' instead of 'top' for more variety
          const apiUrl = `${API_ENDPOINTS.REDDIT}/r/${name}/hot?limit=10&raw_json=1&include_over_18=true`;
          
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
              
              // Log if post is NSFW
              if (post.over_18) {
                console.log(`[Reddit] Processing NSFW post: ${post.id} (${post.title})`);
              }
              
              console.log('[Reddit] Post data:', JSON.stringify(post, null, 2).substring(0, 500) + '...');
              
              // --- Start Refactored Media Logic ---

              let imageUrl: string | undefined = undefined;
              let videoUrl: string | undefined = undefined;
              let isImage = false;
              let isVideo = false;
              let thumbnailUrl: string | undefined = (post.thumbnail && post.thumbnail !== 'self' && post.thumbnail !== 'default') ? post.thumbnail : undefined;

              console.log(`[Reddit Debug ${post.id}] Raw post data hint: ${post.post_hint}, url: ${post.url}, is_video: ${post.is_video}, is_gallery: ${post.is_gallery}`);
              // console.log(`[Reddit Debug ${post.id}] Full raw data:`, JSON.stringify(post).substring(0, 1000)); // Uncomment for extreme debugging

              // 1. Handle Reddit-Hosted Video (v.redd.it)
              if (post.is_video && post.media?.reddit_video) {
                  console.log(`[Reddit Debug ${post.id}] Type: Reddit Video`);
                  isVideo = true;
                  const fallbackUrl = post.media.reddit_video.fallback_url;
                  if (fallbackUrl) {
                      // Prioritize HLS or DASH URLs if available and playable, otherwise use fallback MP4 logic
                      videoUrl = fallbackUrl.includes('DASHPlaylist.mpd')
                          ? cleanRedditUrl(fallbackUrl.replace(/DASHPlaylist.mpd.*/, 'DASH_720.mp4')) // Attempt to get MP4
                          : cleanRedditUrl(fallbackUrl.replace('?source=fallback', '')); // Clean up fallback URL
                  }
                  
                  // NSFW videos need special handling for previews
                  if (post.over_18 && post.preview?.images?.[0]?.variants?.nsfw?.source?.url) {
                    imageUrl = cleanRedditUrl(post.preview.images[0].variants.nsfw.source.url);
                    console.log(`[Reddit Debug ${post.id}] Using NSFW preview variant for video`);
                  } else {
                    imageUrl = cleanRedditUrl(post.preview?.images?.[0]?.resolutions?.pop()?.url || post.preview?.images?.[0]?.source?.url || thumbnailUrl || '');
                  }
                  
                  thumbnailUrl = thumbnailUrl || imageUrl; // Ensure thumbnail exists if possible
                  
                  // Extra logging for NSFW videos
                  if (post.over_18) {
                    console.log(`[Reddit Debug ${post.id}] NSFW Reddit Video URLs - Video: ${videoUrl}, Image Preview: ${imageUrl}, Thumbnail: ${thumbnailUrl}`);
                  } else {
                    console.log(`[Reddit Debug ${post.id}] Reddit Video URLs - Video: ${videoUrl}, Image Preview: ${imageUrl}, Thumbnail: ${thumbnailUrl}`);
                  }
              }
              // 2. Handle Reddit Galleries
              else if (post.is_gallery && post.gallery_data?.items?.length > 0 && post.media_metadata) {
                  console.log(`[Reddit Debug ${post.id}] Type: Gallery`);
                  isImage = true; // Treat galleries primarily as images
                  const firstItemId = post.gallery_data.items[0].media_id;
                  const firstItemMeta = post.media_metadata[firstItemId];
                  if (firstItemMeta?.s?.u) { // Source URL (often highest quality static)
                      imageUrl = cleanRedditUrl(firstItemMeta.s.u);
                  } else if (firstItemMeta?.s?.gif) { // Source URL (GIF)
                       imageUrl = cleanRedditUrl(firstItemMeta.s.gif);
                  } else if (firstItemMeta?.p?.length > 0) { // Preview URLs (fallback)
                      imageUrl = cleanRedditUrl(firstItemMeta.p[firstItemMeta.p.length - 1].u); // Highest res preview
                  }
                  thumbnailUrl = thumbnailUrl || imageUrl;
                  console.log(`[Reddit Debug ${post.id}] Gallery URLs - Image: ${imageUrl}, Thumbnail: ${thumbnailUrl}`);
              }
              // 3. Handle Rich Videos (Gfycat, Redgifs, Imgur GIFV, Streamable etc.)
              else if (post.post_hint === 'rich:video' || (post.url && post.url.includes('.gifv'))) {
                   console.log(`[Reddit Debug ${post.id}] Type: Rich Video/Gifv`);
                   isVideo = true;
                   // Try preview first for a direct MP4/WebM if available (often is for gifv)
                   if (post.preview?.reddit_video_preview?.fallback_url) {
                       videoUrl = cleanRedditUrl(post.preview.reddit_video_preview.fallback_url.replace('?source=fallback', ''));
                   } else if (post.url.includes('.gifv')) {
                       videoUrl = cleanRedditUrl(post.url.replace('.gifv', '.mp4')); // Convert Imgur gifv
                   } else if (post.preview?.images?.[0]?.variants?.mp4?.source?.url) {
                       // Sometimes MP4 variant is hidden here
                       videoUrl = cleanRedditUrl(post.preview.images[0].variants.mp4.source.url);
                   }
                   // Use oembed thumbnail or post thumbnail as image representation
                   imageUrl = cleanRedditUrl(post.media?.oembed?.thumbnail_url || thumbnailUrl || '');
                   thumbnailUrl = thumbnailUrl || imageUrl;
                   console.log(`[Reddit Debug ${post.id}] Rich Video URLs - Video: ${videoUrl}, Image Preview: ${imageUrl}, Thumbnail: ${thumbnailUrl}`);
              }
              // 4. Handle Direct Image Links (including i.redd.it, imgur direct)
              else if (post.post_hint === 'image' || (post.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(post.url))) {
                  console.log(`[Reddit Debug ${post.id}] Type: Direct Image`);
                  isImage = true;
                  
                  // Prefer preview URL if it's higher res, otherwise use main URL
                  let previewUrl = '';
                  
                  // NSFW images often have special handling in the preview
                  if (post.over_18 && post.preview?.images?.[0]?.variants?.nsfw?.source?.url) {
                    // Try to use the NSFW variant directly if available (less common)
                    previewUrl = cleanRedditUrl(post.preview.images[0].variants.nsfw.source.url);
                    console.log(`[Reddit Debug ${post.id}] Using NSFW variant URL`);
                  } else if (post.preview?.images?.[0]?.source?.url) {
                    // Standard image preview source
                    previewUrl = cleanRedditUrl(post.preview.images[0].source.url);
                  }
                  
                  imageUrl = previewUrl || cleanRedditUrl(post.url);
                  thumbnailUrl = thumbnailUrl || imageUrl;
                  
                  // For NSFW content, extra logging to help debug issues
                  if (post.over_18) {
                    console.log(`[Reddit Debug ${post.id}] NSFW Image URLs - Direct: ${post.url}, Preview: ${previewUrl}, Final: ${imageUrl}`);
                  } else {
                    console.log(`[Reddit Debug ${post.id}] Direct Image URLs - Image: ${imageUrl}, Thumbnail: ${thumbnailUrl}`);
                  }
              }
              // 5. Handle Linked Videos (MP4/WebM direct links, less common)
              else if (post.post_hint === 'link' && post.url && /\.(mp4|webm)$/i.test(post.url)) {
                  console.log(`[Reddit Debug ${post.id}] Type: Linked Video`);
                  isVideo = true;
                  videoUrl = cleanRedditUrl(post.url);
                  imageUrl = thumbnailUrl; // Use thumbnail as image representation
                   console.log(`[Reddit Debug ${post.id}] Linked Video URLs - Video: ${videoUrl}, Image Preview: ${imageUrl}, Thumbnail: ${thumbnailUrl}`);
              }
              // 6. Handle Crossposts if no media found yet
              else if (!isVideo && !isImage && post.crosspost_parent_list?.length > 0) {
                  console.log(`[Reddit Debug ${post.id}] Type: Crosspost - Checking parent`);
                  // Basic check on parent's preview/URL - A recursive call would be more robust but complex
                  const parent = post.crosspost_parent_list[0];
                  if (parent.is_video && parent.media?.reddit_video?.fallback_url) {
                      isVideo = true;
                      videoUrl = cleanRedditUrl(parent.media.reddit_video.fallback_url.replace('?source=fallback', ''));
                      imageUrl = cleanRedditUrl(parent.preview?.images?.[0]?.source?.url || parent.thumbnail || '');
                      console.log(`[Reddit Debug ${post.id}] Using Crosspost Parent Video`);
                  } else if (parent.post_hint === 'image' || /\.(jpg|jpeg|png|gif|webp)$/i.test(parent.url)) {
                      isImage = true;
                      imageUrl = cleanRedditUrl(parent.preview?.images?.[0]?.source?.url || parent.url || '');
                       console.log(`[Reddit Debug ${post.id}] Using Crosspost Parent Image`);
                  }
                  thumbnailUrl = thumbnailUrl || imageUrl || parent.thumbnail;
              }

              // 7. Final Fallback - Use thumbnail as image if nothing else worked
              if (!isImage && !isVideo && thumbnailUrl) {
                 console.log(`[Reddit Debug ${post.id}] Type: Fallback to Thumbnail`);
                 isImage = true;
                 imageUrl = thumbnailUrl;
              }

              // Clean up undefined URLs
              imageUrl = imageUrl || undefined;
              videoUrl = videoUrl || undefined;
              thumbnailUrl = thumbnailUrl || imageUrl; // Fallback thumb to main image if needed

              // Skip if absolutely no media could be determined
              if (!isImage && !isVideo) {
                  console.warn(`[Reddit Skip ${post.id}] No media identified. URL: ${post.url}, Hint: ${post.post_hint}`);
                  return null;
              }

              // Log final derived values before returning
              console.log(`[Reddit Processed ${post.id}] Result - isImage: ${isImage}, isVideo: ${isVideo}, imageUrl: ${imageUrl}, videoUrl: ${videoUrl}, thumbnailUrl: ${thumbnailUrl}`);

              // --- End Refactored Media Logic ---
              
              return {
                id: post.id,
                title: post.title,
                url: imageUrl, // Primary URL for display (image or video preview)
                permalink: `https://reddit.com${post.permalink}`,
                author: post.author,
                subreddit: post.subreddit,
                created: post.created_utc,
                isImage,
                isVideo,
                videoUrl, // Specific URL for video playback
                thumbnailUrl, // Thumbnail specific URL
              };
            })
            // Filter out null values and ensure we only include posts with media
            .filter((post: RedditPost | null) => post && (post.isImage || post.isVideo));
            
          console.log(`[Reddit] Processed ${posts.length} posts with media for r/${name}`);
          
          // Add additional diagnostics
          if (response.ok) {
            console.log(`[Reddit] Successfully fetched data for r/${name}, status: ${response.status}`);
          }
          
          // Debug a sample post when available
          if (data?.data?.children?.length > 0) {
            const samplePost = data.data.children[0].data;
            console.log(`[Reddit] Sample post from r/${name}:`, {
              id: samplePost.id,
              title: samplePost.title.substring(0, 30) + '...',
              url: samplePost.url,
              post_hint: samplePost.post_hint,
              is_video: samplePost.is_video,
              thumbnailUrl: samplePost.thumbnail,
              hasPreview: !!samplePost.preview,
              over_18: samplePost.over_18
            });
            
            // If it has a preview, log the structure
            if (samplePost.preview) {
              console.log(`[Reddit] Preview structure for sample post:`, 
                JSON.stringify(samplePost.preview, null, 2).substring(0, 500) + '...');
            }
          }
          
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