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
  
  // Remove query parameters that break image loading
  if (cleanUrl.includes('.jpg?') || cleanUrl.includes('.png?') || cleanUrl.includes('.gif?') || cleanUrl.includes('.webp?')) {
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
                      // For v.redd.it URLs, use the direct URL without proxy
                      videoUrl = fallbackUrl;
                      
                      // If it's a DASH playlist, try to get a direct MP4 URL
                      if (videoUrl && videoUrl.includes('DASHPlaylist.mpd')) {
                          // For v.redd.it links, we can construct direct MP4 URL
                          // Try to get the highest quality available - start with 1080p and fallback to lower
                          const baseUrl = videoUrl.split('DASHPlaylist.mpd')[0];
                          
                          // Look for highest quality - Reddit often has 1080p, 720p, 480p, 360p, 240p variants
                          const qualities = ['1080', '720', '480', '360', '240'];
                          const bestQuality = qualities.find(q => post.media?.reddit_video?.resolutions?.includes(parseInt(q, 10)));
                          
                          videoUrl = `${baseUrl}DASH_${bestQuality || '720'}.mp4`;
                          console.log(`[Reddit Debug ${post.id}] Using highest quality MP4: ${videoUrl}`);
                      }
                      
                      // Clean up fallback parameters
                      if (videoUrl) {
                          videoUrl = videoUrl.replace('?source=fallback', '');
                      }
                  }
                  
                  // Use a high-quality thumbnail if available, otherwise the default thumbnail
                  // NSFW videos need special handling for previews
                  if (post.over_18 && post.preview?.images?.[0]?.variants?.nsfw?.source?.url) {
                    imageUrl = cleanRedditUrl(post.preview.images[0].variants.nsfw.source.url);
                    console.log(`[Reddit Debug ${post.id}] Using NSFW preview variant for video`);
                  } else if (post.preview?.images?.[0]?.source?.url) {
                    // Use the highest resolution preview available
                    imageUrl = cleanRedditUrl(post.preview.images[0].source.url);
                  } else {
                    imageUrl = post.thumbnail || '';
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
                  
                  // Get the first item in gallery
                  const firstItemId = post.gallery_data.items[0].media_id;
                  const firstItemMeta = post.media_metadata[firstItemId];
                  
                  // Find highest quality source
                  if (firstItemMeta?.s?.u) { 
                      // Source URL is often highest quality static
                      imageUrl = cleanRedditUrl(firstItemMeta.s.u);
                      console.log(`[Reddit Debug ${post.id}] Using gallery high-res source URL`);
                  } else if (firstItemMeta?.s?.gif) { 
                      // Some galleries have GIF sources
                      imageUrl = cleanRedditUrl(firstItemMeta.s.gif);
                      console.log(`[Reddit Debug ${post.id}] Using gallery GIF source URL`);
                  } else if (firstItemMeta?.p?.length > 0) { 
                      // Preview URLs as fallback - get highest resolution
                      const highestResPreview = firstItemMeta.p[firstItemMeta.p.length - 1];
                      imageUrl = cleanRedditUrl(highestResPreview.u);
                      console.log(`[Reddit Debug ${post.id}] Using gallery preview URL (resolution: ${highestResPreview.x}x${highestResPreview.y})`);
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
                  
                  // Priority 1: NSFW variant from preview if applicable
                  if (post.over_18 && post.preview?.images?.[0]?.variants?.nsfw?.source?.url) {
                      imageUrl = cleanRedditUrl(post.preview.images[0].variants.nsfw.source.url);
                      console.log(`[Reddit Debug ${post.id}] Using NSFW preview variant URL`);
                  } 
                  // Priority 2: Standard high-resolution source from preview
                  else if (post.preview?.images?.[0]?.source?.url) {
                      imageUrl = cleanRedditUrl(post.preview.images[0].source.url);
                      console.log(`[Reddit Debug ${post.id}] Using high-res preview source URL`);
                  } 
                  // Priority 3: Check if post.url itself is a *known* direct image host or has a clear image extension
                  else if (post.url && (
                    post.url.includes('i.redd.it/') || 
                    post.url.includes('i.imgur.com/') ||
                    /\.(jpg|jpeg|png|gif|webp)$/i.test(post.url) // Keep this check but as lower priority
                  )) {
                    imageUrl = cleanRedditUrl(post.url); // Clean the URL just in case
                    console.log(`[Reddit Debug ${post.id}] Using direct post.url as likely image source`);
                  }
                  // Fallback: If no other image source is found, we might have to skip or use thumbnail later
                  else {
                     console.log(`[Reddit Debug ${post.id}] No reliable image source found in preview or direct URL.`);
                     // imageUrl remains undefined for now
                  }
                  
                  // Refined Thumbnail Logic: Use explicit thumbnail first, fallback to derived imageUrl only if needed.
                  // `thumbnailUrl` was already potentially set earlier. Keep it if it's valid.
                  if (!thumbnailUrl && imageUrl) {
                    thumbnailUrl = imageUrl; // Fallback thumbnail to the main image URL if no explicit thumb exists
                    console.log(`[Reddit Debug ${post.id}] Setting thumbnail fallback to main image URL`);
                  } else if (thumbnailUrl) {
                     console.log(`[Reddit Debug ${post.id}] Using existing thumbnail URL: ${thumbnailUrl}`);
                  }

                  // If after all checks, imageUrl is still undefined, but we have a valid thumbnail, use that as the main image.
                  if (!imageUrl && thumbnailUrl) {
                    console.log(`[Reddit Debug ${post.id}] No main image found, falling back display to thumbnail URL`);
                    imageUrl = thumbnailUrl;
                  }
                  
                  // Log final derived URLs for images
                  console.log(`[Reddit Debug ${post.id}] Final Image URLs - Image: ${imageUrl}, Thumbnail: ${thumbnailUrl}`);

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